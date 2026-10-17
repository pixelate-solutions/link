import { chromium } from "@playwright/test";
const base = "http://localhost:3100";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const name = process.argv[2] ?? "Alex";
await page.goto(`${base}/sign-up`);
await page.fill("#dev-name", name);
await page.click("button[type=submit]");
await page.waitForURL(/welcome|home/, { timeout: 30000 });
await page.screenshot({ path: "/tmp/shots/01-welcome.png" });
if (page.url().includes("welcome")) {
  await page.fill("#goal", "I want to retire as soon as possible without completely sacrificing my lifestyle.");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Here's what Link heard", { timeout: 30000 });
  await page.screenshot({ path: "/tmp/shots/02-heard.png" });
  await page.click("text=Next");
  await page.waitForSelector("text=Connect your accounts");
  await page.screenshot({ path: "/tmp/shots/03-connect.png" });
  await page.click("text=Use demo data instead");
  await page.waitForURL(/home/, { timeout: 60000 });
}
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/shots/04-home-desktop.png", fullPage: true });
console.log(JSON.stringify({ url: page.url(), errors }, null, 1));
await browser.close();
