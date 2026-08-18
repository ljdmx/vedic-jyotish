import { expect, test } from "@playwright/test";

test.use({ launchOptions: { executablePath: "/usr/bin/chromium" } });

test("报告在跨模块切换时隐藏，并仅能从所属模块归档显式重新打开", async ({ page }) => {
  await page.route("**/api/trpc/model.status**", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([{ result: { data: { json: { configured: true } } } }]),
  }));
  await page.route("**/api/trpc/document.ingest**", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([{ result: { data: { json: {
      document: { fileName: "chart.png", persistence: "memory-only" },
      report: {
        id: -4101,
        stack: "document",
        module: "reader",
        title: "临时资料识读",
        resultMarkdown: "## 归档隔离回归\n\n这份内容只应在资料识读模块中重新打开。",
        createdAt: "2026-08-18T07:00:00.000Z",
        persistence: "memory-only",
      },
    } } } }]),
  }));

  await page.goto("http://127.0.0.1:3000/?module=reader", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "chart.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture-image"),
  });

  await expect(page.locator(".report-drawer")).toHaveCount(1);
  await expect(page.getByText("归档隔离回归")).toBeVisible();

  await page.locator('[data-module-id="p1p12"]').click();
  await expect(page.locator(".report-drawer")).toHaveCount(0);
  await expect(page.locator(".report-item")).toHaveCount(0);

  await page.locator('[data-module-id="reader"]').click();
  await expect(page.locator(".report-drawer")).toHaveCount(0);
  await expect(page.locator(".report-item")).toHaveCount(1);
  await page.locator(".report-item").click();
  await expect(page.locator(".report-drawer")).toHaveCount(1);
  await expect(page.getByText("这份内容只应在资料识读模块中重新打开。")).toBeVisible();
});
