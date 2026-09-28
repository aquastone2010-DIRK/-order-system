'use strict';
// 前台：快取GO 取餐站（kiosk.html）
// ════════════════════════════════════════════════════════════
// 3️⃣ 快取GO 取餐站（30 秒刷卡取餐）
// ════════════════════════════════════════════════════════════
const K = { phase: 'idle', start: 0, emp: null, msg: '', sub: '', locker: '', resetT: null, tick: null };

function kioskReset() {
  clearTimeout(K.resetT); clearInterval(K.tick);
  Object.assign(K, { phase: 'idle', start: 0, emp: null, msg: '', sub: '', locker: '' });
  renderKiosk();
}
function kioskElapsed() { return K.start ? (performance.now() - K.start) / 1000 : 0; }
function kioskStart() {
  if (K.start) return;
  K.start = performance.now();
  clearInterval(K.tick);
  K.tick = setInterval(() => { const t = $('#kTimer'); if (t) { const s = kioskElapsed(); t.textContent = s.toFixed(1) + 's'; t.classList.toggle('late', s > S.cfg.targetSec); } }, 100);
}
function kioskFinish(type, msg, sub, locker) {
  const sec = Math.round(kioskElapsed() * 10) / 10;
  clearInterval(K.tick);
  S.pickups.push({ date: TODAY(), site: curSite, sec, type, at: Date.now() });
  Object.assign(K, { phase: 'done', msg, sub: sub + `｜本次 ${sec} 秒${sec <= S.cfg.targetSec ? ' ✅' : ''}`, locker });
  save(); renderKiosk();
  K.resetT = setTimeout(kioskReset, 5000);
  return sec;
}
function kioskScan(code) {
  if (!code.trim()) return;
  kioskStart();
  const e = findEmp(code);
  if (!e) { Object.assign(K, { phase: 'error', msg: '查無此員工證', sub: '請重新刷卡或洽服務人員' }); clearInterval(K.tick); renderKiosk(); K.resetT = setTimeout(kioskReset, 3000); return; }
  K.emp = e.id;
  const d = TODAY();
  const mine = S.orders.filter(o => o.date === d && o.empId === e.id && o.status !== 'cancelled');
  const pending = mine.find(o => o.status === 'paid' && o.site === curSite);
  if (pending) {
    const t = tpl(pending.setId);
    pending.status = 'picked'; pending.pickedAt = Date.now();
    const msgs = rewardOnConsume(e, pending.total + (pending.passCost || 0), d);
    pending.pickupSec = kioskFinish('pre', `${e.name}，請至 ${pending.locker}`, `${t.emoji} ${t.name}（已預付）${msgs.length ? '｜' + msgs.join('・') : ''}`, pending.locker);
    save();
    return;
  }
  const elsewhere = mine.find(o => o.status === 'paid');
  const picked = mine.find(o => o.status === 'picked');
  K.phase = 'choose';
  K.msg = `${e.name} 您好`;
  K.sub = elsewhere ? `⚠️ 您預訂的餐點在「${siteById(elsewhere.site).name}」${elsewhere.locker}，也可在此購買現場快取` :
    picked ? `今日預訂已於 ${fmtTime(picked.pickedAt)} 取餐。如需加購請選擇：` : '今日無預訂，請點選現場快取套餐（員工證扣款）';
  renderKiosk();
}
function kioskBuy(setId) {
  const e = empById(K.emp); const d = TODAY(); const now = new Date();
  const fc = forecastFor(d, curSite);
  if (walkinStock(d, curSite, setId, fc) <= 0) return toast('已售完');
  const t = tpl(setId);
  const price = Q.computePrice({ price: t.price, channel: 'walkin', serviceDate: d, now, cfg: S.cfg, tierPct: tierOf(e).tier.discountPct });
  const w = { id: uid('w'), date: d, site: curSite, empId: e.id, setId, total: price.total, lines: price.lines, at: Date.now(), pay: 'badge' };
  S.walkins.push(w);
  const msgs = rewardOnConsume(e, price.total, d);
  w.sec = kioskFinish('walkin', `${e.name}，請取 ${t.name}`, `${t.emoji} 現場快取架「${t.id}」｜員工證扣款 ${money(price.total)}${msgs.length ? '｜' + msgs.join('・') : ''}`, t.id);
  save();
}

