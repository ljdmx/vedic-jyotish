# 星墨吠陀｜观星录

> 一套以恒星黄道为基础的临时吠陀占星工作台，用纸墨天文手稿的视觉语言呈现排盘、问盘与流式解读。

**线上地址：** <https://vedicjyotish-zx73zald.manus.space>  
**源码仓库：** <https://github.com/ljdmx/vedic-jyotish-deployment>

## 页面预览

> 以下图片托管在 GitHub 的 `docs/screenshots/`，因此可在 GitHub README、第三方 Markdown 阅读器和公开仓库页面中直接显示。

![星墨吠陀首页预览](https://raw.githubusercontent.com/ljdmx/vedic-jyotish-deployment/main/docs/screenshots/vedic-jyotish-home.png)

![Prashna 卜问与定位回填预览](https://raw.githubusercontent.com/ljdmx/vedic-jyotish-deployment/main/docs/screenshots/vedic-jyotish-prashna.png)

## 产品能力

应用围绕“本次会话、无需建档”的工作方式构建。出生信息排盘、P1–P12 十二宫概览、职业与关系专项、双人合盘、出生时间候选比较、Prashna 卜问、Tajika 年度回归与 KP 资料核对均可在同一界面运行。所有报告只存在于当前浏览器会话，刷新后自动清除。

地点输入支持高德地址解析、选点与经纬度回填；服务端依据经纬度解析时区。Prashna 起盘不会预填 `480` 分钟，必须在定位后自动回填时区，避免未定位时误用默认偏移。

| 能力 | 实现方式 | 数据边界 |
| --- | --- | --- |
| 吠陀排盘 | `shared/` 内的恒星黄道、宫位、D1、KP、合盘与校时计算 | 本次请求内计算，不建档。 |
| 地图与时区 | 前端地图交互 + 服务端同源代理 + 时区查询 | 地图密钥不下发至浏览器。 |
| AI 解读 | 服务端兼容 Agnes、DeepSeek、Kimi、Qwen、GLM 与中转端点 | API Key 仅限本次会话或服务端环境使用。 |
| 流式展示 | SSE、事件序列、稳定 Markdown 块追加和尾部直写 | 报告仅保存在当前页面内存。 |

## 流式输出可靠性与体验

流式报告将模型增量写入轻量 DOM 容器，而不是对每个 token 触发 React 与完整 Markdown 重渲染。已闭合的 Markdown 块仅追加新增片段；尚未闭合的普通段落直接更新 `textContent`；完整报告结束后才用 `Streamdown` 定型一次。

| 场景 | 当前保护机制 | 用户可见结果 |
| --- | --- | --- |
| 重复或乱序事件 | 服务端事件序列 + 客户端 `sequence` 去重 | 已处理过的事件不会再次写入。 |
| 旧请求残留 | 会话令牌在新建、停止或打开历史报告时失效旧回调 | 旧流不能交错写入新报告。 |
| 上游重试 | `restart` 会清空临时流内容后重写 | 用户不会看到两份叠加的报告。 |
| 高频更新 | 约 100ms 合并刷新，滚动检查约 300ms 节流 | 降低长报告期间的布局与渲染压力。 |
| 上游停顿 | 500ms 提示“等待下一段”；8 秒提示可停止并重新生成；30 秒无数据中止 | 不会无限静默等待。 |
| 异常中断 | 未收到完成事件即报错，已产生内容保留在页面 | 用户可阅读部分结果并选择重试。 |

> 外部模型的首 token 速度、限流、思考模式和网络抖动仍会影响实际等待时间；本应用保证可见反馈、取消能力和中断边界，不能承诺所有供应商始终零停顿。

## 技术结构

```text
client/                 React + Vite 前端、页面、地图与流式展示
server/                 Express、tRPC、报告 SSE、地图与模型服务代理
shared/                 排盘、时区、Prashna、KP、模型配置与校验逻辑
client/public/images/   GitHub 中的纸墨背景图源码归档
docs/screenshots/       README 页面预览图，仅用于 GitHub 文档展示
```

仓库已移除不参与当前应用运行的数据库模板、模板元数据、组件生成配置、历史补丁与迁移审阅记录。保留 `package.json`、`pnpm-lock.yaml`、Vite/TypeScript/Vitest 配置和测试，以确保本地与生产构建可复现。

## 本地运行教程

### 1. 准备环境

请使用 Node.js 22 与 pnpm。克隆仓库后，在项目根目录安装依赖：

```bash
git clone https://github.com/ljdmx/vedic-jyotish-deployment.git
cd vedic-jyotish-deployment
pnpm install --frozen-lockfile
```

### 2. 配置服务器环境变量

创建仅用于本地开发的 `.env` 文件，并确保它不被提交。以下变量必须仅在服务端可见：

| 变量 | 用途 | 必填 |
| --- | --- | --- |
| `AGNES_API_KEY` | 默认 Agnes 报告模型调用 | 是 |
| `AMAP_WEB_SERVICE_KEY` | 地理编码、地点搜索与时区回填 | 是 |
| `AMAP_JS_API_KEY` | 高德 JS 地图加载 | 是 |
| `AMAP_SECURITY_JS_CODE` | 高德安全校验 | 是 |

地图浏览器请求通过服务端同源路径代理；AI 报告通过服务端转发。不要把上述密钥放入 `VITE_*` 变量、客户端源码或 Git 提交中。

### 3. 启动与验证

```bash
pnpm dev
pnpm test
pnpm check
pnpm build
```

开发服务器会输出本地预览地址。发布前应至少验证：首页加载、地点定位、Prashna 时区自动回填，以及一条报告流的开始、停止和中断恢复状态。

## 自托管线上部署教程

构建完成后，应用输出位于 `dist/`。生产环境应由平台注入端口和环境变量，不要在代码中写死端口。

```bash
pnpm install --frozen-lockfile
pnpm test && pnpm check && pnpm build
NODE_ENV=production pnpm start
```

部署平台需要支持一个 Node.js Web 进程、HTTPS 反向代理及持续 SSE 响应。请将上述四项密钥配置为平台的**服务端机密变量**，并在部署后执行一次真实报告流验证。

## Manus 发布教程

本仓库已连接到受管项目，当前公开地址为 <https://vedicjyotish-zx73zald.manus.space>。

1. 在项目的 **Settings → Secrets** 中配置 `AGNES_API_KEY`、`AMAP_WEB_SERVICE_KEY`、`AMAP_JS_API_KEY` 与 `AMAP_SECURITY_JS_CODE`；不要将值提交到 GitHub。
2. 通过预览页检查首页、Prashna 定位回填和报告流。每次改动后执行 `pnpm test && pnpm check && pnpm build`。
3. 保存一个项目版本（Checkpoint）。本项目启用自动发布，成功保存即自动更新 `manus.space` 公开站点。
4. 如需自定义域名，在 **Settings → Domains** 绑定域名并按界面提示完成 DNS 配置；完成后重新验证地图、SSE 和 HTTPS。

## GitHub 同步与文档资源

项目已关联 GitHub 主分支。保存受管项目版本会同步代码；若 GitHub 在本地开发期间也有改动，应先合并冲突，再保存新版本，避免覆盖远程变更。

背景图的源码归档位于 `client/public/images/`。README 截图专门保存在 `docs/screenshots/`，使用 GitHub Raw 地址引用，避免依赖受管存储权限或公开域名的跨站图片策略。更新 README 截图时，请同时更新 `docs/screenshots/` 中的文件并确认 GitHub 页面可见。

## 静态资源策略

GitHub 仓库保留 `client/public/images/` 中的背景图，便于自托管或源码归档。受管部署使用外部受管静态资源 URL，因此大尺寸图片不保留在部署工作区，避免构建包膨胀和部署超时。

## 免责声明

本应用用于占星资料整理、学习与观察，不应作为医疗、法律、投资、重大人生或即时决策的唯一依据。
