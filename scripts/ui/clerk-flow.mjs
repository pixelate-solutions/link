// Real-services check: Clerk sign-in, onboarding goal, Plaid Link launch, Ask (live model).
// QA_EMAIL / QA_PASSWORD must belong to a Clerk user; BASE_URL defaults to local dev.
import { chromium } from "@playwright/test";
const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp/shots";
const step = process.argv[2] ?? "signin";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, storageState: step === "signin" ? undefined : `${out}/clerk-state.json` });
const page = await ctx.newPage();
const errors = [];
const requests = new Set();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("request", (r) => { const u = new URL(r.url()); if (!u.hostname.includes("localhost") && !u.hostname.endsWith("vercel.app")) requests.add(u.hostname); });

if (step === "signin") {
  await page.goto(`${base}/sign-in`);
  await page.fill("input[name=identifier]", process.env.QA_EMAIL);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.fill("input[name=password]", process.env.QA_PASSWORD);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // New-device verification on development instances accepts 424242 for +clerk_test emails.
  await page.waitForURL(/welcome|home|client-trust|factor/, { timeout: 30000 });
  if (/client-trust|factor/.test(page.url())) {
    const code = page.locator("input[autocomplete='one-time-code'], input[name=code], input[inputmode=numeric]").first();
    await code.waitFor({ timeout: 15000 });
    await code.click();
    await page.keyboard.type("424242");
  }
  await page.waitForURL(/welcome|home/, { timeout: 30000 });
  await ctx.storageState({ path: `${out}/clerk-state.json` });
}

if (step === "signin" || step === "onboard") {
  await page.goto(`${base}/home`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/clerk-01-after-signin.png` });
  if (page.url().includes("welcome")) {
    if (await page.locator("#goal").isVisible().catch(() => false)) {
      await page.fill("#goal", "I want to retire as soon as possible without completely sacrificing my lifestyle.");
      await page.keyboard.press("Enter");
      await page.waitForSelector("text=Here's what Link heard", { timeout: 60000 });
      await page.click("text=Next");
    }
    await page.waitForSelector("text=Connect your accounts");
    await page.getByRole("button", { name: "Connect an account" }).click();
    const plaidFrame = page.frameLocator("iframe[id^='plaid-link-iframe']:visible");
    await plaidFrame.getByText("Continue without phone number").waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/clerk-02-plaid-link-open.png` });
    // Plaid sandbox: complete Link for real, so onSuccess → /api/plaid/exchange runs in the browser.
    const f = plaidFrame;
    const shot = (n) => page.screenshot({ path: `${out}/clerk-plaid-${n}.png` });
    await f.getByText("Continue without phone number").click();
    await page.waitForTimeout(1500); await shot("a");
    const search = f.locator("input[type=search], input[placeholder*='Search'], input[aria-label*='Search']").first();
    await search.fill("First Platypus");
    await page.waitForTimeout(1500); await shot("b");
    await f.getByText("First Platypus Bank").first().click();
    await page.waitForTimeout(2000); await shot("c");
    if (await f.getByText("associated institutions").isVisible().catch(() => false)) {
      await f.getByText("First Platypus Bank", { exact: true }).last().click();
      await page.waitForTimeout(2000);
    }
    // Some institution flows show a "Continue to login" interstitial.
    const cont = f.getByRole("button", { name: /continue/i }).first();
    if (await cont.isVisible().catch(() => false) && !(await f.locator("input[name=username], input[id*=username]").first().isVisible().catch(() => false))) await cont.click();
    await page.waitForTimeout(1500); await shot("d");
    await f.locator("input[name=username], input[id*=username], input[type=text]").first().fill("user_good");
    await f.locator("input[name=password], input[type=password]").first().fill("pass_good");
    await f.getByRole("button", { name: /submit|continue|log in|sign in/i }).first().click();
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(2500);
      await shot(`e${i}`);
      if (page.url().includes("/home")) break;
      const btn = f.getByRole("button", { name: /^(continue|share data|connect account information|allow|confirm|finish|done)/i }).first();
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
    }
    await page.waitForURL(/home/, { timeout: 60000 });
  }
  await ctx.storageState({ path: `${out}/clerk-state.json` });
}

if (step === "app") {
  for (const path of ["home", "activity", "plan"]) {
    await page.goto(`${base}/${path}`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/clerk-${path}.png`, fullPage: true });
  }
  await page.goto(`${base}/home`);
  await page.click("text=Ask Link");
  await page.fill("#ask-input", "What are the three most important things I can do to retire sooner?");
  await page.keyboard.press("Enter");
  // The send button re-enables (busy=false) once the stream finishes.
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="Send"]');
    const live = document.querySelector('[aria-live="polite"]');
    return live && live.textContent && live.textContent.length > 200 && b && !document.querySelector(".animate-ping");
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/clerk-ask.png` });
}
console.log(JSON.stringify({ step, url: page.url(), thirdPartyHosts: [...requests].sort(), errors }, null, 1));
await browser.close();
