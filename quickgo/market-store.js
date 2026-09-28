'use strict';
// 美食街訂單資料層：雲端（Firebase，多裝置同步）或單機（localStorage 展示）使用同一套介面
// 需先載入 app-data.js（S、save、brandCode）與 menu-data.js
const MS = {
  mode: null,          // 'cloud' | 'local'
  orders: [],          // 目前監看中的訂單（已正規化）
  NOW: '__server_now__',
  error: null,
};

// 等待 cloud.js 載入；失敗或逾時改用單機展示
MS.init = function (timeoutMs = 6000) {
  const cfg = window.QG_CONFIG || {};
  const forceLocal = new URLSearchParams(location.search).get('backend') === 'local';
  if (cfg.backend !== 'firebase' || forceLocal) { MS.mode = 'local'; return Promise.resolve('local'); }
  return new Promise(resolve => {
    let done = false;
    const finish = (mode, err) => { if (done) return; done = true; MS.mode = mode; MS.error = err || null; resolve(mode); };
    const t = setTimeout(() => finish('local', new Error('連線逾時')), timeoutMs);
    const go = () => window.QGCloud.ready.then(() => { clearTimeout(t); finish('cloud'); }, e => { clearTimeout(t); finish('local', e); });
    if (window.QGCloud) go();
    else {
      window.addEventListener('qgcloud', go, { once: true });
      window.addEventListener('qgcloud-failed', () => { clearTimeout(t); finish('local', new Error('無法載入 Firebase')); }, { once: true });
    }
  });
};

// ── 單機模式 ──
function localMarketOrders(venue, date) {
  return S.tickets.filter(t => t.channel === 'market' && t.site === venue && (!date || t.date === date));
}
const localWatchers = new Set();
function emitLocal() { localWatchers.forEach(f => f()); }
window.addEventListener('storage', e => { if (e.key === KEY && e.newValue && MS.mode === 'local') emitLocal(); });

MS.watch = function (venue, date, cb) {
  if (MS.mode === 'cloud') return window.QGCloud.watchOrders(venue, date, list => { MS.orders = list; cb(list); }, e => toast('雲端同步中斷：' + e.code));
  const f = () => { MS.orders = localMarketOrders(venue, date).map(t => ({ ...t, venue: t.site })); cb(MS.orders); };
  localWatchers.add(f); f();
  return () => localWatchers.delete(f);
};

// groups: [{ brandId, lines:[{id,name,opt,qty,unit}], total }]
MS.place = async function ({ venue, date, dine, note, groups }) {
  groups = groups.map(g => ({ ...g, code: brandCode(g.brandId) }));
  if (MS.mode === 'cloud') return window.QGCloud.placeOrders({ venue, date, dine, note, groups });
  const out = [];
  for (const g of groups) {
    const seq = localMarketOrders(venue, date).filter(t => t.brandId === g.brandId).length + 1;
    const t = { id: uid('t'), no: ticketNo(date, venue), site: venue, venue, channel: 'market', brandId: g.brandId, date, seq,
      callNo: g.code + String(seq).padStart(3, '0'), lines: g.lines, total: g.total, dine, pay: 'counter', paid: false,
      status: 'new', createdAt: Date.now(), itemName: g.lines.map(l => `${l.name}×${l.qty}`).join('、') };
    if (note) t.note = note;
    S.tickets.push(t);
    out.push({ id: t.id, brandId: t.brandId, callNo: t.callNo, seq, total: t.total });
  }
  save(); emitLocal();
  return out;
};

MS.update = async function (id, patch) {
  if (MS.mode === 'cloud') return window.QGCloud.updateOrder(id, patch);
  const t = S.tickets.find(x => x.id === id);
  if (!t) throw new Error('查無訂單');
  for (const [k, v] of Object.entries(patch)) t[k] = v === MS.NOW ? Date.now() : v;
  save(); emitLocal();
};

MS.range = async function (venue, from, to) {
  if (MS.mode === 'cloud') return window.QGCloud.ordersInRange(venue, from, to);
  return localMarketOrders(venue).filter(t => t.date >= from && t.date <= to);
};

// 售完狀態
MS.watchMenu = function (brandId, cb) {
  if (MS.mode === 'cloud') return window.QGCloud.watchMenuState(brandId, st => cb(st.soldOut || {}));
  const f = () => cb(((S.menuState || {})[brandId] || {}).soldOut || {});
  localWatchers.add(f); f();
  return () => localWatchers.delete(f);
};
MS.setSoldOut = async function (brandId, itemId, v) {
  if (MS.mode === 'cloud') return window.QGCloud.setSoldOut(brandId, itemId, v);
  S.menuState = S.menuState || {};
  const m = (S.menuState[brandId] = S.menuState[brandId] || { soldOut: {} });
  m.soldOut[itemId] = v; save(); emitLocal();
};

// 攤位身分：雲端需 Email 登入；單機展示免登入
MS.isStaff = () => MS.mode === 'local' || (window.QGCloud && window.QGCloud.isStaff());
MS.staffEmail = () => (MS.mode === 'cloud' && window.QGCloud.user() && window.QGCloud.user().email) || '';
MS.signIn = (email, pw) => window.QGCloud.staffSignIn(email, pw);
MS.signOut = () => window.QGCloud.staffSignOut();
MS.onAuth = f => (MS.mode === 'cloud' ? window.QGCloud.onAuth(f) : () => {});

// 同步狀態標籤
MS.badge = () => MS.mode === 'cloud'
  ? '<span class="sync on" title="資料即時同步到雲端">● 雲端同步</span>'
  : `<span class="sync off" title="${esc(MS.error ? MS.error.message : '單機展示')}">● 單機展示（資料只在此裝置）</span>`;

// 載入 cloud.js 的標籤：<script type="module" src="cloud.js" onerror="qgCloudFailed()">
window.qgCloudFailed = () => window.dispatchEvent(new Event('qgcloud-failed'));
