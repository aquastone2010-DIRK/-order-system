// 用法：PW=$(npm root -g)/playwright node render.mjs
// 將 kit-src.html 內每個 .frame 依 data-w × data-h 輸出到 img/<id>.jpg（data-type="png" 則輸出 png）
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const { chromium } = await import((process.env.PW || 'playwright') + (process.env.PW ? '/index.mjs' : ''));
const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1700, height: 2000 } });
await page.goto('file://' + path.join(dir, 'kit-src.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);
const frames = await page.$$eval('.frame', els => els.map(e => ({ id: e.id, w: +e.dataset.w, h: +e.dataset.h, type: e.dataset.type || 'jpeg' })));
for (const f of frames) {
  const el = await page.$('#' + f.id);
  const box = await el.boundingBox();
  if (Math.round(box.width) !== f.w || Math.round(box.height) !== f.h) throw new Error(`${f.id}: ${box.width}x${box.height} ≠ ${f.w}x${f.h}`);
  const ext = f.type === 'png' ? 'png' : 'jpg';
  await el.screenshot({ path: path.join(dir, 'img', `${f.id}.${ext}`), type: f.type === 'png' ? 'png' : 'jpeg', ...(f.type === 'png' ? {} : { quality: 88 }) });
  console.log(`${f.id}.${ext}  ${f.w}×${f.h}`);
}
await browser.close();
