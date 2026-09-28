// 執行：node --test quickgo/menu-data.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./menu-data.js');

test('菜單品項數與價格為正整數', () => {
  assert.equal(M.items('RC').length, 30);           // 一杯紅 1–30 號
  assert.deepEqual(M.items('RC').map(i => i.no), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.equal(M.items('YJ').length, 21);           // 主食4＋湯4＋小菜5＋套餐5＋加購3
  for (const b of ['YJ', 'RC']) for (const i of M.items(b)) assert.ok(Number.isInteger(i.price) && i.price > 0, i.name);
  const ids = [...M.items('YJ'), ...M.items('RC')].map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);      // 代號不重複
});

test('套餐省額與點餐單一致（D 除外）', () => {
  const v = id => M.setValue(M.item(id));
  assert.deepEqual(v('YJ-A'), { original: 135, saving: 15, computed: true }); // 60+75
  assert.deepEqual(v('YJ-B'), { original: 135, saving: 15, computed: true });
  assert.deepEqual(v('YJ-C'), { original: 185, saving: 20, computed: true }); // 110+75
  assert.deepEqual(v('YJ-E'), { original: 190, saving: 35, computed: true }); // 110+45+35
  // D：拌飯／拌麵未列單價，無法由組成驗算，沿用點餐單「省 32」
  assert.deepEqual(v('YJ-D'), { original: null, saving: 32, computed: false });
});

test('上市日：組成品項未上市，套餐也不能點', () => {
  assert.equal(M.availableFrom(M.item('YJ-M3')), '2026-10-05');
  assert.equal(M.availableFrom(M.item('YJ-C')), '2026-10-05'); // 含燒肉飯
  assert.equal(M.availableFrom(M.item('YJ-E')), '2026-10-05');
  assert.equal(M.availableFrom(M.item('YJ-A')), null);
  assert.equal(M.isAvailable(M.item('YJ-S2'), '2026-09-30'), false);
  assert.equal(M.isAvailable(M.item('YJ-S2'), '2026-10-01'), true);
});

test('購物車金額與加購規則', () => {
  let c = M.cartSummary([{ id: 'YJ-A', qty: 2 }, { id: 'YJ-X3', qty: 1 }, { id: 'RC-12', qty: 3 }]);
  assert.equal(c.total, 120 * 2 + 65 + 60 * 3);
  assert.equal(c.byBrand.YJ.total, 305); assert.equal(c.byBrand.RC.total, 180);
  assert.equal(c.ok, true);
  c = M.cartSummary([{ id: 'YJ-X1', qty: 1 }, { id: 'YJ-S1', qty: 1 }]);
  assert.equal(c.ok, false);                         // 只有湯＋加購，不符
  assert.equal(M.cartSummary([{ id: 'RC-01', qty: 0 }]).ok, false);
});
