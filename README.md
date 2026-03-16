# KK 群机器人（NapCat + OneBot + Canvas）

按功能分层的 Node.js 项目结构：
- `config`：环境变量与校验
- `integrations`：KK HTTP 请求封装
- `bot`：NapCat WS 连接与消息路由
- `features`：房间信息、更新信息的业务与绘图
- `app`：应用装配与启动

## 0. 项目用途

这个项目主要用于让群友在 QQ 群里直接查看 KK 平台地图房间信息和地图更新信息。  
不用每次都开电脑进入平台页面，也能快速知道当前有哪些房间、是否开局、最近更新了什么内容。

支持两条群命令：
- `房间信息`：查询房间列表（空参数走默认 mapId；有参数全部按房间名搜索）
- `更新信息`：查询地图最新更新日志（对应当前群 mapId）

错误处理：
- 接口请求失败会回发一张“请求失败”提示图（包含错误信息与“请联系bot管理员”）。
- 不再在群里发送 `生成失败：...` 文本。

## 1. 环境要求

- Node.js >= 18
- 可用的 NapCat/OneBot WebSocket 服务

安装依赖：

```bash
npm i ws canvas
```

## 2. 目录结构

```text
.
├── kkbot.js                     # 兼容入口（内部调用 ./src）
├── README.md
└── src
    ├── app.js                   # 应用装配（把 bot + features 连接起来）
    ├── index.js                 # src 入口导出
    ├── config
    │   └── index.js             # 环境变量解析与配置校验
    ├── integrations
    │   └── kk-api.js            # KK 接口请求封装
    ├── bot
    │   └── napcat-group-bot.js  # OneBot WS 连接、重连、命令路由
    └── features
        ├── room-info
        │   ├── service.js       # 房间查询路由 + 数据转换
        │   └── renderer.js      # 房间表格绘图
        └── changelog
            ├── service.js       # 更新日志查询 + HTML 转文本
            └── renderer.js      # 更新日志卡片绘图
```

## 3. 环境变量

可以复制 `.env.example` 生成 `.env` 后按需配置：

```bash
cp .env.example .env
```

程序会自动读取当前工作目录下的 `.env`（系统环境变量优先级更高）。

必填：
- `KK_TOKEN`

### KK_TOKEN 获取方式

方式一（网页控制台）：
1. 登录 [KK 平台](https://www.kkdzpt.com/) 账号。
2. 打开浏览器开发者工具（F12）控制台执行：

```js
JSON.parse(sessionStorage.getItem('user-global')).user.token;
```

说明：这种 token 通常有效期较短（你的使用经验约 1 天）。

方式二（小程序网络抓包）：
1. 对微信 KK 平台小程序抓包获取 token。
2. 这种 token 有效期通常更长（你的使用经验约 30 天）。

说明：实际有效期以平台策略为准，建议过期后及时更新。使用时请遵守平台规则与相关法律法规。

常用：
- `NAPCAT_WS_URL`：默认 `ws://127.0.0.1:3001/`
- `NAPCAT_TOKEN`：NapCat token（可选）
- `GROUP_IDS`：逗号分隔群号，例如 `123456789,987654321`
- `ROOM_INFO_TRIGGER_TEXT`：房间信息触发词，默认 `房间信息`
- `CHANGELOG_TRIGGER_TEXT`：更新信息触发词，默认 `更新信息`
- `COOLDOWN_MS`：每群每命令冷却毫秒，默认 `5000`
- `FETCH_TIMEOUT_MS`：接口请求超时毫秒，默认 `10000`
- `WS_RECONNECT_DELAY_MS`：WS 重连间隔毫秒，默认 `3000`

KK 相关：
- `KK_ROOMS_ENDPOINT`：房间接口基础地址
- `KK_CHANGELOGS_ENDPOINT`：更新日志接口地址
- `KK_DEFAULT_MAP_ID`：全局默认 mapId
- `GROUP_DEFAULT_MAP_IDS`：分群默认 mapId，格式 `群号:mapId;群号:mapId`
- `MAP_ALIASES`：地图别名，格式 `mapId,别名;mapId,别名`
- `KK_MAP_LIST_LIMIT`：按 mapId 查询房间时的 limit（默认 `32`）
- `KK_ROOM_NAME_LIST_LIMIT`：按 roomName 查询房间时的 limit（默认 `12`）
- `KK_CHANGELOG_LIMIT`：更新日志查询条数（默认 `1`）

渲染相关：
- `MAX_ROWS`：房间表格最多展示行数，默认 `18`
- `CANVAS_WIDTH`：房间表格画布宽度，默认 `974`
- `CHANGELOG_CANVAS_WIDTH`：更新日志画布宽度，默认 `920`
- `ERROR_CANVAS_WIDTH`：错误提示图宽度，默认 `860`

日志相关：
- `LOG_DIR`：日志目录，默认 `./logs`
- `LOG_FILE`：日志文件名，默认 `kkbot.log`

兼容项：
- `TRIGGER_TEXT`：等同 `ROOM_INFO_TRIGGER_TEXT`
- `ROOMS_URL`：旧版兼容变量，会自动取 endpoint 基础路径

## 4. 命令用法

- `房间信息`
  - 优先使用该群在 `GROUP_DEFAULT_MAP_IDS` 的默认 mapId
  - 未配置则回退到 `KK_DEFAULT_MAP_ID`
- `房间信息 生物星球`
  - 直接按 `roomName=生物星球` 搜索
- `房间信息 12860`
  - 也按 `roomName=12860` 搜索（不会再按 mapId 查询）

- `更新信息`
  - 按当前群默认 mapId 查询最新更新日志
- `更新信息 12860` 或 `更新信息 生物星球`
  - 允许临时指定 mapId 或别名后再查更新日志

## 5. 启动

```bash
npm start
```

## 6. 常见维护点

### 改默认群号
修改 `src/config/index.js` 里的 `DEFAULT_GROUP_IDS`。

### 改命令触发
修改环境变量 `ROOM_INFO_TRIGGER_TEXT`、`CHANGELOG_TRIGGER_TEXT`。

### 改排序逻辑
修改 `src/features/room-info/service.js` 的 `toTableModel()` 排序部分。

### 改房间图样式
修改 `src/features/room-info/renderer.js`。

### 改更新日志图样式
修改 `src/features/changelog/renderer.js`。

### 改消息路由/频控
修改 `src/bot/napcat-group-bot.js`。

## 7. 发布到 GitHub 前

- 不要提交 `.env`（已在 `.gitignore` 忽略）。
- 不要提交 `logs/`、`node_modules/`、`.npm-cache/`（已忽略）。
- 提交前建议先跑：

```bash
npm run check
```

首次上传（本地已 `git init`）：

```bash
git add .
git commit -m "feat: initial kkbot setup"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

## 8. 说明

- `kkbot.js` 作为兼容入口保留，便于继续沿用原启动命令。
- 生产环境建议使用进程守护工具（如 pm2/systemd）运行。
