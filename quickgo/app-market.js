'use strict';
// 前台：美食街點餐（market.html）— 開放市場，選品牌 → 點餐 → 結帳 → 取得各攤位取餐號
const MK = { venue: null, brand: 'YJ', cat: null, cart: [], dine: 'out', sheet: null, soldOut: {}, busy: false, lastStatus: {} };
const MY_KEY = 'quickgo_market_mine'; // 本機「我的取餐號」（僅此裝置的便利功能）

function myTickets() { try { return JSON.parse(localStorage.getItem(MY_KEY) || '[]'); } catch (e) { return []; } }
function saveMine(ids) { try { localStorage.setItem(MY_KEY, JSON.stringify(ids.slice(-20))); } catch (e) {} }

const mmd = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
function priceTag(it) {
  if (!it.parts && it.listedSaving == null) return `<b class="mk-price">${money(it.price)}</b>`;
  const v = QGMarket.setValue(it);
  return `<b class="mk-price">${money(it.price)}</b> ${v.original ? `<s class="muted small">${money(v.original)}</s>` : ''} <span class="tag ok">省 ${money(v.saving)}</span>`;
}

// 售完：品項本身售完，或套餐的任一組成品項售完
function isSoldOut(it) {
  const so = MK.soldOut[it.brandId] || {};
  return !!so[it.id] || (it.parts || []).some(p => so[p]);
}

