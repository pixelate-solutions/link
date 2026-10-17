// Visual QA: signs up a fresh dev user, onboards with demo data, captures every
// screen at phone/tablet/desktop in light and dark, and exercises key flows.
import { chromium } from "@playwright/test";
const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp/shots";
const name = `Qa${Date.now().toString(36)}`;
const browser = await chromium.launch();
const errors = [];
async function ctxFor(viewport, colorScheme, storageState) {
  const ctx = await browser.newContext({ viewport, colorScheme, storageState, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${viewport.width}/${colorScheme}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${viewport.width}/${colorScheme}: ${m.text()}`));
  return { ctx, page };
}
// Onboard once.
const { ctx, page } = await ctxFor({ width: 1280, height: 860 }, "light");
await page.goto(`${base}/sign-up`);
await page.fill("#dev-name", name);
await page.click("button[type=submit]");
await page.waitForURL(/welcome/);
await page.fill("#goal", "I want to retire as soon as possible without completely sacrificing my lifestyle.");
await page.keyboard.press("Enter");
await page.waitForSelector("text=Here's what Link heard");
await page.click("text=Next");
await page.click("text=Use demo data instead");
await page.waitForURL(/home/, { timeout: 60000 });
const state = await ctx.storageState();

const sizes = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1280, height: 860 } };
for (const [label, viewport] of Object.entries(sizes)) {
  for (const scheme of ["light", "dark"]) {
    if (label === "tablet" && scheme === "dark") continue;
    const { ctx: c, page: p } = await ctxFor(viewport, scheme, state);
    for (const path of ["home", "activity", "plan"]) {
      await p.goto(`${base}/${path}`);
      await p.waitForTimeout(700);
      await p.screenshot({ path: `${out}/${path}-${label}-${scheme}.png`, fullPage: true });
    }
    await c.close();
  }
}

// Interactions (phone, light).
const { ctx: c2, page: p2 } = await ctxFor(sizes.phone, "light", state);
await p2.goto(`${base}/activity`);
await p2.locator("ul li button").first().click();
await p2.waitForSelector("text=Category");
await p2.waitForTimeout(500);
await p2.screenshot({ path: `${out}/flow-transaction-sheet.png` });
await p2.keyboard.press("Escape");
await p2.goto(`${base}/plan`);
await p2.click("text=Spend $300 less a month");
await p2.waitForSelector("text=Make this my plan");
await p2.waitForTimeout(400);
await p2.screenshot({ path: `${out}/flow-what-if.png`, fullPage: true });
await p2.goto(`${base}/home`);
await p2.click("nav >> text=Ask");
await p2.fill("#ask-input", "What if I had a child in two years?");
await p2.keyboard.press("Enter");
await p2.waitForTimeout(1500);
await p2.waitForFunction(() => { const l = document.querySelector('[aria-live="polite"]'); return l && l.textContent.length > 150 && !document.querySelector(".animate-ping"); }, null, { timeout: 120000 });
await p2.waitForTimeout(800);
await p2.screenshot({ path: `${out}/flow-ask.png` });
await p2.keyboard.press("Escape");
await p2.goto(`${base}/home`);
await p2.getByRole("button", { name: "Account and settings" }).first().click();
await p2.waitForSelector("text=Connected accounts");
await p2.waitForTimeout(800);
await p2.screenshot({ path: `${out}/flow-account-sheet.png` });
await p2.locator("text=Your businesses").scrollIntoViewIfNeeded();
await p2.waitForTimeout(400);
await p2.screenshot({ path: `${out}/flow-account-businesses.png` });
await c2.close();
console.log(JSON.stringify({ user: name, errors }, null, 1));
await browser.close();
