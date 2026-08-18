import { expect, test } from "@playwright/test";

test.use({ launchOptions: { executablePath: "/usr/bin/chromium" } });

test("本次会话模型配置可选择 Bai，并显示默认模型和临时密钥输入", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/?module=p1p12", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "配置本次会话的 AI 模型" }).click();
  await page.getByRole("button", { name: "模型供应商" }).click();
  await page.getByRole("option", { name: "Bai（b.ai）" }).click();

  await expect(page.getByRole("button", { name: "模型供应商" })).toContainText("Bai（b.ai）");
  await expect(page.getByPlaceholder("gpt-5.2")).toHaveValue("gpt-5.2");
  await expect(page.getByPlaceholder("仅在本次页面会话与请求中使用")).toBeVisible();
});
