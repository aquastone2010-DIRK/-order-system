// 端對端測試：多裝置（顧客手機×5、攤位平板、叫號電視）透過 Firestore 模擬器同步
// 執行：npm run test:e2e（需先安裝 Playwright 瀏覽器）
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EMU = '127.0.0.1';
// ES module 不能從 file:// 載入，用本機網頁伺服器提供頁面（正式環境為 GitHub Pages HTTPS）
const PORT = 5510;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/market.html`); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
const url = (f, q = '') => `http://127.0.0.1:${PORT}/${f}?emu=${EMU}${q}`;
const SHOTS = process.env.SHOTS;
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '｜' + detail : ''}`); };

// 在 Auth 模擬器建立攤位帳號
const STAFF = { email: 'yj@stall.test', pw: 'test-pass-123' };
await fetch(`http://${EMU}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: STAFF.email, password: STAFF.pw, returnSecureToken: true }),
});

// Firebase SDK 先快取到 tests/.cache（用 curl 下載一次），測試瀏覽器直接從快取載入 → 不受網路代理影響
const SDK = '10.12.0', CACHE = path.join(dir, 'tests', '.cache');
mkdirSync(CACHE, { recursive: true });
for (const f of ['firebase-app.js', 'firebase-firestore.js', 'firebase-auth.js']) {
  const out = path.join(CACHE, f);
  if (!existsSync(out)) execFileSync('curl', ['-sSf', '--retry', '3', '-o', out, `https://www.gstatic.com/firebasejs/${SDK}/${f}`]);
}
const browser = await chromium.launch();
const errors = [];
async function device(name, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.route(`https://www.gstatic.com/firebasejs/${SDK}/*`, r => r.fulfill({
    path: path.join(CACHE, path.basename(new URL(r.request().url()).pathname)),
    contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  p.on('dialog', d => d.accept(d.type() === 'prompt' ? '品項售完' : undefined));
  return p;
}
const waitCloud = p => p.waitForFunction(() => typeof MS !== 'undefined' && MS.mode, null, { timeout: 20000 }).then(() => p.evaluate(() => MS.mode));

async function order(p, picks) {
  for (const [brand, cat, item, opts = []] of picks) {
    await p.click(`[data-brand="${brand}"]`); await p.click(`[data-cat="${cat}"]`);
    await p.click(`[data-item="${item}"]`);
    for (const [k, v] of opts) await p.click(`[data-opt="${k}"][data-val="${v}"]`);
    await p.click('#mkAddBtn');
  }
  await p.click('#mkCheckout');
  await p.waitForSelector('#mkSheet .mk-done', { timeout: 15000 });
  return p.$$eval('#mkSheet .mk-done b', els => els.map(e => e.textContent));
}

// ── 顧客 1：楊家 A 套餐（拌麵）＋ 一杯紅珍奶 ──
const c1 = await device('顧客1', 390);
await c1.goto(url('market.html'));
check('顧客頁連上雲端', (await waitCloud(c1)) === 'cloud', await c1.evaluate(() => MS.error ? MS.error.message : ''));
const n1 = await order(c1, [['YJ', 'set', 'YJ-A', [['choice', '拌麵']]], ['RC', 'milk', 'RC-12', [['sugar', '半糖'], ['ice', '少冰']]]]);
check('顧客1 取號', n1.join(',') === 'Y001,R001', n1.join(','));
await c1.click('#mkOk');
if (SHOTS) await c1.screenshot({ path: `${SHOTS}/e2e-customer.png`, fullPage: false });

// ── N 位顧客同時下單楊家：取餐號不可重複（CROWD 環境變數可調，預設 5）──
const CROWD = Number(process.env.CROWD || 5);
const crowd = await Promise.all(Array.from({ length: CROWD }, (_, i) => device('顧客群' + (i + 1), 390)));
await Promise.all(crowd.map(p => p.goto(url('market.html'))));
await Promise.all(crowd.map(waitCloud));
for (const p of crowd) { await p.click('[data-brand="YJ"]'); await p.click('[data-cat="main"]'); await p.click('[data-item="YJ-M2"]'); await p.click('#mkAddBtn'); }
const t0 = Date.now();
const crowdNos = (await Promise.all(crowd.map(p => p.click('#mkCheckout')
  .then(() => p.waitForFunction(() => document.querySelector('#mkSheet .mk-done b') || /下單失敗/.test(document.querySelector('#toast').textContent), null, { timeout: 30000 }))
  .then(() => p.evaluate(() => (document.querySelector('#mkSheet .mk-done b') || {}).textContent || document.querySelector('#toast').textContent))))).sort();
const expectNos = Array.from({ length: CROWD }, (_, i) => 'Y' + String(i + 2).padStart(3, '0')).join(',');
check(`同時 ${CROWD} 人下單，取餐號不重複且連續`, crowdNos.join(',') === expectNos, `${crowdNos.join(',')}（${Date.now() - t0} ms）`);

// ── 叫號電視 ──
const tv = await device('叫號電視', 1920);
await tv.goto(url('board.html', '&site=TCH'));
await waitCloud(tv); await tv.waitForTimeout(800);
const making0 = await tv.$$eval('.b-making .b-list span', e => e.map(x => x.textContent));
check('電視顯示製作中（含待接單）', making0.length === CROWD + 2, making0.join(' '));

// ── 攤位平板：登入 → 接單 → 完成叫號 → 收款 → 已取餐 ──
const st = await device('楊家攤位', 1280);
await st.goto(url('stall.html', '&brand=YJ'));
await waitCloud(st);
check('未登入顯示登入畫面', !!(await st.$('#stLogin')));
await st.fill('#stEmail', 'wrong@stall.test'); await st.fill('#stPw', 'nope-nope'); await st.click('#stLogin');
await st.waitForFunction(() => document.querySelector('#stErr').textContent.length > 0);
check('錯誤帳密被拒', /錯誤|失敗/.test(await st.textContent('#stErr')), await st.textContent('#stErr'));
await st.fill('#stEmail', STAFF.email); await st.fill('#stPw', STAFF.pw); await st.click('#stLogin');
await st.waitForSelector('.st-board', { timeout: 15000 });
const newCol = await st.$$eval('.st-col:nth-child(1) .st-no', e => e.map(x => x.textContent));
check(`攤位看到 ${CROWD + 1} 張楊家新訂單`, newCol.length === CROWD + 1, newCol.join(' '));
const y1 = await st.evaluate(() => MS.orders.find(o => o.callNo === 'Y001').id);
await st.click(`[data-act="accept"][data-id="${y1}"]`); await st.waitForSelector(`[data-act="ready"][data-id="${y1}"]`);
await st.click(`[data-act="ready"][data-id="${y1}"]`); await st.waitForSelector(`[data-act="done"][data-id="${y1}"]`);
if (SHOTS) await st.screenshot({ path: `${SHOTS}/e2e-stall.png` });

// 電視與顧客即時看到「請取餐」
await tv.waitForFunction(() => [...document.querySelectorAll('.b-ready .b-num b')].some(b => b.textContent === 'Y001'), null, { timeout: 10000 });
check('電視即時顯示 Y001 請取餐', true);
if (SHOTS) await tv.screenshot({ path: `${SHOTS}/e2e-board.png` });
await c1.waitForFunction(() => /請取餐/.test(document.querySelector('#mkMine').textContent), null, { timeout: 10000 });
check('顧客手機即時顯示 Y001 請取餐', true, (await c1.textContent('#mkMine')).replace(/\s+/g, ' ').trim());

await st.click(`[data-act="pay-cash"][data-id="${y1}"]`);
await st.waitForFunction(id => MS.orders.find(o => o.id === id).paid, y1);
await st.click(`[data-act="done"][data-id="${y1}"]`);
await st.waitForFunction(id => MS.orders.find(o => o.id === id).status === 'done', y1);
check('收現金＋已取餐', true);

// 取消一張單，顧客看到原因
const y2 = await st.evaluate(() => MS.orders.find(o => o.callNo === 'Y002').id);
await st.click(`[data-act="cancel"][data-id="${y2}"]`);
await st.waitForFunction(id => MS.orders.find(o => o.id === id).status === 'cancelled', y2);
check('攤位取消訂單（附原因）', true);

// ── 售完：攤位關閉「蔥香雞絲飯」→ 顧客頁 B 套餐也停售 ──
await st.click('[data-stt="soldout"]');
await st.click('[data-so="YJ-M2"]');
await c1.click('[data-brand="YJ"]'); await c1.click('[data-cat="main"]');
await c1.waitForFunction(() => document.querySelector('[data-item="YJ-M2"]').disabled, null, { timeout: 10000 });
await c1.click('[data-cat="set"]');
const bSet = await c1.$eval('[data-item="YJ-B"]', b => ({ dis: b.disabled, txt: b.textContent.includes('售完') }));
check('售完即時同步到顧客頁（含 B 套餐）', bSet.dis && bSet.txt);

// ── 報表 ──
await st.click('[data-stt="report"]');
await st.waitForSelector('#rBody .kpi');
const kpi = await st.$$eval('#rBody .kpi', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
// 有效單：Y001 A 套餐 120 + 其餘雞絲飯 (CROWD−1)×60（Y002 已取消不計）；CROWD=5 時為 360
const expRev = 120 + (CROWD - 1) * 60;
check('報表營業額與筆數', kpi[0].startsWith('NT$' + expRev.toLocaleString('zh-TW')) && new RegExp(`${CROWD} 單，取消 1`).test(kpi[0]), kpi[0]);
check('報表已收款', kpi[1].startsWith('NT$120') && /現金 NT\$120/.test(kpi[1]), kpi[1]);

// ── 安全：顧客直接改訂單狀態 → 被規則拒絕 ──
const hack = await c1.evaluate(async id => { try { await window.QGCloud.updateOrder(id, { status: 'done', paid: true }); return 'allowed'; } catch (e) { return e.code; } }, y1);
check('顧客無法竄改訂單', hack === 'permission-denied', hack);
const hack2 = await c1.evaluate(async () => { try { await window.QGCloud.setSoldOut('YJ', 'YJ-M1', true); return 'allowed'; } catch (e) { return e.code; } });
check('顧客無法改售完', hack2 === 'permission-denied', hack2);

check('頁面無 JavaScript 錯誤', errors.length === 0, errors.join(' / '));
await browser.close();
console.log(fails ? `\n${fails} 項失敗` : '\n全部通過');
process.exit(fails ? 1 : 0);