function renderKiosk() {
  const el = $('#v-kiosk');
  const d = TODAY();
  const menu = menuFor(d);
  const fc = forecastFor(d, curSite);
  const now = new Date();
  const flash = S.cfg.flashEnabled && now.getHours() * 60 + now.getMinutes() >= Q.hmToMin(S.cfg.flashTime);
  const ps = S.pickups.filter(p => p.date === d && p.site === curSite);
  const stat = Q.pickupStats(ps.map(p => p.sec), S.cfg.targetSec);
  const pendingHere = activeOrders(d, curSite).filter(o => o.status === 'paid').length;
  const e = K.emp && empById(K.emp);
  let center = '';
  if (K.phase === 'idle') center = `
      <div class="big">請刷員工證取餐</div>
      <div style="opacity:.8">已預訂：刷卡即顯示櫃號　｜　未預訂：刷卡後點選現場快取套餐</div>
      <input id="kInput" placeholder="刷卡 / 輸入工號後按 Enter" autocomplete="off">
      <div class="row"><button class="kbtn ghost" id="kDemoPre">模擬：有預訂員工</button><button class="kbtn ghost" id="kDemoWalk">模擬：未預訂員工</button></div>`;
  else if (K.phase === 'choose') center = `
      <div class="row"><div class="big grow">${esc(K.msg)}</div><div class="timer" id="kTimer">0.0s</div></div>
      <div>${esc(K.sub)}</div>
      <div class="kopts">${menu.map(m => {
        const stock = walkinStock(d, curSite, m.id, fc);
        const p = Q.computePrice({ price: m.price, channel: 'walkin', serviceDate: d, now, cfg: S.cfg, tierPct: tierOf(e).tier.discountPct });
        return `<button class="kopt" data-buy="${m.id}" ${stock <= 0 ? 'disabled' : ''}><span style="font-size:26px">${m.emoji}</span><b>${esc(m.name)}</b>
          ${p.total !== m.price ? `<s>${money(m.price)}</s> ` : ''}<b style="display:inline">${money(p.total)}</b><div class="small">${stock <= 0 ? '已售完' : '現貨 ' + stock}</div></button>`;
      }).join('')}</div>
      <div><button class="kbtn ghost" id="kCancel">取消</button></div>`;
  else if (K.phase === 'done') center = `
      <div style="font-size:18px">✅ 完成</div>
      <div class="big">${esc(K.msg)}</div>
      <div><span class="locker-big">${esc(K.locker)}</span></div>
      <div>${esc(K.sub)}</div>
      <div><button class="kbtn" id="kNext">下一位</button></div>`;
  else center = `<div class="big">❌ ${esc(K.msg)}</div><div>${esc(K.sub)}</div><div><button class="kbtn" id="kNext">重新刷卡</button></div>`;

  el.innerHTML = `
  <div class="grid side">
    <div class="kiosk">${center}</div>
    <div class="grid" style="align-self:start">
      <div class="card"><h3>⏱️ 今日取餐速度 <span class="muted small">${esc(siteById(curSite).name)}</span></h3>
        <div class="grid g2">
          <div class="kpi"><b>${stat.count ? stat.avg.toFixed(1) + 's' : '—'}</b><span>平均取餐秒數</span></div>
          <div class="kpi"><b>${stat.count ? pct(stat.underRate, 0) : '—'}</b><span>${S.cfg.targetSec} 秒內完成率</span></div>
          <div class="kpi"><b>${stat.count ? stat.p90.toFixed(1) + 's' : '—'}</b><span>P90 秒數</span></div>
          <div class="kpi"><b>${stat.count}</b><span>已完成筆數</span></div>
        </div>
        <div class="pad small muted" style="padding-top:0">計時：從刷卡（第一個輸入）到完成。尚待取餐 ${pendingHere} 份預訂。</div>
      </div>
      <div class="card"><h3>📦 現場快取現貨 ${flash ? `<span class="tag acc">剩食快閃 ${S.cfg.flashPct / 10}折中</span>` : `<span class="muted small">${S.cfg.flashTime} 起 ${S.cfg.flashPct / 10}折</span>`}</h3>
        <table><tbody>${menu.map(m => `<tr><td>${m.emoji} ${esc(m.name)}</td><td class="num"><b>${walkinStock(d, curSite, m.id, fc)}</b> 份</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><h3>🧾 最近交易</h3><div class="scroll"><table><tbody>
        ${ps.slice(-8).reverse().map(p => `<tr><td>${fmtTime(p.at)}</td><td>${p.type === 'pre' ? '<span class="tag info">預訂取餐</span>' : '<span class="tag brand">現場快取</span>'}</td><td class="num"><b style="color:${p.sec <= S.cfg.targetSec ? 'var(--ok)' : 'var(--bad)'}">${p.sec}s</b></td></tr>`).join('') || '<tr><td class="muted">尚無交易</td></tr>'}
      </tbody></table></div></div>
    </div>
  </div>`;
  const inp = $('#kInput');
  if (inp) {
    if (curView === 'kiosk') setTimeout(() => inp.focus(), 0);
    inp.addEventListener('input', kioskStart, { once: true });
    inp.onkeydown = ev => { if (ev.key === 'Enter') kioskScan(inp.value); };
  }
  const demo = pre => {
    const pend = new Set(activeOrders(d, curSite).filter(o => o.status === 'paid').map(o => o.empId));
    const hasToday = new Set(activeOrders(d).map(o => o.empId));
    const pool = S.employees.filter(x => pre ? pend.has(x.id) : !hasToday.has(x.id));
    if (!pool.length) return toast(pre ? '此場域已無待取預訂' : '沒有可示範的員工');
    const x = pool[Math.floor(Math.random() * pool.length)];
    inp.value = x.card; kioskStart();
    setTimeout(() => kioskScan(x.card), 600); // 模擬讀卡時間
  };
  const b1 = $('#kDemoPre'); if (b1) b1.onclick = () => demo(true);
  const b2 = $('#kDemoWalk'); if (b2) b2.onclick = () => demo(false);
  el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => kioskBuy(b.dataset.buy));
  const c = $('#kCancel'); if (c) c.onclick = kioskReset;
  const n = $('#kNext'); if (n) n.onclick = kioskReset;
}
