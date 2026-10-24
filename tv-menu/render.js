// 用法：node render.js 網址 輸出.png 寬 高 [transparent]
const { chromium } = require('playwright');
(async () => {
  const [url, out, w, h, tr] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out, omitBackground: tr === 'transparent', clip: { x: 0, y: 0, width: +w, height: +h } });
  await b.close();
})();
