import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./vite";
import { handleReportStream } from "../stream";
import { resolveAmapContentType } from "./amapProxy";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  app.use("/_AMapService", async (req, res) => {
    const securityJsCode = process.env.AMAP_SECURITY_JS_CODE;
    if (!securityJsCode) {
      return res.status(503).json({ status: "0", info: "高德地图安全密钥尚未配置" });
    }

    const upstream = new URL(
      req.originalUrl.replace("/_AMapService", "") || "/",
      "https://restapi.amap.com"
    );
    upstream.searchParams.set("jscode", securityJsCode);

    try {
      const response = await fetch(upstream);
      const body = await response.text();
      res.status(response.status).set("Content-Type", resolveAmapContentType(response.headers.get("content-type"), upstream)).send(body);
    } catch {
      res.status(502).json({ status: "0", info: "高德地图服务暂时不可用" });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // AI 报告流式端点：SSE 实时输出，与 report.run 共享校验逻辑
  app.post("/api/stream/report", handleReportStream);
  // 管理预览经由代理提供页面；Vite HMR 升级连接无法可靠透传，并会向浏览器
  // 注入失败的 WebSocket 客户端。始终服务已构建静态产物，避免开发态脚本进入预览。
  serveStatic(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
