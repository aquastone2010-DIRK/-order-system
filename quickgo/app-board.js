'use strict';
// 前台：取餐叫號大螢幕（board.html）
// 封閉市場（科技廠）：工號末 3/4 碼叫號，同號時加註遮罩姓名
// 開放市場（美食街、飲料店）：品牌字母＋流水號叫號
const BD = { seen: null, voice: false, lastSpoken: [] };

function boardSlotNow() {
  const slots = Q.buildSlots(S.cfg);
  const now = new Date(); const m = now.getHours() * 60 + now.getMinutes();
  let cur = slots[0];
  for (const s of slots) if (Q.hmToMin(s) <= m) cur = s;
  return cur;
}

function speakCall(t) {
  if (!BD.voice || !('speechSynthesis' in window)) return;
  const n = callNo(t);
  const spaced = n.split('').join(' ');
  const text = modeOf(t.site) === 'closed' && t.empId
    ? `工號末${S.cfg.callDigits}碼，${spaced}，請取餐`
    : `${spaced} 號，請取餐`;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-TW'; u.rate = 0.9;
  speechSynthesis.speak(u);
  BD.lastSpoken.unshift(`${fmtTime(Date.now())} ${n}`); BD.lastSpoken.length = Math.min(BD.lastSpoken.length, 3);
}

