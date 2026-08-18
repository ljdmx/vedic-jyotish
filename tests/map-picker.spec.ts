import { expect, test } from "@playwright/test";

test.use({ launchOptions: { executablePath: "/usr/bin/chromium" } });

test("Prashna 地图定位入口可打开选点对话框", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/?module=prashna", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "定位", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "地图选点" })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认选点" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭地图选点" })).toBeVisible();
});
