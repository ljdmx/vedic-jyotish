# 星墨吠陀｜观星录

本仓库是吠陀占星排盘与报告应用的部署源码。它从带数据库与用户能力的全栈模板迁移而来，因此保留了少量**不会参与当前站点运行**的初始化或开发辅助文件。

## 目录与文件用途

| 路径 | 分类 | 当前用途与依据 | 清理建议 |
| --- | --- | --- | --- |
| `client/` | **运行必需** | React 前端、页面、样式与地图交互；Vite 构建入口位于 `client/`。 | 保留。 |
| `server/` | **运行必需** | Express、tRPC、排盘计算服务、AI 与地图同源代理；`dev`、`build`、`start` 脚本均以 `server/_core/index.ts` 为入口。 | 保留。 |
| `shared/` | **运行必需** | 前后端共用的吠陀排盘、Prashna、KP、时区与模型配置逻辑。 | 保留。 |
| `client/public/images/` | **资源归档** | 纸墨背景图的 GitHub 源码备份；受管部署使用受管静态资源 URL，图片不放入部署工作区运行路径。 | 若仅保留受管部署，可改为单独资产仓库；若需要自托管 Vite，则保留。 |
| `package.json`、`pnpm-lock.yaml`、`vite.config.ts`、`tsconfig.json` | **构建必需** | 分别定义依赖锁定、Vite 构建和 TypeScript 编译。 | 保留。 |
| `drizzle/`、`drizzle.config.ts` | **模板遗留，可清理** | 来自 `web-db-user` 初始化模板；当前 `package.json` 没有数据库迁移脚本，源码检索仅命中 `drizzle/schema.ts` 自身，应用没有运行时 Drizzle 引用。 | 确认不恢复数据库、登录或资料存档后，可一起删除。 |
| `template.json` | **模板元数据，可清理** | 保存初始化模板的文件蓝图；不被当前 `dev`、`build`、`start` 或业务源码引用。 | 可从普通 GitHub 源码仓库删除；如需再次作为受管模板导入，可先留存副本。 |
| `components.json` | **开发辅助，可选** | shadcn/ui 组件生成器的别名和主题配置，不参与浏览器或服务器运行。 | 不再使用 shadcn CLI 添加组件时可删除。 |
| `patches/` | **开发依赖，暂不单独删除** | `package.json` 的 `pnpm.patchedDependencies` 指向其中的 Wouter 补丁。 | 只有移除对应 `pnpm` 配置并重新安装、验证依赖后才可删除。 |
| `vitest.config.ts`、`server/**/*.test.ts`、`client/**/*.test.ts`、`shared/**/*.test.ts` | **开发质量保障** | `pnpm test` 使用 Vitest 运行协议、时区、排盘和服务端安全回归测试；不打入生产运行时。 | 建议保留。 |
| `.prettierrc`、`.prettierignore`、`components.json` | **开发辅助，可选** | 格式化与组件生成工作流配置，不参与生产。 | 若不需要统一格式化或组件生成器，可清理。 |
| `streaming-review-notes.md` | **迁移审阅记录，可清理** | 记录多供应商流式协议调研结果；没有运行时引用。 | 若不需要保留技术决策历史，可删除或转入 `docs/`。 |
| `todo.md` | **受管项目工作清单** | 记录迁移、验证与变更状态；没有运行时引用。 | 当前受管工作流保留此文件；对外发布的精简源码可在独立导出分支中省略。 |
| `.gitkeep` | **占位文件，可选** | 用于让空目录在 Git 中可见。 | 对应目录不再需要为空目录时可删除。 |

## 建议的精简边界

如果目标是一个独立、可自托管的应用源码仓库，建议保留 `client/`、`server/`、`shared/`、构建配置、依赖锁文件、测试文件和背景图；将数据库模板、模板元数据和迁移审阅记录移除或转入独立的维护分支。

> 清理 `drizzle/`、`drizzle.config.ts`、`template.json`、`components.json` 或 `patches/` 前，应先执行 `pnpm test && pnpm build`。其中 `patches/` 必须与 `package.json` 内的 `pnpm.patchedDependencies` 同步处理，不能只删除目录。
