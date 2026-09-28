'use strict';
// 後台：攤位接單（stall.html）— 平板用。新單響鈴 → 接單 → 完成叫號 → 已取餐；收款、售完、報表
const ST = { venue: null, brand: 'YJ', tab: 'orders', seen: null, sound: false, soldOut: {}, unsubMenu: null, rep: null, busy: new Set() };
const STATUS = { new: '待接單', making: '製作中', ready: '待取餐', done: '已取餐', cancelled: '已取消' };
const PAY = { cash: '現金', mobile: '行動支付' };

function stallPref(k, v) { try { if (v === undefined) return localStorage.getItem('quickgo_stall_' + k); localStorage.setItem('quickgo_stall_' + k, v); } catch (e) { return null; } }

// ── 提示音（瀏覽器規定需先點一下畫面才能發聲）──
let audioCtx = null;
function beep() {
  if (!ST.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = i === 2 ? 1320 : 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.25, audioCtx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.21);
    });
  } catch (e) {}
}

// ── 金額核對：用菜單價格重算，防止被竄改的訂單 ──
function priceCheck(o) {
  let expect = 0; const bad = [];
  for (const l of o.lines) {
    const it = QGMarket.item(l.id);
    if (!it || it.brandId !== o.brandId) { bad.push(`查無品項 ${l.name}`); continue; }
    if (l.unit !== it.price) bad.push(`${it.name} 單價 ${money(l.unit)}，菜單為 ${money(it.price)}`);
    expect += it.price * l.qty;
  }
  if (expect !== o.total) bad.push(`合計 ${money(o.total)}，依菜單應為 ${money(expect)}`);
  return { ok: bad.length === 0, expect, bad };
}

const mins = msv => Math.floor(msv / 60000);
function ago(t) { if (!t) return ''; const m = mins(Date.now() - t); return m < 1 ? '剛剛' : `${m} 分鐘前`; }

function brandOrders() { return MS.orders.filter(o => o.brandId === ST.brand); }

function renderStall() {
  const v = ST.venue;
  $('#stVenue').innerHTML = `${esc(v.name)} ${MS.badge()}`;
  $('#stBrands').innerHTML = v.brands.map(b => `<button class="chip ${b === ST.brand ? 'on' : ''}" data-stb="${b}">${brandCode(b)}｜${esc(brandById(b).name)}</button>`).join('');
  $('#stUser').innerHTML = MS.mode === 'cloud'
    ? (MS.isStaff() ? `<span class="small muted">${esc(MS.staffEmail())}</span> <button class="btn sm" id="stOut">登出</button>` : '')
    : '<span class="small muted">單機展示免登入</span>';
  $('#stSound').textContent = ST.sound ? '🔔 提示音：開' : '🔕 點此開啟提示音';
  $('#stSound').classList.toggle('pri', !ST.sound);
  document.querySelectorAll('[data-stb]').forEach(b => b.onclick = () => { ST.brand = b.dataset.stb; stallPref('brand', ST.brand); ST.seen = null; watchMenu(); renderStall(); });
  const out = $('#stOut'); if (out) out.onclick = () => MS.signOut().then(renderStall);

  const body = $('#stBody');
  if (!MS.isStaff()) { renderLogin(body); return; }
  $('#stTabs').innerHTML = [['orders', '📋 訂單'], ['soldout', '🚫 售完管理'], ['report', '📈 報表']].map(([k, n]) => `<button class="chip ${ST.tab === k ? 'on' : ''}" data-stt="${k}">${n}</button>`).join('');
  document.querySelectorAll('[data-stt]').forEach(b => b.onclick = () => { ST.tab = b.dataset.stt; renderStall(); });
  if (ST.tab === 'orders') renderOrders(body);
  else if (ST.tab === 'soldout') renderSoldOut(body);
  else renderReport(body);
}

