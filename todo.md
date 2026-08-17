# Project TODO

- [x] 审阅 GitHub 源码、依赖、构建脚本与环境变量边界。
- [x] 迁移 `client/`、`server/` 与 `shared/` 中的应用源码并保持 tRPC 计算路由完整。
- [x] 迁移纸墨天文手稿视觉样式、字体配置及静态资源引用。
- [x] 保留高德地图选点、地址搜索与时区回填的服务端同源代理。
- [x] 保留由服务端 `AGNES_API_KEY` 调用的 AI 占星报告功能。
- [x] 以受管密钥配置 `AGNES_API_KEY`、`AMAP_WEB_SERVICE_KEY`、`AMAP_JS_API_KEY` 与 `AMAP_SECURITY_JS_CODE`，避免服务端密钥泄露。
- [x] 执行 TypeScript 检查、Vitest 测试与生产构建。
- [x] 验证首页及核心排盘工作流可访问，并保存可公开发布的版本。
- [x] 核查受管手稿图片与 favicon 的运行时引用，确认不存在遗留的项目内图片路径。