function renderBoard() {
  const d = TODAY();
  const site = siteById(curSite);
  const closed = modeOf(curSite) === 'closed';
  const venue = venueById(curSite);
  // 美食街訂單來自 MS（雲端或單機）；員工餐廳一般點餐來自本機資料
  const mine = venueById(curSite) ? MS.orders.filter(o => o.date === d) : S.tickets.filter(t => t.date === d && t.site === curSite);
  const ready = mine.filter(t => t.status === 'ready').sort((a, b) => (b.readyAt || 0) - (a.readyAt || 0));
  const making = mine.filter(t => t.status === 'making' || t.status === 'new').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  // 新叫號偵測（第一次渲染只記錄不播報）
  const seen = new Map(ready.map(t => [t.id, t.readyAt || 0]));
  if (BD.seen) ready.filter(t => !BD.seen.has(t.id) || BD.seen.get(t.id) !== (t.readyAt || 0)).reverse().forEach(speakCall);
  BD.seen = seen;

  const now = Date.now();
  const label = t => {
    const dup = sameCallNo(t, d);
    const e = t.empId && empById(t.empId);
    if (closed) return dup.length && e ? Q.maskName(e.name) : '';
    const b = brandById(ticketBrand(t));
    return b ? b.name : '';
  };
  const est = Q.estimateWait(making.length, S.cfg.avgMakeSec, S.cfg.stations);
  const qs = Q.pickupStats(S.pickups.filter(p => p.date === d && p.site === curSite).map(p => p.sec), S.cfg.targetSec);
  const slot = boardSlotNow();
  const lockers = activeOrders(d, curSite).filter(o => o.slot === slot);
  const lockerWait = lockers.filter(o => o.status === 'paid').length;

  // 封閉市場：依實際名冊算「同時叫 N 人」的撞號機率
  const groups = Q.suffixGroups(S.employees.map(e => e.id), S.cfg.callDigits);
  const pColl = Q.suffixCollisionProb(groups, Math.max(ready.length + making.length, 2));

  const brandsUsed = (venue ? venue.brands : [...new Set(S.menus[d] ? menuFor(d).map(m => m.brandId) : [])]).map(brandById).filter(Boolean);
  // 開放市場：今日平均出餐時間（開單 → 叫號），來自實際單據
  const done = mine.filter(t => t.readyAt);
  const avgPrep = done.length ? done.reduce((a, t) => a + (t.readyAt - t.createdAt), 0) / done.length / 60000 : null;
  const tick = [
    `⚡ 預訂快取GO免排隊，刷員工證 ${S.cfg.targetSec} 秒取餐`,
    `⏰ 前一日 ${S.cfg.earlyBirdTime} 前預訂享早鳥 -${S.cfg.earlyBirdDiscount} 元`,
    S.cfg.flashEnabled ? `🌙 ${S.cfg.flashTime} 後現場快取 ${S.cfg.flashPct / 10} 折，減少剩食` : '',
    `🎫 餐券包最低每餐 ${money(Math.min(...S.passes.map(p => p.price / p.meals)))}`,
    `🟢 每取餐 1 次集 1 章，集滿 ${S.cfg.stampGoal} 章送免費套餐`,
  ].filter(Boolean).join('　　｜　　');

  $('#bSite').textContent = venue ? `${venue.name}・${venue.sub}` : closed ? site.name : `${site.name}・美食街`;
  $('#bMode').textContent = closed ? `工號末 ${S.cfg.callDigits} 碼叫號` : '取餐號叫號';
  $('#bVoice').textContent = BD.voice ? '🔊 語音叫號：開' : '🔇 點此開啟語音叫號';
  $('#bVoice').classList.toggle('on', BD.voice);

  $('#board').innerHTML = `
  <section class="b-ready">
    <h2>請取餐 <small>PLEASE PICK UP</small></h2>
    <div class="b-grid">${ready.slice(0, 12).map(t => {
      const fresh = t.readyAt && now - t.readyAt < 30000;
      const lb = label(t);
      const n = callNo(t);
      return `<div class="b-num ${fresh ? 'fresh' : ''} ${n.length >= 4 ? 'l4' : ''}"><b>${esc(n)}</b>${lb ? `<span>${esc(lb)}</span>` : ''}</div>`;
    }).join('') || '<div class="b-empty">目前沒有待取餐點</div>'}</div>
    ${ready.length > 12 ? `<div class="b-more">另有 ${ready.length - 12} 位待取，請至櫃台</div>` : ''}
  </section>
  <section class="b-making">
    <h2>製作中 <small>PREPARING</small></h2>
    <div class="b-list">${making.slice(0, 24).map(t => { const lb = label(t); return `<span>${esc(callNo(t))}${lb ? `<i>${esc(lb)}</i>` : ''}</span>`; }).join('') || '<div class="b-empty small">—</div>'}</div>
    <div class="b-wait">一般隊伍預估等候 <b>${Math.ceil(est / 60)}</b> 分鐘</div>
  </section>
  <section class="b-side">
    ${closed ? `
      <h2>⚡ 快取GO 美食櫃</h2>
      <div class="b-kpi"><b>${slot}</b><span>目前取餐時段</span></div>
      <div class="b-kpi"><b>${lockerWait}</b><span>已上櫃・待刷卡取餐</span></div>
      <div class="b-kpi"><b>${qs.count ? qs.avg.toFixed(1) + 's' : '≤' + S.cfg.targetSec + 's'}</b><span>今日平均取餐時間</span></div>
      <p>已預訂的同仁<b>不需排隊</b>，直接到美食櫃刷員工證取餐。</p>`
    : `
      <h2>品牌代碼</h2>
      ${brandsUsed.map(b => `<div class="b-brand"><b>${brandCode(b.id)}</b>${esc(b.name)}</div>`).join('')}
      <p>取餐號第一個字母代表品牌，請至對應櫃位取餐。</p>
      <div class="b-kpi"><b>${avgPrep == null ? '—' : avgPrep.toFixed(1) + ' 分'}</b><span>今日平均出餐時間（${done.length} 單）</span></div>
      ${venue ? `<div class="b-kpi" style="text-align:center"><span>手機點餐免排隊</span><div style="margin-top:6px;font-weight:900;font-size:clamp(14px,1.3vw,24px)">前台 → 美食街點餐</div></div>` : ''}`}
  </section>`;
  $('#bTicker').innerHTML = `<div><span>${esc(tick)}</span><span>${esc(tick)}</span></div>`;
  $('#bFoot').textContent = closed
    ? `取餐號 = 工號末 ${S.cfg.callDigits} 碼｜名冊 ${S.employees.length} 人、目前同時叫號 ${ready.length + making.length} 人，撞號機率 ${(pColl * 100).toFixed(1)}%｜同號時加註遮罩姓名`
    : `取餐號 = 品牌代碼 + 當日流水號`;
}
