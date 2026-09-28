/*
 * 快取GO 核心計算模組（純函式，無 DOM 相依）
 * 瀏覽器：window.QGCore；Node：require('./core.js')
 * 金額一律以「新台幣整數元」計算，避免浮點誤差。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QGCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_SETS = 3;
  const MAX_SETS = 5;
  const EPS = 1e-9;

  // ── 日期工具（本地時區，格式 YYYY-MM-DD）──────────────────────
  const pad = n => String(n).padStart(2, '0');
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function weekday(s) { return parseYmd(s).getDay(); }
  function isWorkday(s) { const w = weekday(s); return w >= 1 && w <= 5; }
  function hmToMin(hm) { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }
  function minToHm(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function atTime(dateStr, hm) { const d = parseYmd(dateStr); const m = hmToMin(hm); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; }
  function ceilSafe(x) { return Math.ceil(x - EPS); }

  // ── 1. 菜單驗證：每日 3–5 套餐 ──────────────────────────────
  function validateMenu(sets) {
    const errors = [];
    if (!Array.isArray(sets)) return { ok: false, errors: ['菜單格式錯誤'] };
    if (sets.length < MIN_SETS || sets.length > MAX_SETS) errors.push(`每日套餐需為 ${MIN_SETS}–${MAX_SETS} 種（目前 ${sets.length} 種）`);
    const ids = new Set();
    sets.forEach((s, i) => {
      const tag = `第 ${i + 1} 項`;
      if (!s.id) errors.push(`${tag} 缺少代號`);
      else if (ids.has(s.id)) errors.push(`${tag} 代號 ${s.id} 重複`);
      ids.add(s.id);
      if (!s.name || !String(s.name).trim()) errors.push(`${tag} 缺少名稱`);
      if (!Number.isInteger(s.price) || s.price <= 0) errors.push(`${tag} 售價需為正整數`);
      if (!Number.isInteger(s.capacity) || s.capacity < 0) errors.push(`${tag} 產能需為 0 以上整數`);
    });
    return { ok: errors.length === 0, errors };
  }

  // ── 截止 / 早鳥 ──────────────────────────────────────────
  function orderCutoff(serviceDate, cfg) { return atTime(serviceDate, cfg.cutoffTime); }
  function earlyBirdDeadline(serviceDate, cfg) { return atTime(addDays(serviceDate, -1), cfg.earlyBirdTime); }
  function canPreorder(serviceDate, now, cfg) {
    if (cfg.demoIgnoreCutoff) return true;
    return now.getTime() < orderCutoff(serviceDate, cfg).getTime();
  }

  // ── 會員等級（#5 品牌黏著）──────────────────────────────────
  // tiers 依 minPoints 由小到大；discountPct 為整數百分比
  function tierFor(lifetimePoints, tiers) {
    let cur = tiers[0];
    for (const t of tiers) if (lifetimePoints >= t.minPoints) cur = t;
    const idx = tiers.indexOf(cur);
    const next = tiers[idx + 1] || null;
    return { tier: cur, next, toNext: next ? next.minPoints - lifetimePoints : 0 };
  }

  // ── 定價：基價 → 早鳥/剩食快閃 → 會員折扣 → 優惠券 / 餐券 ───────
  // opts: { price, channel:'pre'|'walkin', serviceDate, now, cfg, tierPct, coupon, usePass, passCap }
  // coupon: { type:'amount', value } 或 { type:'pct', value }（pct 為折扣百分比，如 10 = 9折）
  function computePrice(o) {
    const lines = [{ label: '套餐原價', amount: o.price }];
    let p = o.price;
    const cfg = o.cfg;
    if (o.channel === 'pre' && o.now.getTime() <= earlyBirdDeadline(o.serviceDate, cfg).getTime() && cfg.earlyBirdDiscount > 0) {
      const d = Math.min(p, cfg.earlyBirdDiscount);
      p -= d; lines.push({ label: '早鳥預訂', amount: -d });
    }
    if (o.channel === 'walkin' && cfg.flashEnabled && o.now.getHours() * 60 + o.now.getMinutes() >= hmToMin(cfg.flashTime)) {
      const np = Math.round(p * cfg.flashPct / 100);
      lines.push({ label: `剩食快閃 ${cfg.flashPct / 10}折`, amount: np - p }); p = np;
    }
    if (o.tierPct > 0) {
      const d = Math.round(p * o.tierPct / 100);
      p -= d; lines.push({ label: `會員 ${o.tierPct}% 折扣`, amount: -d });
    }
    if (o.coupon) {
      const d = o.coupon.type === 'pct' ? Math.round(p * o.coupon.value / 100) : Math.min(p, o.coupon.value);
      p -= d; lines.push({ label: '優惠券', amount: -d });
    }
    let passUsed = false;
    if (o.usePass) {
      const covered = Math.min(p, o.passCap);
      p -= covered; passUsed = true; lines.push({ label: '餐券折抵', amount: -covered });
    }
    p = Math.max(0, p);
    return { total: p, lines, passUsed };
  }

  // ── 2. 備餐預估 ──────────────────────────────────────────
  // 基準：前 N 週同星期的現場快取量加權平均（近者權重高：N, N-1, …, 1）
  function walkinBaseline(history, serviceDate, weeks) {
    const map = new Map(history.map(h => [h.date, h]));
    let sw = 0, sx = 0; const used = [];
    for (let k = 1; k <= weeks; k++) {
      const d = addDays(serviceDate, -7 * k);
      const h = map.get(d);
      if (!h) continue;
      const w = weeks - k + 1;
      sw += w; sx += w * h.walkin; used.push({ date: d, walkin: h.walkin, weight: w });
    }
    return sw ? { value: sx / sw, used } : null;
  }

  // preorders: { setId: qty }；回傳每套餐建議備餐量
  function forecastPrep({ sets, preorders, history, serviceDate, cfg }) {
    const k = sets.length;
    const totalPre = sets.reduce((a, s) => a + (preorders[s.id] || 0), 0);
    const base = walkinBaseline(history, serviceDate, cfg.forecastWeeks);
    const walkinTotal = base ? base.value : totalPre * cfg.fallbackWalkinPct / 100;
    const rows = sets.map(s => {
      const pre = preorders[s.id] || 0;
      const share = (pre + 1) / (totalPre + k); // 拉普拉斯平滑，總和 = 1
      const walkinExp = walkinTotal * share;
      const walkinPrep = ceilSafe(walkinExp * (100 + cfg.safetyPct) / 100);
      const suggested = pre + walkinPrep;
      return { id: s.id, name: s.name, pre, share, walkinExp, walkinPrep, suggested, capacity: s.capacity, overCapacity: suggested > s.capacity };
    });
    return { rows, totalPre, walkinTotal, source: base ? 'history' : 'fallback', used: base ? base.used : [], totalSuggested: rows.reduce((a, r) => a + r.suggested, 0) };
  }

  // ── 4. 跨場域共同食材：合併採購 vs 各場域分開採購 ─────────────
  // prepBySite: { siteId: { setId: qty } }；bom: { setId: [{ ing, grams }] }；ingredients: { ing: { name, packGrams, packPrice } }
  function ingredientPlan(prepBySite, bom, ingredients) {
    const need = {}; // ing -> { total, bySite:{} }
    for (const [site, prep] of Object.entries(prepBySite)) {
      for (const [setId, qty] of Object.entries(prep)) {
        for (const line of (bom[setId] || [])) {
          const n = need[line.ing] || (need[line.ing] = { total: 0, bySite: {} });
          const g = line.grams * qty;
          n.total += g; n.bySite[site] = (n.bySite[site] || 0) + g;
        }
      }
    }
    const rows = Object.entries(need).map(([ing, n]) => {
      const meta = ingredients[ing];
      const separatePacks = Object.values(n.bySite).reduce((a, g) => a + (g > 0 ? ceilSafe(g / meta.packGrams) : 0), 0);
      const pooledPacks = n.total > 0 ? ceilSafe(n.total / meta.packGrams) : 0;
      const savedPacks = separatePacks - pooledPacks;
      const leftoverGrams = pooledPacks * meta.packGrams - n.total;
      return { ing, name: meta.name, grams: n.total, bySite: n.bySite, separatePacks, pooledPacks, savedPacks, savedCost: savedPacks * meta.packPrice, leftoverGrams, cost: pooledPacks * meta.packPrice };
    }).sort((a, b) => b.grams - a.grams);
    return {
      rows,
      totalCost: rows.reduce((a, r) => a + r.cost, 0),
      totalSaved: rows.reduce((a, r) => a + r.savedCost, 0),
      totalSavedPacks: rows.reduce((a, r) => a + r.savedPacks, 0),
    };
  }

  // ── 美食櫃格位分配 ────────────────────────────────────────
  // 回傳第一個空格，格式 `${prefix}-01`；全滿回傳 null
  function allocateLocker(prefix, size, occupied) {
    for (let i = 1; i <= size; i++) {
      const code = prefix + '-' + pad(i);
      if (!occupied.has(code)) return code;
    }
    return null;
  }

  // ── 取餐時段分流 ──────────────────────────────────────────
  function buildSlots(cfg) {
    const out = [];
    for (let m = hmToMin(cfg.slotStart); m < hmToMin(cfg.slotEnd); m += cfg.slotMinutes) out.push(minToHm(m));
    return out;
  }
  function slotLoads(slots, orders, cap) {
    const cnt = {}; orders.forEach(o => { cnt[o.slot] = (cnt[o.slot] || 0) + 1; });
    return slots.map(s => ({ slot: s, used: cnt[s] || 0, cap, full: (cnt[s] || 0) >= cap, pct: cap ? (cnt[s] || 0) / cap : 1 }));
  }
  function recommendSlot(loads) {
    let best = null;
    for (const l of loads) if (!l.full && (!best || l.pct < best.pct)) best = l;
    return best ? best.slot : null;
  }

  // ── 3. 取餐秒數統計 ───────────────────────────────────────
  function pickupStats(secs, targetSec) {
    const n = secs.length;
    if (!n) return { count: 0, avg: 0, p90: 0, max: 0, underRate: 0 };
    const sorted = [...secs].sort((a, b) => a - b);
    const sum = secs.reduce((a, b) => a + b, 0);
    return {
      count: n,
      avg: sum / n,
      p90: sorted[Math.ceil(0.9 * n) - 1],
      max: sorted[n - 1],
      underRate: secs.filter(s => s <= targetSec).length / n,
    };
  }

  // 一般點餐等候時間（秒）：前方人數 / 出餐站數 × 平均製作秒數
  function estimateWait(ahead, avgMakeSec, stations) {
    return Math.ceil(ahead / Math.max(1, stations)) * avgMakeSec;
  }

  // ── 預測準確度 ─────────────────────────────────────────────
  function mape(pairs) {
    const v = pairs.filter(p => p.actual > 0);
    if (!v.length) return null;
    return v.reduce((a, p) => a + Math.abs(p.forecast - p.actual) / p.actual, 0) / v.length * 100;
  }
  function wasteRate(prepared, sold) { return prepared > 0 ? Math.max(0, prepared - sold) / prepared * 100 : 0; }

  // ── 5. 集點 / 集章 / 連續天數 ──────────────────────────────
  function pointsEarned(paid, cfg) { return Math.floor(paid / cfg.pointPerDollars); }
  // 連續工作日取餐天數（今天沒取餐則由前一個工作日起算）
  function workdayStreak(dateSet, today) {
    let d = today;
    if (!dateSet.has(d)) d = prevWorkday(d);
    let n = 0;
    while (dateSet.has(d)) { n++; d = prevWorkday(d); }
    return n;
  }
  function prevWorkday(s) { let d = addDays(s, -1); while (!isWorkday(d)) d = addDays(d, -1); return d; }

  // ── 6. 餐券包（優惠票）────────────────────────────────────
  // 回傳每餐平均成本與相對原價節省
  function passValue(pass, refPrice) {
    const perMeal = pass.price / pass.meals;
    return { perMeal, savingPct: refPrice > 0 ? (1 - perMeal / refPrice) * 100 : 0, savingTotal: refPrice * pass.meals - pass.price };
  }

  // ── 7. 合作品牌拆帳 ───────────────────────────────────────
  function settlement(gross, commissionPct) {
    const commission = Math.round(gross * commissionPct / 100);
    return { gross, commission, payout: gross - commission };
  }

  // ── 叫號：工號末碼（封閉市場）────────────────────────────
  // 取工號中的數字部分末 digits 碼，不足補 0
  function idSuffix(id, digits) {
    const d = String(id).replace(/\D/g, '');
    return d.slice(-digits).padStart(digits, '0');
  }
  // 名冊依末碼分組，回傳各組人數（只含有人的組）
  function suffixGroups(ids, digits) {
    const m = new Map();
    for (const id of ids) { const s = idSuffix(id, digits); m.set(s, (m.get(s) || 0) + 1); }
    return [...m.values()];
  }
  // 工號平均分布（如連續編號）時，N 人落在 10^digits 個末碼的分組人數
  function evenGroups(n, digits) {
    const m = Math.pow(10, digits);
    if (n <= m) return new Array(n).fill(1);
    const base = Math.floor(n / m), extra = n % m;
    return Array.from({ length: m }, (_, i) => base + (i < extra ? 1 : 0));
  }
  // 從名冊隨機同時叫 k 位（不重複）時，至少兩人末碼相同的精確機率。
  // 無撞號組合數 = 各組人數的 k 次基本對稱多項式 e_k(g)；總組合數 = C(N, k)
  function suffixCollisionProb(groupSizes, k) {
    const n = groupSizes.reduce((a, b) => a + b, 0);
    if (k <= 1) return 0;
    if (k > n) return 1;
    if (groupSizes.every(g => g <= 1)) return 0; // 末碼全部唯一：數學上必為 0，避免浮點殘差
    const e = new Array(k + 1).fill(0); e[0] = 1;
    for (const g of groupSizes) for (let j = k; j >= 1; j--) e[j] += e[j - 1] * g;
    let c = 1;
    for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
    return Math.min(1, Math.max(0, 1 - e[k] / c));
  }
  // 撞號時大螢幕加註遮罩姓名：王小明 → 王○明、陳一 → 陳○
  function maskName(name) {
    const s = [...String(name)];
    if (s.length <= 1) return s.join('');
    if (s.length === 2) return s[0] + '○';
    return s[0] + '○'.repeat(s.length - 2) + s[s.length - 1];
  }

  return {
    idSuffix, suffixGroups, evenGroups, suffixCollisionProb, maskName,
    MIN_SETS, MAX_SETS, ymd, parseYmd, addDays, weekday, isWorkday, hmToMin, minToHm, atTime, ceilSafe,
    validateMenu, orderCutoff, earlyBirdDeadline, canPreorder, tierFor, computePrice,
    walkinBaseline, forecastPrep, ingredientPlan, allocateLocker, buildSlots, slotLoads, recommendSlot,
    pickupStats, estimateWait, mape, wasteRate, pointsEarned, workdayStreak, prevWorkday, passValue, settlement,
  };
});
