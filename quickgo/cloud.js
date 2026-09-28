// 快取GO 雲端同步（Firebase Firestore）— ES module，載入後提供 window.QGCloud
// 集合：quickgo_orders（美食街訂單）、quickgo_counters（取餐號計數器）、quickgo_menu_state（售完）
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, query, where, onSnapshot,
  runTransaction, updateDoc, setDoc, getDocs, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const cfg = window.QG_CONFIG;
const app = initializeApp(cfg.firebase, 'quickgo');
const db = getFirestore(app);
const auth = getAuth(app);

// 測試用：?emu=127.0.0.1 連到本機模擬器（只允許本機或檔案開啟時使用）
const emu = new URLSearchParams(location.search).get('emu');
if (emu && (location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  connectFirestoreEmulator(db, emu, 8080);
  connectAuthEmulator(auth, `http://${emu}:9099`, { disableWarnings: true });
}

const pad3 = n => String(n).padStart(3, '0');
const ms = v => (v && typeof v.toMillis === 'function' ? v.toMillis() : v ?? null);
const NOW = '__server_now__'; // 呼叫端用 QGCloud.NOW 表示「伺服器時間」

// 登入狀態：沒有登入就用匿名登入（顧客、叫號螢幕）；攤位改用 Email 登入
let resolveReady, rejectReady;
const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
let firstAuth = true;
const authListeners = new Set();
onAuthStateChanged(auth, async user => {
  if (!user) {
    try { await signInAnonymously(auth); } catch (e) { if (firstAuth) rejectReady(e); }
    return;
  }
  if (firstAuth) { firstAuth = false; resolveReady(user); }
  authListeners.forEach(f => f(user));
});

function normOrder(snap) {
  const d = snap.data({ serverTimestamps: 'estimate' });
  return {
    id: snap.id, ...d, site: d.venue, channel: 'market',
    createdAt: ms(d.createdAt), acceptedAt: ms(d.acceptedAt), readyAt: ms(d.readyAt), doneAt: ms(d.doneAt), cancelledAt: ms(d.cancelledAt),
  };
}

async function placeOnce({ venue, date, dine, note, groups }) {
  const uid = auth.currentUser.uid;
  const refs = groups.map(() => doc(collection(db, 'quickgo_orders')));
  const out = await runTransaction(db, async tx => {
    const cRefs = groups.map(g => doc(db, 'quickgo_counters', `${venue}_${g.brandId}_${date}`));
    const snaps = [];
    for (const r of cRefs) snaps.push(await tx.get(r)); // 交易內必須先讀後寫
    return groups.map((g, i) => {
      const n = (snaps[i].exists() ? snaps[i].data().n : 0) + 1;
      if (snaps[i].exists()) tx.update(cRefs[i], { n }); else tx.set(cRefs[i], { n });
      const o = { venue, brandId: g.brandId, date, seq: n, callNo: g.code + pad3(n), lines: g.lines, total: g.total,
        dine, pay: 'counter', paid: false, status: 'new', createdAt: serverTimestamp(), uid };
      if (note) o.note = note;
      tx.set(refs[i], o);
      return { id: refs[i].id, brandId: g.brandId, callNo: o.callNo, seq: n, total: g.total };
    });
  });
  return out;
}

window.QGCloud = {
  mode: 'cloud',
  NOW,
  ready,
  user: () => auth.currentUser,
  isStaff: () => !!auth.currentUser && !auth.currentUser.isAnonymous,
  onAuth: f => { authListeners.add(f); return () => authListeners.delete(f); },
  staffSignIn: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
  staffSignOut: () => signOut(auth), // 登出後自動回到匿名

  // 一次交易建立多個品牌的訂單：每個品牌的計數器 +1，取餐號 = 品牌代碼 + 三位流水號
  // 尖峰時多人同時下單會搶同一個計數器：先讀到舊值的那筆，+1 後違反「只能 +1」規則而被拒（permission-denied，
  // Firestore 不會自動重試）→ 這裡以隨機退避重試，最多 10 次
  async placeOrders(args) {
    for (let attempt = 1; ; attempt++) {
      try { return await placeOnce(args); }
      catch (e) {
        const retryable = ['permission-denied', 'aborted', 'failed-precondition', 'unavailable'].includes(e.code);
        if (!retryable || attempt >= 10) throw e;
        await new Promise(r => setTimeout(r, 60 + Math.random() * 120 * attempt));
      }
    }
  },

  watchOrders(venue, date, cb, onErr) {
    const q = query(collection(db, 'quickgo_orders'), where('venue', '==', venue), where('date', '==', date));
    return onSnapshot(q, s => cb(s.docs.map(normOrder)), onErr);
  },

  // 期間報表：只用 date 單一欄位範圍查詢（不需另建複合索引），場域在前端過濾
  async ordersInRange(venue, from, to) {
    const q = query(collection(db, 'quickgo_orders'), where('date', '>=', from), where('date', '<=', to));
    const s = await getDocs(q);
    return s.docs.map(normOrder).filter(o => o.venue === venue);
  },

  updateOrder(id, patch) {
    const p = {};
    for (const [k, v] of Object.entries(patch)) p[k] = v === NOW ? serverTimestamp() : v;
    return updateDoc(doc(db, 'quickgo_orders', id), p);
  },

  watchMenuState(brandId, cb) {
    return onSnapshot(doc(db, 'quickgo_menu_state', brandId), s => cb(s.exists() ? s.data() : {}), () => cb({}));
  },
  setSoldOut(brandId, itemId, soldOut) {
    return setDoc(doc(db, 'quickgo_menu_state', brandId), { soldOut: { [itemId]: soldOut } }, { merge: true });
  },
};
window.dispatchEvent(new Event('qgcloud'));