function renderLogin(body) {
  $('#stTabs').innerHTML = '';
  body.innerHTML = `<div class="card" style="max-width:420px;margin:24px auto"><h3>🔐 攤位登入</h3><div class="pad">
    <p class="small muted">請用管理者建立的攤位帳號登入（Firebase Email／密碼）。</p>
    <label class="f">Email</label><input class="in" id="stEmail" type="email" autocomplete="username" value="${esc(stallPref('email') || '')}">
    <label class="f">密碼</label><input class="in" id="stPw" type="password" autocomplete="current-password">
    <div id="stErr" class="small" style="color:var(--bad);margin-top:6px"></div>
    <button class="btn pri" id="stLogin" style="width:100%;justify-content:center;margin-top:12px">登入</button>
  </div></div>`;
  const go = async () => {
    const email = $('#stEmail').value.trim(), pw = $('#stPw').value;
    if (!email || !pw) return ($('#stErr').textContent = '請輸入 Email 與密碼');
    $('#stLogin').disabled = true;
    try { await MS.signIn(email, pw); stallPref('email', email); ST.sound = true; beep(); renderStall(); }
    catch (e) { $('#stErr').textContent = e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' ? 'Email 或密碼錯誤' : '登入失敗：' + (e.code || e.message); $('#stLogin').disabled = false; }
  };
  $('#stLogin').onclick = go;
  $('#stPw').onkeydown = e => { if (e.key === 'Enter') go(); };
}

// ── 訂單看板 ──
function renderOrders(body) {
  const list = brandOrders();
  const by = s => list.filter(o => o.status === s).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const valid = list.filter(o => o.status !== 'cancelled');
  const revenue = valid.reduce((a, o) => a + o.total, 0);
  const unpaid = valid.filter(o => !o.paid).reduce((a, o) => a + o.total, 0);
  const card = o => {
    const pc = priceCheck(o);
    const busy = ST.busy.has(o.id);
    const act = {
      new: `<button class="btn pri" data-act="accept" data-id="${o.id}">接單</button>`,
      making: `<button class="btn pri" data-act="ready" data-id="${o.id}">完成・叫號</button>`,
      ready: `<button class="btn pri" data-act="done" data-id="${o.id}">已取餐</button><button class="btn sm" data-act="recall" data-id="${o.id}">再叫一次</button>`,
    }[o.status] || '';
    return `<div class="st-card ${o.status}">
      <div class="row" style="justify-content:space-between"><b class="st-no">${esc(o.callNo)}</b><span class="small muted">${fmtTime(o.createdAt)}・${ago(o.createdAt)}</span></div>
      <div class="row small"><span class="tag">${o.dine === 'in' ? '內用' : '外帶'}</span>${o.paid ? `<span class="tag ok">已收款・${PAY[o.payMethod] || ''}</span>` : '<span class="tag acc">未收款</span>'}</div>
      <div class="st-lines">${o.lines.map(l => `<div><span>${esc(l.name)}${l.opt ? `<i>${esc(l.opt)}</i>` : ''}</span><b>×${l.qty}</b></div>`).join('')}</div>
      ${o.note ? `<div class="small">📝 ${esc(o.note)}</div>` : ''}
      <div class="row" style="justify-content:space-between"><b>${money(o.total)}</b>${pc.ok ? '' : `<span class="tag bad" title="${esc(pc.bad.join('\n'))}">⚠️ 金額異常，應收 ${money(pc.expect)}</span>`}</div>
      <div class="row">${busy ? '<span class="small muted">處理中…</span>' : act}
        ${!busy && !o.paid ? `<button class="btn sm" data-act="pay-cash" data-id="${o.id}">收現金</button><button class="btn sm" data-act="pay-mobile" data-id="${o.id}">收行動支付</button>` : ''}
        ${!busy && (o.status === 'new' || o.status === 'making') ? `<button class="btn sm danger" data-act="cancel" data-id="${o.id}">取消</button>` : ''}</div>
    </div>`;
  };
  const col = (s, title) => `<div class="st-col"><h3>${title} <span class="tag">${by(s).length}</span></h3>${by(s).map(card).join('') || '<p class="small muted">無</p>'}</div>`;
  const closed = list.filter(o => o.status === 'done' || o.status === 'cancelled').sort((a, b) => (b.doneAt || b.cancelledAt || 0) - (a.doneAt || a.cancelledAt || 0));
  body.innerHTML = `
  <div class="grid g4" style="margin-bottom:12px">
    <div class="card kpi"><b>${by('new').length}</b><span>待接單</span></div>
    <div class="card kpi"><b>${by('making').length + by('ready').length}</b><span>製作中＋待取</span></div>
    <div class="card kpi"><b>${money(revenue)}</b><span>今日營業額（${valid.length} 單）</span></div>
    <div class="card kpi"><b>${money(unpaid)}</b><span>未收款</span></div>
  </div>
  <div class="st-board">${col('new', '🆕 新訂單')}${col('making', '🔥 製作中')}${col('ready', '📣 待取餐')}</div>
  <details class="card pad" style="margin-top:12px"><summary><b>今日已結束 ${closed.length} 單</b></summary>
    <table style="margin-top:8px"><thead><tr><th>取餐號</th><th>時間</th><th>內容</th><th class="num">金額</th><th>狀態</th></tr></thead><tbody>
    ${closed.map(o => `<tr><td><b>${esc(o.callNo)}</b></td><td>${fmtTime(o.createdAt)}</td><td class="small">${esc(o.lines.map(l => `${l.name}×${l.qty}`).join('、'))}</td><td class="num">${money(o.total)}</td>
      <td><span class="tag ${o.status === 'done' ? 'ok' : 'bad'}">${STATUS[o.status]}</span>${o.cancelReason ? `<div class="small muted">${esc(o.cancelReason)}</div>` : ''}${o.status === 'done' && !o.paid ? '<div class="small" style="color:var(--bad)">未收款</div>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">無</td></tr>'}
    </tbody></table></details>`;
  body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act, b.dataset.id));
}

async function act(kind, id) {
  const o = MS.orders.find(x => x.id === id); if (!o) return;
  let patch;
  if (kind === 'accept') patch = { status: 'making', acceptedAt: MS.NOW };
  else if (kind === 'ready' || kind === 'recall') patch = { status: 'ready', readyAt: MS.NOW };
  else if (kind === 'done') {
    if (!o.paid && !confirm(`${o.callNo} 尚未收款（${money(o.total)}），確定已取餐？`)) return;
    patch = { status: 'done', doneAt: MS.NOW };
  } else if (kind === 'pay-cash' || kind === 'pay-mobile') patch = { paid: true, payMethod: kind === 'pay-cash' ? 'cash' : 'mobile' };
  else if (kind === 'cancel') {
    const r = prompt(`取消 ${o.callNo} 的原因（顧客會看到）：`, '品項售完');
    if (r === null) return;
    patch = { status: 'cancelled', cancelledAt: MS.NOW, cancelReason: r.slice(0, 60) || '攤位取消' };
  }
  ST.busy.add(id); renderStall();
  try { await MS.update(id, patch); }
  catch (e) { toast('更新失敗：' + (e.code || e.message)); }
  finally { ST.busy.delete(id); renderStall(); }
}

// ── 售完管理 ──
function watchMenu() {
  if (ST.unsubMenu) ST.unsubMenu();
  ST.unsubMenu = MS.watchMenu(ST.brand, so => { ST.soldOut = so; if (ST.tab === 'soldout') renderStall(); });
}
function renderSoldOut(body) {
  const b = QGMarket.brands[ST.brand];
  const d = TODAY();
  body.innerHTML = `<div class="note">按一下切換「今日售完」，顧客點餐頁會立即顯示售完、無法加入購物車；含該品項的套餐也會一併停售。</div>
  ${b.categories.map(c => `<div class="card" style="margin-bottom:12px"><h3>${esc(c.name)}</h3><div class="pad st-so">
    ${c.items.map(it => { const so = !!ST.soldOut[it.id]; const fresh = QGMarket.isAvailable(QGMarket.item(it.id), d);
      return `<button class="st-sobtn ${so ? 'sold' : ''}" data-so="${it.id}" ${fresh ? '' : 'disabled'}>
        <span>${it.no ? it.no + '. ' : ''}${esc(it.name)}</span><b>${fresh ? (so ? '售完' : '供應中') : QGMarket.availableFrom(QGMarket.item(it.id)).slice(5).replace('-', '/') + ' 上市'}</b></button>`; }).join('')}
  </div></div>`).join('')}`;
  body.querySelectorAll('[data-so]').forEach(x => x.onclick = async () => {
    x.disabled = true;
    try { await MS.setSoldOut(ST.brand, x.dataset.so, !ST.soldOut[x.dataset.so]); }
    catch (e) { toast('更新失敗：' + (e.code || e.message)); x.disabled = false; }
  });
}

// ── 報表（日／月／自訂期間）──
function reportStats(list) {
  const valid = list.filter(o => o.status !== 'cancelled');
  const items = {};
  for (const o of valid) for (const l of o.lines) {
    const k = l.id + '|' + l.name;
    const r = items[k] || (items[k] = { name: l.name, qty: 0, revenue: 0 });
    r.qty += l.qty; r.revenue += l.qty * l.unit;
  }
  const prep = valid.filter(o => o.readyAt && o.createdAt).map(o => (o.readyAt - o.createdAt) / 60000);
  const hours = {};
  for (const o of valid) { const h = new Date(o.createdAt).getHours(); hours[h] = (hours[h] || 0) + 1; }
  const sumBy = f => valid.filter(f).reduce((a, o) => a + o.total, 0);
  return {
    count: valid.length, cancelled: list.length - valid.length,
    revenue: sumBy(() => true), paid: sumBy(o => o.paid), unpaid: sumBy(o => !o.paid),
    cash: sumBy(o => o.paid && o.payMethod === 'cash'), mobile: sumBy(o => o.paid && o.payMethod === 'mobile'),
    avgPrep: prep.length ? prep.reduce((a, b) => a + b, 0) / prep.length : null, prepN: prep.length,
    items: Object.values(items).sort((a, b) => b.revenue - a.revenue), hours, valid,
  };
}
function renderReport(body) {
  const d = TODAY();
  if (!ST.rep) ST.rep = { from: d, to: d, list: null, loading: false };
  const r = ST.rep;
  const range = (f, t) => { r.from = f; r.to = t; r.list = null; renderStall(); };
  body.innerHTML = `<div class="row" style="margin-bottom:12px">
    <button class="chip ${r.from === d && r.to === d ? 'on' : ''}" data-rg="today">今日</button>
    <button class="chip ${r.from === d.slice(0, 8) + '01' && r.to === d ? 'on' : ''}" data-rg="month">本月</button>
    <input class="in" type="date" id="rFrom" value="${r.from}" style="width:auto"> ～ <input class="in" type="date" id="rTo" value="${r.to}" style="width:auto">
    <button class="btn sm" id="rGo">查詢</button><div class="grow"></div><button class="btn sm" id="rCsv" ${r.list ? '' : 'disabled'}>匯出 CSV</button></div>
    <div id="rBody"><p class="muted">讀取中…</p></div>`;
  body.querySelector('[data-rg="today"]').onclick = () => range(d, d);
  body.querySelector('[data-rg="month"]').onclick = () => range(d.slice(0, 8) + '01', d);
  $('#rGo').onclick = () => { const f = $('#rFrom').value, t = $('#rTo').value; if (!f || !t || f > t) return toast('日期區間不正確'); range(f, t); };
  if (!r.list) {
    if (!r.loading) {
      r.loading = true;
      MS.range(ST.venue.id, r.from, r.to).then(list => { r.list = list; }, e => { r.list = []; toast('讀取失敗：' + (e.code || e.message)); }).finally(() => { r.loading = false; if (ST.tab === 'report') renderStall(); });
    }
    return;
  }
  const list = r.list.filter(o => o.brandId === ST.brand);
  const s = reportStats(list);
  const maxH = Math.max(1, ...Object.values(s.hours));
  $('#rBody').innerHTML = `
  <div class="grid g4" style="margin-bottom:12px">
    <div class="card kpi"><b>${money(s.revenue)}</b><span>營業額（${s.count} 單，取消 ${s.cancelled}）</span></div>
    <div class="card kpi"><b>${money(s.paid)}</b><span>已收：現金 ${money(s.cash)}・行動 ${money(s.mobile)}</span></div>
    <div class="card kpi"><b>${money(s.unpaid)}</b><span>未收款</span></div>
    <div class="card kpi"><b>${s.avgPrep == null ? '—' : s.avgPrep.toFixed(1) + ' 分'}</b><span>平均出餐（下單→叫號，${s.prepN} 單）</span></div>
  </div>
  <div class="grid g2">
    <div class="card"><h3>品項銷售</h3><div class="scroll"><table><thead><tr><th>品項</th><th class="num">數量</th><th class="num">營業額</th><th class="num">占比</th></tr></thead><tbody>
      ${s.items.map(i => `<tr><td>${esc(i.name)}</td><td class="num">${i.qty}</td><td class="num">${money(i.revenue)}</td><td class="num">${s.revenue ? (i.revenue / s.revenue * 100).toFixed(1) + '%' : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">無資料</td></tr>'}
    </tbody></table></div></div>
    <div class="card"><h3>時段訂單數</h3><div class="pad">
      ${Object.keys(s.hours).sort((a, b) => a - b).map(h => `<div class="row small" style="flex-wrap:nowrap"><span style="width:52px">${String(h).padStart(2, '0')}:00</span><div class="meter" style="flex:1"><i style="width:${s.hours[h] / maxH * 100}%"></i></div><b style="width:32px;text-align:right">${s.hours[h]}</b></div>`).join('') || '<span class="muted small">無資料</span>'}
    </div></div>
  </div>`;
  $('#rCsv').onclick = () => {
    const rows = [['日期', '取餐號', '時間', '內外帶', '品項', '金額', '收款', '收款方式', '狀態', '取消原因']];
    for (const o of list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))
      rows.push([o.date, o.callNo, fmtTime(o.createdAt), o.dine === 'in' ? '內用' : '外帶', o.lines.map(l => `${l.name}${l.opt ? `(${l.opt})` : ''}×${l.qty}`).join('、'), o.total, o.paid ? '已收' : '未收', PAY[o.payMethod] || '', STATUS[o.status], o.cancelReason || '']);
    rows.push([]); rows.push(['品項', '數量', '營業額']);
    s.items.forEach(i => rows.push([i.name, i.qty, i.revenue]));
    download(`快取GO_${brandById(ST.brand).name}_${r.from}_${r.to}.csv`, csv(rows));
  };
}

// 新單偵測：響鈴＋標題閃爍
function onOrders() {
  const news = brandOrders().filter(o => o.status === 'new');
  const ids = new Set(news.map(o => o.id));
  if (ST.seen && news.some(o => !ST.seen.has(o.id))) { beep(); try { navigator.vibrate && navigator.vibrate(300); } catch (e) {} }
  ST.seen = ids;
  document.title = news.length ? `(${news.length}) 新訂單・快取GO 攤位` : '快取GO 攤位接單';
  if (MS.isStaff() && ST.tab === 'orders') renderStall(); // 登入畫面不重繪，避免清掉輸入中的帳密
}
