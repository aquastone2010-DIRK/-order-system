'use strict';
// 快取GO：全域狀態、示範資料、儲存、查詢與會員回饋
const Q = QGCore;
const KEY = 'quickgo_v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'NT$' + Math.round(n).toLocaleString('zh-TW');
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const TODAY = () => Q.ymd(new Date());
const fmtTime = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const fmtDate = d => `${d.slice(5).replace('-', '/')}（${WD[Q.weekday(d)]}）`;

let S;              // 全域狀態
let curView = 'app';
let curSite = null;

// ════════════════════════════════════════════════════════════
// 示範資料（固定亂數種子，可重現）
// ════════════════════════════════════════════════════════════
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function defaultCfg() {
  return {
    cutoffTime: '10:00', earlyBirdTime: '17:00', earlyBirdDiscount: 5,
    flashEnabled: true, flashTime: '13:00', flashPct: 70,
    forecastWeeks: 4, safetyPct: 10, fallbackWalkinPct: 25,
    slotStart: '11:30', slotEnd: '13:00', slotMinutes: 15,
    avgMakeSec: 150, stations: 2, targetSec: 30,
    pointPerDollars: 10, stampGoal: 10, streakBonusDays: 5, streakBonus: 50,
    passCap: 120, redeemPoints: 100, redeemValue: 10,
    demoIgnoreCutoff: true,
    marketMode: 'closed', callDigits: 4, concurrentCalls: 20,
  };
}

