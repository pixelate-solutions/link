// Live production check: Clerk sign-in, onboarding, Plaid production Link opens, Ask (live model).
import { chromium } from "@playwright/test";
const base = process.env.BASE_URL ?? "https://link-omega.vercel.app";
const out = process.env.OUT ?? "/tmp/shots/prod";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errors = [];
const hosts = new Set();
const api = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
page.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });

await page.goto(`${base}/sign-in`);
await page.fill("input[name=identifier]", process.env.QA_EMAIL);
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.fill("input[name=password]", process.env.QA_PASSWORD);
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.waitForURL(/welcome|home|client-trust|factor/, { timeout: 30000 });
if (/client-trust|factor/.test(page.url())) {
  const code = page.locator("input[autocomplete='one-time-code'], input[name=code], input[inputmode=numeric]").first();
  await code.waitFor({ timeout: 15000 });
  await code.click();
  await page.keyboard.type("424242");
}
await page.waitForURL(/welcome|home/, { timeout: 30000 });
await page.goto(`${base}/home`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${out}/01-after-signin.png` });
if (page.url().includes("welcome")) {
  await page.fill("#goal", "I want to retire as soon as possible without completely sacrificing my lifestyle.");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Here's what Link heard", { timeout: 60000 });
  await page.screenshot({ path: `${out}/02-heard.png` });
  await page.click("text=Next");
  await page.waitForSelector("text=Connect your accounts");
  await page.getByRole("button", { name: "Connect an account" }).click();
  const f = page.frameLocator("iframe[id^='plaid-link-iframe']:visible");
  await f.locator("text=/phone|Continue|Get started/i").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/03-plaid-production-link.png` });
  await page.reload();
  await page.click("text=Skip for now");
  await page.waitForURL(/home/, { timeout: 30000 });
}
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${out}/04-home.png`, fullPage: true });
await page.click("text=Ask Link");
await page.fill("#ask-input", process.env.QUESTION ?? "I'm 38. Without any accounts connected yet, what do you need from me to plan an early retirement?");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await page.waitForFunction(() => {
  const live = document.querySelector('[aria-live="polite"]');
  return live && live.textContent && live.textContent.length > 150 && !document.querySelector(".animate-ping");
}, null, { timeout: 120000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/05-ask.png` });
const answer = await page.locator('[aria-live="polite"]').innerText();
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Account and settings" }).first().click();
await page.waitForSelector("text=Connected accounts");
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/06-account.png` });
for (const path of ["plan", "activity"]) {
  await page.goto(`${base}/${path}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/07-${path}.png`, fullPage: true });
}
console.log(JSON.stringify({ url: page.url(), hosts: [...hosts].filter((h) => !h.includes("clerk")).sort(), api, errors, answer: answer.slice(-900) }, null, 1));
await browser.close();
