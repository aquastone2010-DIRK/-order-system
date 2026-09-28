// 執行：node --test quickgo/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./core.js');

const cfg = {
  cutoffTime: '10:00', earlyBirdTime: '17:00', earlyBirdDiscount: 5,
  flashEnabled: true, flashTime: '13:00', flashPct: 70,
  forecastWeeks: 4, safetyPct: 10, fallbackWalkinPct: 25,
  slotStart: '11:30', slotEnd: '13:00', slotMinutes: 15, pointPerDollars: 10,
};

test('日期工具', () => {
  assert.equal(C.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(C.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(C.weekday('2026-09-28'), 1); // 週一
  assert.equal(C.prevWorkday('2026-09-28'), '2026-09-25'); // 週一往前 = 週五
});

test('菜單 3–5 套餐驗證', () => {
  const s = i => ({ id: 'S' + i, name: 'x', price: 100, capacity: 10 });
  assert.equal(C.validateMenu([s(1), s(2)]).ok, false);
  assert.equal(C.validateMenu([s(1), s(2), s(3)]).ok, true);
  assert.equal(C.validateMenu([1, 2, 3, 4, 5].map(s)).ok, true);
  assert.equal(C.validateMenu([1, 2, 3, 4, 5, 6].map(s)).ok, false);
  assert.equal(C.validateMenu([s(1), s(1), s(2)]).ok, false);
  assert.equal(C.validateMenu([s(1), s(2), { ...s(3), price: 99.5 }]).ok, false);
});

test('截止時間', () => {
  assert.equal(C.canPreorder('2026-09-28', new Date(2026, 8, 28, 9, 59), cfg), true);
  assert.equal(C.canPreorder('2026-09-28', new Date(2026, 8, 28, 10, 0), cfg), false);
  assert.equal(C.canPreorder('2026-09-28', new Date(2026, 8, 28, 12, 0), { ...cfg, demoIgnoreCutoff: true }), true);
});

test('定價：早鳥 + 會員 + 優惠券 + 餐券', () => {
  const base = { price: 110, serviceDate: '2026-09-29', cfg };
  // 前一日 16:59 → 早鳥 -5 → 105；會員 5% → round(5.25)=5 → 100；優惠券 -10 → 90
  const r = C.computePrice({ ...base, channel: 'pre', now: new Date(2026, 8, 28, 16, 59), tierPct: 5, coupon: { type: 'amount', value: 10 } });
  assert.equal(r.total, 90);
  assert.equal(r.lines.reduce((a, l) => a + l.amount, 0), 90);
  // 早鳥期限後
  assert.equal(C.computePrice({ ...base, channel: 'pre', now: new Date(2026, 8, 28, 17, 1), tierPct: 0 }).total, 110);
  // 餐券上限 100：110 - 100 = 10 補差額
  const p = C.computePrice({ ...base, channel: 'pre', now: new Date(2026, 8, 29, 8, 0), tierPct: 0, usePass: true, passCap: 100 });
  assert.equal(p.total, 10); assert.equal(p.passUsed, true);
  // 優惠券不可折成負數
  assert.equal(C.computePrice({ ...base, channel: 'pre', now: new Date(2026, 8, 29, 8, 0), tierPct: 0, coupon: { type: 'amount', value: 500 } }).total, 0);
});

test('定價：剩食快閃只適用現場快取', () => {
  const o = { price: 95, serviceDate: '2026-09-28', cfg, tierPct: 0 };
  assert.equal(C.computePrice({ ...o, channel: 'walkin', now: new Date(2026, 8, 28, 12, 59) }).total, 95);
  assert.equal(C.computePrice({ ...o, channel: 'walkin', now: new Date(2026, 8, 28, 13, 0) }).total, 67); // round(66.5)
  assert.equal(C.computePrice({ ...o, channel: 'pre', now: new Date(2026, 8, 28, 13, 0) }).total, 95);
});

test('會員等級', () => {
  const tiers = [{ name: '綠卡', minPoints: 0, discountPct: 0 }, { name: '銀卡', minPoints: 1000, discountPct: 3 }, { name: '金卡', minPoints: 3000, discountPct: 5 }];
  assert.equal(C.tierFor(999, tiers).tier.name, '綠卡');
  assert.equal(C.tierFor(999, tiers).toNext, 1);
  assert.equal(C.tierFor(1000, tiers).tier.name, '銀卡');
  assert.equal(C.tierFor(5000, tiers).next, null);
});

test('備餐預估：歷史加權平均', () => {
  const history = [
    { date: '2026-09-21', walkin: 40 }, // k=1 w=4
    { date: '2026-09-14', walkin: 30 }, // k=2 w=3
    { date: '2026-09-07', walkin: 20 }, // k=3 w=2
    { date: '2026-08-31', walkin: 10 }, // k=4 w=1
  ];
  const b = C.walkinBaseline(history, '2026-09-28', 4);
  assert.equal(b.value, (160 + 90 + 40 + 10) / 10); // 30
  const sets = [{ id: 'A', name: 'A', capacity: 100 }, { id: 'B', name: 'B', capacity: 100 }, { id: 'C', name: 'C', capacity: 20 }];
  const f = C.forecastPrep({ sets, preorders: { A: 7, B: 2, C: 0 }, history, serviceDate: '2026-09-28', cfg });
  assert.equal(f.source, 'history');
  // 平滑占比：A 8/12, B 3/12, C 1/12
  const sum = f.rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
  // A: 30*8/12=20 → ×1.1 = 22 → 7+22 = 29（避免浮點 22.000000004 被進位成 23）
  assert.deepEqual(f.rows.map(r => r.walkinPrep), [22, 9, 3]); // 7.5*1.1=8.25→9；2.5*1.1=2.75→3
  assert.deepEqual(f.rows.map(r => r.suggested), [29, 11, 3]);
  assert.equal(f.totalSuggested, 43);
});

test('備餐預估：無歷史時使用預訂量比例', () => {
  const sets = [{ id: 'A', capacity: 50 }, { id: 'B', capacity: 50 }, { id: 'C', capacity: 50 }];
  const f = C.forecastPrep({ sets, preorders: { A: 10, B: 10, C: 10 }, history: [], serviceDate: '2026-09-28', cfg });
  assert.equal(f.source, 'fallback');
  assert.equal(f.walkinTotal, 7.5);
  assert.deepEqual(f.rows.map(r => r.walkinPrep), [3, 3, 3]); // 2.5*1.1=2.75→3
});

test('ceilSafe 消除浮點誤差', () => {
  // 與 forecastPrep 相同算式：現場預估 50/11 份 × (100+10)/100，數學上剛好 = 5 份
  const v = (50 / 11) * 110 / 100;
  assert.equal(v, 5.000000000000001); // 浮點誤差
  assert.equal(Math.ceil(v), 6);      // 原生進位會多備 1 份
  assert.equal(C.ceilSafe(v), 5);     // 正確
  assert.equal(C.ceilSafe(5.2), 6);   // 真正有小數時仍正常進位
});

test('共同食材：合併採購節省', () => {
  const bom = { A: [{ ing: 'rice', grams: 250 }], B: [{ ing: 'rice', grams: 200 }] };
  const ingredients = { rice: { name: '白米', packGrams: 10000, packPrice: 600 } };
  // 場域1：A×30=7500g → 1包；場域2：B×20=4000g → 1包；分開 2 包，合併 11500g → 2 包
  let p = C.ingredientPlan({ s1: { A: 30 }, s2: { B: 20 } }, bom, ingredients);
  assert.equal(p.rows[0].separatePacks, 2); assert.equal(p.rows[0].pooledPacks, 2); assert.equal(p.totalSaved, 0);
  // 場域1 6000g、場域2 4000g：分開 2 包，合併剛好 1 包 → 省 1 包 600 元
  p = C.ingredientPlan({ s1: { A: 24 }, s2: { B: 20 } }, bom, ingredients);
  assert.equal(p.rows[0].grams, 10000);
  assert.equal(p.rows[0].pooledPacks, 1); assert.equal(p.rows[0].savedPacks, 1); assert.equal(p.totalSaved, 600);
  assert.equal(p.rows[0].leftoverGrams, 0);
});

test('美食櫃格位', () => {
  assert.equal(C.allocateLocker('F12A', 3, new Set()), 'F12A-01');
  assert.equal(C.allocateLocker('F12A', 3, new Set(['F12A-01', 'F12A-03'])), 'F12A-02');
  assert.equal(C.allocateLocker('F12A', 2, new Set(['F12A-01', 'F12A-02'])), null);
});

test('時段分流', () => {
  const slots = C.buildSlots(cfg);
  assert.deepEqual(slots, ['11:30', '11:45', '12:00', '12:15', '12:30', '12:45']);
  const loads = C.slotLoads(slots, [{ slot: '11:30' }, { slot: '11:30' }, { slot: '12:00' }], 2);
  assert.equal(loads[0].full, true);
  assert.equal(C.recommendSlot(loads), '11:45');
});

test('取餐秒數統計', () => {
  const s = C.pickupStats([5, 8, 12, 20, 25, 28, 30, 31, 40, 3], 30);
  assert.equal(s.count, 10);
  assert.equal(s.avg, 20.2);
  assert.equal(s.p90, 31); // nearest-rank: ceil(9)=9 → sorted[8]
  assert.equal(s.underRate, 0.8);
  assert.equal(C.pickupStats([], 30).count, 0);
});

test('一般隊伍等候、MAPE、浪費率', () => {
  assert.equal(C.estimateWait(5, 90, 2), 270);
  assert.equal(C.estimateWait(0, 90, 2), 0);
  assert.equal(C.mape([{ forecast: 110, actual: 100 }, { forecast: 45, actual: 50 }, { forecast: 3, actual: 0 }]), 10);
  assert.equal(C.wasteRate(100, 92), 8);
  assert.equal(C.wasteRate(0, 0), 0);
});

test('集點與連續天數', () => {
  assert.equal(C.pointsEarned(99, cfg), 9);
  // 2026-09-28 週一；前一週五 09-25、週四 09-24 有取餐，09-23 沒有
  const set = new Set(['2026-09-28', '2026-09-25', '2026-09-24', '2026-09-22']);
  assert.equal(C.workdayStreak(set, '2026-09-28'), 3);
  assert.equal(C.workdayStreak(new Set(['2026-09-25']), '2026-09-28'), 1); // 今天尚未取餐不歸零
  assert.equal(C.workdayStreak(new Set(), '2026-09-28'), 0);
});

test('叫號：工號末碼', () => {
  assert.equal(C.idSuffix('E10023', 3), '023');
  assert.equal(C.idSuffix('E10023', 4), '0023');
  assert.equal(C.idSuffix('7', 4), '0007');
  assert.deepEqual(C.suffixGroups(['E11023', 'E12023', 'E10500'], 3).sort(), [1, 2]);
  assert.equal(C.maskName('王小明'), '王○明');
  assert.equal(C.maskName('陳一'), '陳○');
  assert.equal(C.maskName('歐陽小華'), '歐○○華');
});

test('叫號：撞號機率', () => {
  // 全部不同組 → 0；兩人同組且都被叫 → 1
  assert.equal(C.suffixCollisionProb([1, 1, 1, 1], 3), 0);
  assert.equal(C.suffixCollisionProb([2], 2), 1);
  // 4 人分 2 組各 2 人，叫 2 人：C(4,2)=6 種，同組 2 種 → 1/3
  assert.ok(Math.abs(C.suffixCollisionProb([2, 2], 2) - 1 / 3) < 1e-12);
  // 與等組公式 Π (N - i·g)/(N - i) 比對：8000 人、末 3 碼（每組 8 人）、同時 20 人
  const N = 8000, g = 8, k = 20;
  let p = 1; for (let i = 0; i < k; i++) p *= (N - i * g) / (N - i);
  assert.ok(Math.abs(C.suffixCollisionProb(C.evenGroups(N, 3), k) - (1 - p)) < 1e-12);
  // 8000 人連續編號、末 4 碼：每個末碼只有 1 人 → 不可能撞號
  assert.equal(C.suffixCollisionProb(C.evenGroups(8000, 4), 20), 0);
  // 不整除：1001 人末 3 碼 → 1 組 2 人、999 組 1 人
  const eg = C.evenGroups(1001, 3);
  assert.equal(eg.length, 1000); assert.equal(eg.reduce((a, b) => a + b, 0), 1001); assert.equal(Math.max(...eg), 2);
});

test('餐券包與品牌拆帳', () => {
  const v = C.passValue({ meals: 10, price: 900 }, 100);
  assert.equal(v.perMeal, 90); assert.equal(v.savingTotal, 100);
  assert.ok(Math.abs(v.savingPct - 10) < 1e-9);
  const s = C.settlement(12345, 15);
  assert.equal(s.commission, 1852); // 1851.75 → 1852
  assert.equal(s.commission + s.payout, 12345);
});
