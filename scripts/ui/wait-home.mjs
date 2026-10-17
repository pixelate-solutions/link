// Opens Home and waits for the first sync to finish (Syncing → picture).
import { chromium } from "@playwright/test";
const base = process.env.BASE_URL ?? "http://localhost:3100";
const b = await chromium.launch();
const c = await b.newContext({ storageState: `${process.env.OUT ?? "/tmp/shots"}/clerk-state.json`, viewport: { width: 1280, height: 860 } });
const p = await c.newPage();
const t0 = Date.now();
await p.goto(`${base}/home`);
const synced = await p.waitForSelector("text=Safe to spend", { timeout: 300_000 }).then(() => true).catch(() => false);
console.log(JSON.stringify({ synced, seconds: Math.round((Date.now() - t0) / 1000), url: p.url() }));
await p.screenshot({ path: `${process.env.OUT ?? "/tmp/shots"}/clerk-home-synced.png`, fullPage: true });
await b.close();
