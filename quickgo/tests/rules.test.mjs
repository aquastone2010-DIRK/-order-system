// Firestore 安全規則測試（在本機模擬器執行，不會碰到正式資料庫）
// 執行：npm run test:rules
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-quickgo',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const anon = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const staff = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' }, email: `${uid}@stall.test` }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

const line = (o = {}) => ({ id: 'RC-12', name: '珍珠奶茶', opt: '半糖・少冰', qty: 3, unit: 60, ...o });
function order(uid, seq, o = {}) {
  return { venue: 'TCH', brandId: 'RC', date: '2026-09-28', seq, callNo: 'R' + String(seq).padStart(3, '0'),
    lines: [line()], total: 180, dine: 'out', pay: 'counter', paid: false, status: 'new', createdAt: ts(), uid, ...o };
}
// 與前台相同的下單方式：交易內計數器 +1 並建立訂單
async function place(db, uid, o = {}, seqOverride) {
  const cRef = db.collection('quickgo_counters').doc('TCH_RC_2026-09-28');
  const oRef = db.collection('quickgo_orders').doc();
  await db.runTransaction(async tx => {
    const c = await tx.get(cRef);
    const n = (c.exists ? c.data().n : 0) + 1;
    if (c.exists) tx.update(cRef, { n }); else tx.set(cRef, { n });
    tx.set(oRef, order(uid, seqOverride ?? n, o));
  });
  return oRef;
}
async function seedOrder() {
  let ref;
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    ref = db.collection('quickgo_orders').doc('o1');
    await ref.set({ ...order('cust', 1), createdAt: new Date() });
  });
  return ref.id;
}

test('顧客（匿名）可用交易下單，取餐號依序遞增', async () => {
  const db = anon('cust');
  await assertSucceeds(place(db, 'cust'));
  await assertSucceeds(place(db, 'cust'));
  const c = await db.collection('quickgo_counters').doc('TCH_RC_2026-09-28').get();
  assert(c.data().n === 2, '計數器應為 2');
});

test('序號與計數器不符（偽造取餐號）→ 拒絕', async () => {
  await assertFails(place(anon('cust'), 'cust', {}, 7));
});

test('不經計數器直接建立訂單 → 拒絕', async () => {
  await assertFails(anon('cust').collection('quickgo_orders').doc('x').set(order('cust', 1)));
});

test('顧客下單欄位驗證', async () => {
  const db = anon('cust');
  await assertFails(place(db, 'cust', { status: 'ready' }));               // 不能一下單就是待取
  await assertFails(place(db, 'cust', { paid: true }));                    // 不能自己標已付款
  await assertFails(place(db, 'cust', { total: '180' }));                  // 金額必須是整數
  await assertFails(place(db, 'cust', { total: 0 }));
  await assertFails(place(db, 'cust', { uid: 'someone-else' }));          // 不能冒用他人
  await assertFails(place(db, 'cust', { hacked: 1 }));                     // 不允許多餘欄位
  await assertFails(place(db, 'cust', { lines: [] }));
  await assertFails(place(db, 'cust', { lines: Array.from({ length: 11 }, () => line()) })); // 最多 10 項
  await assertFails(place(db, 'cust', { lines: [line(), line({ qty: 0 })] }));               // 第 2 項數量 0
  await assertFails(place(db, 'cust', { lines: [...Array.from({ length: 9 }, () => line()), line({ unit: -5 })] })); // 第 10 項也要檢查
  await assertSucceeds(place(db, 'cust', { lines: Array.from({ length: 10 }, () => line()), total: 1800 }));
});

test('未登入不能下單，也不能讀訂單', async () => {
  await assertFails(place(nobody(), undefined));
  await seedOrder();
  await assertFails(nobody().collection('quickgo_orders').doc('o1').get());
});

test('顧客不能修改或刪除訂單', async () => {
  const id = await seedOrder();
  const db = anon('cust');
  await assertSucceeds(db.collection('quickgo_orders').doc(id).get());
  await assertFails(db.collection('quickgo_orders').doc(id).update({ status: 'ready' }));
  await assertFails(db.collection('quickgo_orders').doc(id).delete());
});

test('攤位可改流程欄位，但不能改金額或刪單', async () => {
  const id = await seedOrder();
  const db = staff('yj-stall');
  const ref = db.collection('quickgo_orders').doc(id);
  await assertSucceeds(ref.update({ status: 'making', acceptedAt: ts() }));
  await assertSucceeds(ref.update({ status: 'ready', readyAt: ts() }));
  await assertSucceeds(ref.update({ paid: true, payMethod: 'cash' }));
  await assertFails(ref.update({ total: 1 }));
  await assertFails(ref.update({ callNo: 'R999' }));
  await assertFails(ref.update({ status: 'hacked' }));
  await assertFails(ref.delete());
});

test('計數器只能 +1', async () => {
  await env.withSecurityRulesDisabled(ctx => ctx.firestore().collection('quickgo_counters').doc('c').set({ n: 5 }));
  const ref = anon('cust').collection('quickgo_counters').doc('c');
  await assertFails(ref.update({ n: 7 }));
  await assertFails(ref.update({ n: 4 }));
  await assertSucceeds(ref.update({ n: 6 }));
  await assertFails(anon('cust').collection('quickgo_counters').doc('new').set({ n: 3 }));
});

test('售完狀態：所有人可讀，只有攤位可寫', async () => {
  await assertSucceeds(nobody().collection('quickgo_menu_state').doc('YJ').get());
  await assertFails(anon('cust').collection('quickgo_menu_state').doc('YJ').set({ soldOut: { 'YJ-M1': true } }));
  await assertSucceeds(staff('yj-stall').collection('quickgo_menu_state').doc('YJ').set({ soldOut: { 'YJ-M1': true } }));
});

test('既有出單系統的集合維持原本權限', async () => {
  for (const c of ['orders', 'customers', 'products', 'config']) {
    await assertSucceeds(anon('shop').collection(c).doc('t').set({ a: 1 }));
    await assertSucceeds(anon('shop').collection(c).doc('t').get());
    await assertFails(nobody().collection(c).doc('t').get());
  }
});

test('其他未列出的集合一律拒絕', async () => {
  await assertFails(anon('cust').collection('random').doc('x').set({ a: 1 }));
});

function assert(cond, msg) { if (!cond) throw new Error(msg); }