function renderMarket() {
  const d = TODAY();
  const v = MK.venue;
  const b = QGMarket.brands[MK.brand];
  if (!MK.cat || !b.categories.find(c => c.id === MK.cat)) MK.cat = b.categories[0].id;
  const cat = b.categories.find(c => c.id === MK.cat);

  $('#mkVenue').innerHTML = `${esc(v.name)}｜${esc(v.sub)} ${MS.badge()}`;
  $('#mkBrands').innerHTML = v.brands.map(id => {
    const x = QGMarket.brands[id];
    return `<button class="mk-brand ${id === MK.brand ? 'on' : ''}" data-brand="${id}" style="--bc:var(--${id.toLowerCase()})">
      <img src="${x.logo || x.hero}" alt="" loading="lazy"><span><b>${esc(x.name)}</b><small>${esc(x.tagline)}</small></span>
      <i class="mk-code">${brandCode(id)}</i></button>`;
  }).join('');

  $('#mkHero').innerHTML = `<div class="mk-hero" style="--bc:var(--${MK.brand.toLowerCase()})">
    <img src="${b.hero}" alt="${esc(b.name)}">
    <div class="mk-hero-text">
      ${b.logo ? `<img class="mk-logo" src="${b.logo}" alt="">` : ''}
      <h2>${esc(b.name)}${b.en ? ` <small>${esc(b.en)}</small>` : ''}</h2>
      <p class="mk-tag">${esc(b.tagline)}</p>
      ${b.heroTitle ? `<p class="mk-new"><span class="tag acc">新品</span> <b>${esc(b.heroTitle)}</b><br><span class="small">${esc(b.heroText)}（價格請洽門市）</span></p>` : ''}
      ${b.notes ? `<div class="chips">${b.notes.map(n => `<span class="tag">${esc(n)}</span>`).join('')}</div>` : ''}
      <p class="small">取餐號以 <b>${brandCode(MK.brand)}</b> 開頭，完成後會顯示在叫號大螢幕</p>
    </div>
    ${b.line ? `<div class="mk-line"><img src="${b.line}" alt="LINE QR code"><span>加入 LINE<br>好友</span></div>` : ''}
  </div>`;

  $('#mkCats').innerHTML = b.categories.map(c => `<button class="chip ${c.id === MK.cat ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');

  $('#mkItems').innerHTML = `
    ${cat.img || cat.note || cat.tag ? `<div class="mk-cathead">${cat.img ? `<img src="${cat.img}" alt="">` : ''}<div><b>${esc(cat.name)}</b>${cat.tag ? ` <span class="tag acc">${esc(cat.tag)}</span>` : ''}${cat.note ? `<div class="small muted">${esc(cat.note)}</div>` : ''}${cat.img ? '<div class="small muted">示意照片</div>' : ''}</div></div>` : ''}
    <div class="mk-grid">${cat.items.map(raw => {
      const it = QGMarket.item(raw.id);
      const sold = isSoldOut(it);
      const ok = QGMarket.isAvailable(it, d) && !sold;
      const from = QGMarket.availableFrom(it);
      // 有單品照才顯示大圖；其餘用精簡卡片，避免大量空白
      return `<button class="mk-item ${ok ? '' : 'off'} ${it.img ? 'photo' : 'compact'}" data-item="${it.id}" ${ok ? '' : 'disabled'}>
        ${it.img ? `<img src="${it.img}" alt="" loading="lazy">` : ''}
        <div class="mk-body">
          <div class="mk-name">${it.no ? `<span class="muted">${it.no}.</span> ` : ''}${esc(it.name)}${it.tag ? ` <span class="tag acc">${esc(it.tag)}</span>` : ''}</div>
          ${it.note ? `<div class="small muted">${esc(it.note)}</div>` : ''}
          ${it.desc ? `<div class="small muted">${esc(it.desc)}</div>` : ''}
          <div class="mk-row">${priceTag(it)}${ok ? '<span class="mk-add">＋</span>' : sold ? '<span class="tag bad">今日售完</span>' : `<span class="tag bad">${mmd(from)} 上市</span>`}</div>
        </div></button>`;
    }).join('')}</div>`;

  renderCart();
  renderMine();

  document.querySelectorAll('[data-brand]').forEach(x => x.onclick = () => { MK.brand = x.dataset.brand; MK.cat = null; renderMarket(); });
  document.querySelectorAll('[data-cat]').forEach(x => x.onclick = () => { MK.cat = x.dataset.cat; renderMarket(); });
  document.querySelectorAll('[data-item]').forEach(x => x.onclick = () => openSheet(x.dataset.item));
}

// ── 品項選項（飯／麵、甜度冰塊、數量）──────────────────────────
function openSheet(id) {
  const it = QGMarket.item(id);
  const b = QGMarket.brands[it.brandId];
  const drink = !!b.drinkOptions;
  MK.sheet = { id, qty: 1, choice: it.choice ? it.choice.options[0] : null, sugar: drink ? b.drinkOptions.sugar[0] : null, ice: drink ? b.drinkOptions.ice[0] : null };
  const radios = (key, label, opts) => `<label class="f">${label}</label><div class="chips">${opts.map(o => `<button class="chip ${MK.sheet[key] === o ? 'on' : ''}" data-opt="${key}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  const draw = () => {
    $('#mkSheet').innerHTML = `<div class="mk-sheet" role="dialog" aria-modal="true" aria-label="${esc(it.name)}">
      ${it.img ? `<img src="${it.img}" alt="">` : ''}
      <h3>${esc(it.name)}</h3>
      ${it.desc ? `<p class="small muted">${esc(it.desc)}</p>` : ''}
      <div>${priceTag(it)}</div>
      ${it.choice ? radios('choice', it.choice.label, it.choice.options) : ''}
      ${drink ? radios('sugar', '甜度', b.drinkOptions.sugar) + radios('ice', '冰塊／溫度', b.drinkOptions.ice) : ''}
      <label class="f">數量</label>
      <div class="row"><button class="btn" data-q="-1" aria-label="減少">－</button><b style="min-width:32px;text-align:center;font-size:18px">${MK.sheet.qty}</b><button class="btn" data-q="1" aria-label="增加">＋</button></div>
      <div class="row" style="margin-top:16px"><button class="btn" id="mkCancel">取消</button><button class="btn pri grow" id="mkAddBtn" style="justify-content:center">加入購物車・${money(it.price * MK.sheet.qty)}</button></div>
    </div>`;
    $('#mkSheet').classList.add('on');
    $('#mkSheet').querySelectorAll('[data-opt]').forEach(x => x.onclick = () => { MK.sheet[x.dataset.opt] = x.dataset.val; draw(); });
    $('#mkSheet').querySelectorAll('[data-q]').forEach(x => x.onclick = () => { MK.sheet.qty = Math.max(1, Math.min(20, MK.sheet.qty + Number(x.dataset.q))); draw(); });
    $('#mkCancel').onclick = closeSheet;
    $('#mkAddBtn').onclick = () => {
      const opt = [MK.sheet.choice, MK.sheet.sugar, MK.sheet.ice].filter(Boolean).join('・');
      const line = MK.cart.find(l => l.id === id && l.opt === opt);
      if (line) line.qty += MK.sheet.qty; else MK.cart.push({ id, opt, qty: MK.sheet.qty });
      closeSheet(); toast(`已加入：${it.name}${opt ? `（${opt}）` : ''} ×${MK.sheet.qty}`); renderCart();
    };
  };
  draw();
}
function closeSheet() { $('#mkSheet').classList.remove('on'); $('#mkSheet').innerHTML = ''; }

// ── 購物車與結帳 ────────────────────────────────────────────
function renderCart() {
  const sum = QGMarket.cartSummary(MK.cart.map(l => ({ id: l.id, qty: l.qty })));
  const count = MK.cart.reduce((a, l) => a + l.qty, 0);
  const groups = MK.venue.brands.filter(b => MK.cart.some(l => QGMarket.item(l.id).brandId === b));
  $('#mkCart').innerHTML = `<h3>🛒 購物車 <span class="tag">${count} 件</span></h3>
    ${groups.map(bid => `<div class="mk-cgroup"><div class="small"><b>${esc(QGMarket.brands[bid].name)}</b> <span class="muted">取餐號 ${brandCode(bid)} 開頭</span></div>
      ${MK.cart.map((l, i) => ({ l, i, it: QGMarket.item(l.id) })).filter(x => x.it.brandId === bid).map(({ l, i, it }) => `
        <div class="mk-cline"><div><div>${esc(it.name)}</div>${l.opt ? `<div class="small muted">${esc(l.opt)}</div>` : ''}</div>
          <div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm" data-cq="${i}" data-d="-1" aria-label="減少">－</button><b>${l.qty}</b><button class="btn sm" data-cq="${i}" data-d="1" aria-label="增加">＋</button></div>
          <div class="num">${money(it.price * l.qty)}</div></div>`).join('')}
      <div class="small num muted">小計 ${money(sum.byBrand[bid].total)}</div></div>`).join('') || '<p class="small muted">尚未選購，點選左側品項加入</p>'}
    ${sum.errors.length ? `<div class="note bad">${sum.errors.map(esc).join('<br>')}</div>` : ''}
    <label class="f">用餐方式</label>
    <div class="chips">${[['out', '外帶'], ['in', '內用']].map(([k, n]) => `<button class="chip ${MK.dine === k ? 'on' : ''}" data-dine="${k}">${n}</button>`).join('')}</div>
    <label class="f">付款方式</label>
    <div class="small">取餐時於攤位櫃台付款（現金／行動支付）</div>
    <div class="lines" style="margin-top:12px"><div class="tot"><span>合計</span><span>${money(sum.total)}</span></div></div>
    <button class="btn pri" id="mkCheckout" style="width:100%;justify-content:center;padding:12px;margin-top:10px" ${count && sum.ok && !MK.busy ? '' : 'disabled'}>${MK.busy ? '送出中…' : '確認下單・取號'}</button>
    <p class="small muted" style="margin-top:8px">不同攤位分別出餐，會各給一個取餐號。</p>`;
  $('#mkCartBar').innerHTML = count ? `<span>🛒 ${count} 件・<b>${money(sum.total)}</b></span><a class="btn pri sm" href="#mkCart">前往結帳</a>` : '';
  $('#mkCartBar').classList.toggle('hide', !count);
  document.querySelectorAll('[data-cq]').forEach(x => x.onclick = () => {
    const l = MK.cart[Number(x.dataset.cq)]; l.qty += Number(x.dataset.d);
    if (l.qty <= 0) MK.cart.splice(Number(x.dataset.cq), 1);
    renderCart();
  });
  document.querySelectorAll('[data-dine]').forEach(x => x.onclick = () => { MK.dine = x.dataset.dine; renderCart(); });
  $('#mkCheckout').onclick = checkout;
}

async function checkout() {
  if (MK.busy) return;
  const d = TODAY();
  const lines = MK.cart.map(l => ({ id: l.id, qty: l.qty }));
  const sum = QGMarket.cartSummary(lines);
  if (!lines.length || !sum.ok) return toast(sum.errors[0] || '購物車是空的');
  const items = MK.cart.map(l => QGMarket.item(l.id));
  const late = items.find(it => !QGMarket.isAvailable(it, d));
  if (late) return toast(`${late.name} 尚未上市`);
  const sold = items.find(isSoldOut);
  if (sold) return toast(`${sold.name} 今日已售完，請移除後再下單`);
  const groups = MK.venue.brands.map(bid => {
    const mine = MK.cart.filter(l => QGMarket.item(l.id).brandId === bid);
    if (!mine.length) return null;
    const tLines = mine.map(l => { const it = QGMarket.item(l.id); return { id: it.id, name: it.name, opt: l.opt || '', qty: l.qty, unit: it.price }; });
    return { brandId: bid, lines: tLines, total: sum.byBrand[bid].total };
  }).filter(Boolean);
  MK.busy = true; renderCart();
  let made;
  try {
    made = await MS.place({ venue: MK.venue.id, date: d, dine: MK.dine, groups });
  } catch (e) {
    MK.busy = false; renderCart();
    return toast('下單失敗，請再試一次（' + (e.code || e.message) + '）');
  }
  MK.busy = false;
  saveMine([...myTickets(), ...made.map(t => t.id)]);
  MK.cart = [];
  $('#mkSheet').innerHTML = `<div class="mk-sheet" role="dialog" aria-modal="true" aria-label="下單完成">
    <h3>✅ 下單完成</h3>
    <p class="small muted">請記下取餐號。餐點完成時，本頁與叫號大螢幕都會顯示「請取餐」；取餐時於攤位櫃台付款。</p>
    ${made.map(t => `<div class="mk-done"><span>${esc(brandById(t.brandId).name)}</span><b>${esc(t.callNo)}</b><span>${money(t.total)}</span></div>`).join('')}
    <div class="row" style="margin-top:14px"><a class="btn" href="board.html?site=${MK.venue.id}" target="_blank">查看叫號大螢幕 ↗</a><button class="btn pri grow" id="mkOk" style="justify-content:center">好</button></div>
  </div>`;
  $('#mkSheet').classList.add('on');
  $('#mkOk').onclick = closeSheet;
  renderMarket();
}

// 我的取餐號（此裝置今日）：訂單狀態即時更新，變成「請取餐」時震動提醒
function renderMine() {
  const ids = new Set(myTickets());
  const list = MS.orders.filter(t => ids.has(t.id)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const st = { new: ['待接單', ''], making: ['製作中', 'info'], ready: ['請取餐', 'acc'], done: ['已取餐', 'ok'], cancelled: ['已取消', 'bad'] };
  for (const t of list) {
    if (MK.lastStatus[t.id] && MK.lastStatus[t.id] !== 'ready' && t.status === 'ready') {
      try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) {}
      toast(`🔔 ${brandById(t.brandId).name} ${t.callNo} 請取餐`);
    }
    MK.lastStatus[t.id] = t.status;
  }
  const readyN = list.filter(t => t.status === 'ready').length;
  document.title = readyN ? `(${readyN}) 請取餐・快取GO` : '快取GO 美食街點餐';
  $('#mkMine').innerHTML = list.length ? `<h3>🎫 我的取餐號（今日）</h3>${list.map(t => `<div class="mk-done ${t.status === 'ready' ? 'ready' : ''}"><span>${esc(brandById(t.brandId).name)}</span><b>${esc(t.callNo)}</b><span class="tag ${st[t.status][1]}">${st[t.status][0]}</span></div>
    ${t.status === 'cancelled' && t.cancelReason ? `<div class="small" style="color:var(--bad)">原因：${esc(t.cancelReason)}</div>` : ''}`).join('')}` : '';
  $('#mkMine').classList.toggle('hide', !list.length);
}