function seed() {
  const r = rng(20260928);
  const pick = a => a[Math.floor(r() * a.length)];
  const today = TODAY();
  const sites = [
    { id: 'F12A', name: 'F12A 廠 B1 員工餐廳', lockers: 24, base: 38 },
    { id: 'F12B', name: 'F12B 廠 3F 休息區', lockers: 16, base: 22 },
    { id: 'F15', name: 'F15 研發大樓 1F', lockers: 16, base: 26 },
  ];
  const brands = [
    { id: 'QG', name: '快取GO 中央廚房', status: 'active', commissionPct: 0, contact: '自營', sites: ['F12A', 'F12B', 'F15'] },
    { id: 'BX', name: '禾豐便當', status: 'active', commissionPct: 15, contact: '合作品牌 A', sites: ['F12A', 'F15'] },
    { id: 'GR', name: '綠拾輕食', status: 'active', commissionPct: 18, contact: '合作品牌 B', sites: ['F12A', 'F12B'] },
    { id: 'NP', name: '麵食品牌（洽談中）', status: 'negotiating', commissionPct: 15, contact: '待簽約', sites: [] },
  ];
  const ingredients = {
    rice: { name: '白米', packGrams: 10000, packPrice: 650 },
    chicken: { name: '雞肉（腿/胸）', packGrams: 5000, packPrice: 900 },
    beef: { name: '牛腩', packGrams: 3000, packPrice: 1350 },
    fish: { name: '鯖魚片', packGrams: 5000, packPrice: 1100 },
    veg: { name: '時蔬', packGrams: 5000, packPrice: 300 },
    sauce: { name: '醬料', packGrams: 2000, packPrice: 260 },
    curry: { name: '咖哩醬', packGrams: 1000, packPrice: 280 },
    grain: { name: '藜麥穀物', packGrams: 2000, packPrice: 420 },
  };
  const catalog = [
    { id: 'T1', name: '照燒雞腿便當', emoji: '🍗', brandId: 'QG', price: 100, bom: [{ ing: 'rice', grams: 220 }, { ing: 'chicken', grams: 180 }, { ing: 'veg', grams: 120 }, { ing: 'sauce', grams: 30 }] },
    { id: 'T2', name: '紅燒牛腩飯', emoji: '🍛', brandId: 'BX', price: 120, bom: [{ ing: 'rice', grams: 220 }, { ing: 'beef', grams: 150 }, { ing: 'veg', grams: 100 }, { ing: 'sauce', grams: 40 }] },
    { id: 'T3', name: '蔬食咖哩', emoji: '🥘', brandId: 'GR', price: 90, bom: [{ ing: 'rice', grams: 200 }, { ing: 'veg', grams: 220 }, { ing: 'curry', grams: 60 }] },
    { id: 'T4', name: '鹽烤鯖魚定食', emoji: '🐟', brandId: 'QG', price: 115, bom: [{ ing: 'rice', grams: 200 }, { ing: 'fish', grams: 160 }, { ing: 'veg', grams: 120 }] },
    { id: 'T5', name: '舒肥雞胸沙拉碗', emoji: '🥗', brandId: 'GR', price: 105, bom: [{ ing: 'chicken', grams: 150 }, { ing: 'veg', grams: 200 }, { ing: 'grain', grams: 80 }] },
    { id: 'T6', name: '三杯雞便當', emoji: '🍱', brandId: 'BX', price: 100, bom: [{ ing: 'rice', grams: 220 }, { ing: 'chicken', grams: 170 }, { ing: 'veg', grams: 110 }, { ing: 'sauce', grams: 30 }] },
  ];
  const tiers = [
    { name: '綠卡', minPoints: 0, discountPct: 0, cls: '' },
    { name: '銀卡', minPoints: 1000, discountPct: 3, cls: 't1' },
    { name: '金卡', minPoints: 3000, discountPct: 5, cls: 't2' },
  ];
  const passes = [
    { id: 'P5', name: '5 餐券', meals: 5, price: 475 },
    { id: 'P10', name: '10 餐券', meals: 10, price: 900 },
    { id: 'P20', name: '20 餐券（輪班族）', meals: 20, price: 1700 },
  ];
  // 員工
  const sur = ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪'];
  const giv = ['家豪', '怡君', '志明', '雅婷', '俊傑', '淑芬', '建宏', '佩珊', '冠宇', '詩涵', '宗翰', '欣怡', '承恩', '思妤', '柏翰'];
  const depts = ['製程整合', '設備工程', '良率工程', '研發', '廠務', '品保', '資訊', '人資'];
  const employees = [];
  // 工號：從 10001–18000（約 8000 人規模的編號空間）隨機抽 150 個，模擬真實名冊的末碼分布
  const nums = new Set();
  while (nums.size < 150) nums.add(10001 + Math.floor(r() * 8000));
  const numList = [...nums].sort((a, b) => a - b);
  for (let i = 0; i < 150; i++) {
    const id = 'E' + numList[i];
    const lifetime = Math.floor(r() * 4200);
    employees.push({
      id, name: pick(sur) + pick(giv), dept: pick(depts), site: sites[i % 3].id, card: '8800' + numList[i],
      points: Math.floor(lifetime * 0.4), lifetime, stamps: Math.floor(r() * 10), passes: [],
      coupons: [{ id: 'c' + id, type: 'amount', value: 20, label: '新會員 NT$20 券', exp: Q.addDays(today, 30) }],
      lastStreakBonus: null,
    });
  }
  // 菜單：今天起 7 天，每日 3–5 套
  const menus = {};
  const counts = [5, 4, 4, 5, 3, 4, 5];
  for (let i = 0; i < 7; i++) {
    const d = Q.addDays(today, i);
    const n = counts[i];
    menus[d] = Array.from({ length: n }, (_, j) => ({ id: catalog[(i + j) % catalog.length].id, capacity: 120 }));
  }
  // 歷史（過去 63 天、每場域）
  const dow = [0.45, 1.05, 1.0, 0.95, 1.0, 1.15, 0.5];
  const history = [];
  for (let i = 63; i >= 1; i--) {
    const d = Q.addDays(today, -i);
    for (const s of sites) {
      const f = dow[Q.weekday(d)];
      history.push({ date: d, site: s.id, pre: Math.round(s.base * 1.6 * f * (0.85 + r() * 0.3)), walkin: Math.round(s.base * f * (0.8 + r() * 0.4)), demo: true });
    }
  }
  const st = { v: 2, cfg: defaultCfg(), sites, brands, ingredients, catalog, tiers, passes, employees, menus, history,
    orders: [], walkins: [], tickets: [], pickups: [], prep: {}, passSales: [], seededAt: Date.now() };
  // 今天與明天的示範預訂（以前一日中午下單＝享早鳥）
  S = st;
  const cfgNoCut = { ...st.cfg };
  [[today, 90], [Q.addDays(today, 1), 45]].forEach(([d, n]) => {
    const menu = menuFor(d);
    const pool = [...employees].sort(() => r() - 0.5).slice(0, n);
    const orderNow = Q.atTime(Q.addDays(d, -1), '12:00');
    for (const e of pool) {
      const t = menu[Math.floor(Math.pow(r(), 1.4) * menu.length)];
      const slots = Q.buildSlots(st.cfg);
      const site = siteById(e.site);
      const loads = Q.slotLoads(slots, activeOrders(d, site.id), site.lockers);
      const open = loads.filter(l => !l.full);
      if (!open.length) continue;
      const slot = open[Math.floor(r() * open.length)].slot;
      const locker = Q.allocateLocker(site.id, site.lockers, occupiedLockers(d, site.id, slot));
      const price = Q.computePrice({ price: t.price, channel: 'pre', serviceDate: d, now: orderNow, cfg: cfgNoCut, tierPct: tierOf(e).tier.discountPct });
      st.orders.push({ id: uid('o'), date: d, empId: e.id, setId: t.id, site: site.id, slot, locker, total: price.total, lines: price.lines, passCost: 0, pay: 'badge', status: 'paid', createdAt: orderNow.getTime(), demo: true });
    }
  });
  // 今天各場域一般點餐的示範單（供叫號大螢幕展示）：3 張待取、5 張製作中
  const nowTs = Date.now();
  for (const site of sites) {
    const menu = menuFor(today);
    const who = [...employees].sort(() => r() - 0.5).slice(0, 8);
    who.forEach((e, i) => {
      const t = menu[i % menu.length];
      const created = nowTs - (16 - i) * 60000;
      st.tickets.push({ id: uid('t'), no: ticketNo(today, site.id), date: today, site: site.id, empId: e.id, setId: t.id, itemName: t.name, note: '', total: t.price,
        status: i < 3 ? 'ready' : 'making', createdAt: created, readyAt: i < 3 ? created + 240000 : undefined, demo: true });
    });
  }
  return st;
}

// ════════════════════════════════════════════════════════════
// 儲存
// ════════════════════════════════════════════════════════════
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ 無法儲存到瀏覽器（隱私模式？）'); }
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (raw) { try { S = JSON.parse(raw); } catch (e) { S = null; } }
  if (!S || S.v !== 2) { S = seed(); save(); }
  S.cfg = { ...defaultCfg(), ...S.cfg };
  closePastDays();
}
window.addEventListener('storage', e => { if (e.key === KEY && e.newValue) { S = JSON.parse(e.newValue); renderAll(); } });

// 日結：過去日期的實際數據寫入歷史，供預估使用
function closePastDays() {
  const today = TODAY();
  const have = new Set(S.history.map(h => h.date + '|' + h.site));
  const agg = {};
  const key = (d, s) => d + '|' + s;
  S.orders.forEach(o => { if (o.date < today && o.status !== 'cancelled') { const k = key(o.date, o.site); (agg[k] = agg[k] || { pre: 0, walkin: 0 }).pre++; } });
  S.walkins.forEach(w => { if (w.date < today) { const k = key(w.date, w.site); (agg[k] = agg[k] || { pre: 0, walkin: 0 }).walkin++; } });
  let changed = false;
  for (const [k, v] of Object.entries(agg)) {
    if (have.has(k)) continue;
    const [date, site] = k.split('|');
    S.history.push({ date, site, pre: v.pre, walkin: v.walkin, demo: false });
    changed = true;
  }
  if (changed) save();
}

// ════════════════════════════════════════════════════════════
// 資料查詢
// ════════════════════════════════════════════════════════════
const tpl = id => S.catalog.find(t => t.id === id);
const brandById = id => S.brands.find(b => b.id === id);
const siteById = id => S.sites.find(s => s.id === id);
const empById = id => S.employees.find(e => e.id === id);
function findEmp(code) { code = String(code).trim().toUpperCase(); return S.employees.find(e => e.id === code || e.card === code); }
function menuFor(d) { return (S.menus[d] || []).map(m => ({ ...tpl(m.id), capacity: m.capacity })).filter(m => m.id); }
function menuDates() { const t = TODAY(); return Object.keys(S.menus).filter(d => d >= t).sort(); }
function activeOrders(d, siteId) { return S.orders.filter(o => o.date === d && o.status !== 'cancelled' && (!siteId || o.site === siteId)); }
function occupiedLockers(d, siteId, slot) { return new Set(activeOrders(d, siteId).filter(o => o.slot === slot).map(o => o.locker)); }
function preCounts(d, siteId) { const c = {}; activeOrders(d, siteId).forEach(o => { c[o.setId] = (c[o.setId] || 0) + 1; }); return c; }
function siteHistory(siteId) { return S.history.filter(h => h.site === siteId); }
function forecastFor(d, siteId) { return Q.forecastPrep({ sets: menuFor(d), preorders: preCounts(d, siteId), history: siteHistory(siteId), serviceDate: d, cfg: S.cfg }); }
function prepQty(d, siteId, setId, fc) {
  const c = S.prep[d] && S.prep[d][siteId] && S.prep[d][siteId][setId];
  if (Number.isInteger(c)) return c;
  const row = (fc || forecastFor(d, siteId)).rows.find(r => r.id === setId);
  return row ? row.suggested : 0;
}
function walkinSold(d, siteId, setId) { return S.walkins.filter(w => w.date === d && w.site === siteId && w.setId === setId).length; }
function walkinStock(d, siteId, setId, fc) {
  const pre = activeOrders(d, siteId).filter(o => o.setId === setId).length;
  return Math.max(0, prepQty(d, siteId, setId, fc) - pre - walkinSold(d, siteId, setId));
}
// ── 叫號 ──
// 內部單號：場域當日流水號 N001（不隨叫號模式改變）
function brandCode(brandId) { const i = S.brands.findIndex(b => b.id === brandId); return String.fromCharCode(65 + Math.max(0, i)); }
function ticketNo(d, siteId) { return 'N' + String(S.tickets.filter(t => t.date === d && t.site === siteId).length + 1).padStart(3, '0'); }
// 大螢幕叫號號碼（即時計算，切換模式後所有單一致）：
//   封閉市場：有工號 → 工號末 N 碼；訪客 → 內部單號
//   開放市場：品牌代碼字母 + 該品牌當日流水號（A001）
function callNo(t) {
  if (S.cfg.marketMode === 'closed') return t.empId ? Q.idSuffix(t.empId, S.cfg.callDigits) : t.no;
  const brand = tpl(t.setId).brandId;
  const same = S.tickets.filter(x => x.date === t.date && x.site === t.site && tpl(x.setId).brandId === brand).sort((a, b) => a.createdAt - b.createdAt);
  return brandCode(brand) + String(same.indexOf(t) + 1).padStart(3, '0');
}
// 目前在大螢幕上（製作中／待取）與此單同號的其他單
function sameCallNo(t, d) { const n = callNo(t); return S.tickets.filter(x => x !== t && x.date === d && x.site === t.site && (x.status === 'making' || x.status === 'ready') && callNo(x) === n); }

function tierOf(e) { return Q.tierFor(e.lifetime, S.tiers); }
function passMeals(e) { return e.passes.reduce((a, p) => a + p.meals, 0); }
function consumePass(e) { const p = e.passes.find(x => x.meals > 0); if (!p) return null; p.meals--; const c = p.perMeal; e.passes = e.passes.filter(x => x.meals > 0); return c; }
function refundPass(e, perMeal) { e.passes.unshift({ meals: 1, perMeal }); }
function validCoupons(e, d) { return e.coupons.filter(c => c.exp >= d); }
function pickupDates(empId) {
  const s = new Set();
  S.orders.forEach(o => { if (o.empId === empId && o.status === 'picked') s.add(o.date); });
  S.walkins.forEach(w => { if (w.empId === empId) s.add(w.date); });
  S.tickets.forEach(t => { if (t.empId === empId && t.status === 'done') s.add(t.date); });
  return s;
}
// 取餐完成後的會員回饋（點數、集章、連續天數）
function rewardOnConsume(e, paid, d) {
  const msgs = [];
  const pts = Q.pointsEarned(paid, S.cfg);
  if (pts) { e.points += pts; e.lifetime += pts; msgs.push(`+${pts} 點`); }
  e.stamps += 1;
  if (e.stamps >= S.cfg.stampGoal) {
    e.stamps -= S.cfg.stampGoal;
    e.coupons.push({ id: uid('c'), type: 'amount', value: S.cfg.passCap, label: '集章滿額・免費套餐券', exp: Q.addDays(d, 30) });
    msgs.push('🎉 集滿章，獲得免費套餐券');
  }
  const streak = Q.workdayStreak(pickupDates(e.id), d);
  if (streak > 0 && streak % S.cfg.streakBonusDays === 0 && e.lastStreakBonus !== d) {
    e.points += S.cfg.streakBonus; e.lifetime += S.cfg.streakBonus; e.lastStreakBonus = d;
    msgs.push(`🔥 連續 ${streak} 天 +${S.cfg.streakBonus} 點`);
  }
  return msgs;
}

function renderBanner() {
  const b = $('#demoBanner'); if (!b) return;
  b.textContent = S.cfg.demoIgnoreCutoff ? '展示模式：已忽略預訂截止時間，含示範資料（後台 → 系統設定可關閉／重置）' : '';
  b.classList.toggle('hide', !S.cfg.demoIgnoreCutoff);
}
function startClock() {
  const tick = () => { const c = $('#clock'); if (c) { const n = new Date(); c.textContent = `${Q.ymd(n)} ${n.toLocaleTimeString('zh-TW', { hour12: false })}`; } };
  tick(); setInterval(tick, 1000);
}
function siteOptions() { return S.sites.map(s => `<option value="${s.id}" ${s.id === curSite ? 'selected' : ''}>${esc(s.name)}</option>`).join(''); }

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function download(name, text, type = 'text/csv') {
  const blob = new Blob(['﻿' + text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csv = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
