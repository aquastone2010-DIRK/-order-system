'use strict';
// ════════════════════════════════════════════════════════════
// 1️⃣ 員工 App：預訂 / 我的訂單 / 會員優惠
// ════════════════════════════════════════════════════════════
const A = { empId: null, tab: 'order', date: null, site: null, setId: null, slot: null, couponId: '', usePass: false, pay: 'badge' };

function renderApp() {
  const el = $('#v-app');
  const e = A.empId && empById(A.empId);
  if (!e) {
    el.innerHTML = `
    <div class="card" style="max-width:440px;margin:24px auto"><h3>🍱 員工登入</h3><div class="pad">
      <label class="f">工號或員工證卡號</label>
      <input class="in" id="appLogin" list="empList" placeholder="例：E10001">
      <datalist id="empList">${S.employees.slice(0, 40).map(x => `<option value="${x.id}">${esc(x.name)}・${esc(x.dept)}</option>`).join('')}</datalist>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="appLoginBtn">登入</button>
      <button class="btn" id="appRandom">隨機示範員工</button></div>
      <p class="small muted" style="margin-top:10px">正式上線時改為公司 SSO 登入。</p>
    </div></div>`;
    const go = v => { const x = findEmp(v); if (!x) return toast('查無此員工'); A.empId = x.id; A.site = x.site; A.date = null; renderApp(); };
    $('#appLoginBtn').onclick = () => go($('#appLogin').value);
    $('#appLogin').onkeydown = ev => { if (ev.key === 'Enter') go(ev.target.value); };
    $('#appRandom').onclick = () => go(S.employees[Math.floor(Math.random() * S.employees.length)].id);
    return;
  }
  const t = tierOf(e);
  el.innerHTML = `
  <div class="row" style="margin-bottom:12px">
    <div><b style="font-size:16px">${esc(e.name)}</b> <span class="muted small">${e.id}・${esc(e.dept)}・${esc(siteById(e.site).name)}</span></div>
    <span class="tag brand">${t.tier.name}</span><span class="tag">${e.points} 點</span><span class="tag">餐券 ${passMeals(e)} 餐</span>
    <div class="grow"></div>
    <div class="chips">${[['order', '預訂餐點'], ['mine', '我的訂單'], ['member', '會員 & 優惠票']].map(([k, n]) => `<button class="chip ${A.tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
    <button class="btn sm" id="appLogout">登出</button>
  </div>
  <div id="appBody"></div>`;
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { A.tab = b.dataset.tab; renderApp(); });
  $('#appLogout').onclick = () => { A.empId = null; renderApp(); };
  if (A.tab === 'order') renderAppOrder(e);
  else if (A.tab === 'mine') renderAppMine(e);
  else renderAppMember(e);
}

function renderAppOrder(e) {
  const body = $('#appBody');
  const dates = menuDates();
  if (!A.date || !dates.includes(A.date)) A.date = dates.find(d => Q.canPreorder(d, new Date(), S.cfg)) || dates[0];
  const d = A.date;
  if (!d) { body.innerHTML = '<div class="note">目前沒有開放預訂的菜單</div>'; return; }
  const now = new Date();
  const open = Q.canPreorder(d, now, S.cfg);
  const existing = activeOrders(d).find(o => o.empId === e.id);
  const menu = menuFor(d);
  const totals = preCounts(d);
  const site = siteById(A.site) || siteById(e.site);
  const slots = Q.buildSlots(S.cfg);
  const loads = Q.slotLoads(slots, activeOrders(d, site.id), site.lockers);
  const rec = Q.recommendSlot(loads);
  if (!A.slot || !loads.find(l => l.slot === A.slot && !l.full)) A.slot = rec;
  const tier = tierOf(e).tier;
  const coupons = validCoupons(e, d);
  const coupon = coupons.find(c => c.id === A.couponId) || null;
  const set = menu.find(m => m.id === A.setId);
  const eb = Q.earlyBirdDeadline(d, S.cfg);
  const price = set ? Q.computePrice({ price: set.price, channel: 'pre', serviceDate: d, now, cfg: S.cfg, tierPct: tier.discountPct, coupon, usePass: A.usePass && passMeals(e) > 0, passCap: S.cfg.passCap }) : null;

  body.innerHTML = `
  <div class="grid side">
    <div class="grid">
      <div class="card"><h3>📅 取餐日期</h3><div class="pad">
        <div class="chips">${dates.map(x => `<button class="chip ${x === d ? 'on' : ''}" data-date="${x}">${fmtDate(x)}</button>`).join('')}</div>
        <div class="small muted" style="margin-top:8px">
          預訂截止：${fmtDate(d)} ${S.cfg.cutoffTime}　|　早鳥優惠 -${S.cfg.earlyBirdDiscount} 元：${fmtDate(Q.addDays(d, -1))} ${S.cfg.earlyBirdTime} 前
          ${now <= eb ? '<span class="tag ok">早鳥進行中</span>' : ''} ${open ? '' : '<span class="tag bad">已截止</span>'}
        </div>
      </div></div>
      <div class="card"><h3>🍱 選擇套餐 <span class="muted small">今日 ${menu.length} 款</span></h3><div class="pad">
        ${existing ? `<div class="note ok">您已預訂 ${fmtDate(d)}：${esc(tpl(existing.setId).name)}，取餐櫃 ${existing.locker}（${existing.slot}）。每人每日限預訂 1 份。</div>` : ''}
        <div class="meals">${menu.map(m => {
          const left = m.capacity - (totals[m.id] || 0);
          const b = brandById(m.brandId);
          return `<div class="meal ${A.setId === m.id ? 'on' : ''} ${left <= 0 ? 'off' : ''}" data-set="${m.id}">
            <div class="e">${m.emoji}</div><div class="n">${esc(m.name)}</div>
            <div class="small muted">${esc(b ? b.name : '')}</div>
            <div class="row" style="justify-content:space-between;margin-top:6px"><span class="p">${money(m.price)}</span><span class="small ${left < 15 ? 'tag acc' : 'muted'}">${left <= 0 ? '已售完' : '剩 ' + left + ' 份'}</span></div>
          </div>`;
        }).join('')}</div>
      </div></div>
      <div class="card"><h3>🕐 取餐時段 & 取餐地點</h3><div class="pad">
        <label class="f">取餐場域（美食櫃）</label>
        <select class="in" id="appSite">${S.sites.map(s => `<option value="${s.id}" ${s.id === site.id ? 'selected' : ''}>${esc(s.name)}（${s.lockers} 格）</option>`).join('')}</select>
        <label class="f">時段（每時段容量 = 該場域美食櫃格數，系統推薦最空時段分流人潮）</label>
        <div class="grid g3">${loads.map(l => `
          <button class="chip ${A.slot === l.slot ? 'on' : ''}" data-slot="${l.slot}" ${l.full ? 'disabled' : ''} style="border-radius:10px;text-align:left">
            ${l.slot} ${l.slot === rec ? '⭐推薦' : ''}<div class="meter ${l.full ? 'full' : l.pct > .7 ? 'hot' : ''}" style="margin-top:4px"><i style="width:${Math.min(100, l.pct * 100)}%"></i></div>
            <span class="small" style="font-weight:400">${l.used}/${l.cap}</span>
          </button>`).join('')}</div>
      </div></div>
    </div>
    <div class="card" style="align-self:start;position:sticky;top:120px"><h3>🧾 結帳</h3><div class="pad">
      ${set ? `<div style="font-weight:800;margin-bottom:6px">${set.emoji} ${esc(set.name)}</div>` : '<div class="muted small">請先選擇套餐</div>'}
      <label class="f">優惠券</label>
      <select class="in" id="appCoupon"><option value="">不使用</option>${coupons.map(c => `<option value="${c.id}" ${c.id === A.couponId ? 'selected' : ''}>${esc(c.label)}（-${c.type === 'pct' ? c.value + '%' : money(c.value)}，至 ${c.exp.slice(5)}）</option>`).join('')}</select>
      <label class="row small" style="margin-top:10px"><input type="checkbox" id="appPass" ${A.usePass ? 'checked' : ''} ${passMeals(e) ? '' : 'disabled'}> 使用餐券（剩 ${passMeals(e)} 餐，每餐折抵上限 ${money(S.cfg.passCap)}）</label>
      <label class="f">付款方式</label>
      <select class="in" id="appPay"><option value="badge" ${A.pay === 'badge' ? 'selected' : ''}>員工證・薪資扣款</option><option value="card" ${A.pay === 'card' ? 'selected' : ''}>信用卡</option><option value="mobile" ${A.pay === 'mobile' ? 'selected' : ''}>行動支付</option></select>
      ${price ? `<div class="lines" style="margin-top:12px">${price.lines.map(l => `<div><span>${esc(l.label)}</span><span class="num">${l.amount < 0 ? '-' : ''}${money(Math.abs(l.amount))}</span></div>`).join('')}
        <div class="tot"><span>應付</span><span>${money(price.total)}</span></div></div>
        <div class="small muted" style="margin-top:4px">取餐後可得 ${Q.pointsEarned(price.total, S.cfg)} 點＋1 章</div>` : ''}
      <button class="btn pri" id="appSubmit" style="width:100%;margin-top:12px;justify-content:center;padding:12px" ${!set || !open || existing || !A.slot ? 'disabled' : ''}>確認預訂並付款</button>
      ${!open ? '<div class="small" style="color:var(--bad);margin-top:6px">此日期已過預訂截止時間，請改用取餐站現場快取</div>' : ''}
    </div></div>
  </div>`;
  body.querySelectorAll('[data-date]').forEach(b => b.onclick = () => { A.date = b.dataset.date; A.setId = null; renderApp(); });
  body.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { if (b.classList.contains('off')) return; A.setId = b.dataset.set; renderApp(); });
  body.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { A.slot = b.dataset.slot; renderApp(); });
  $('#appSite').onchange = ev => { A.site = ev.target.value; A.slot = null; renderApp(); };
  $('#appCoupon').onchange = ev => { A.couponId = ev.target.value; renderApp(); };
  $('#appPass').onchange = ev => { A.usePass = ev.target.checked; renderApp(); };
  $('#appPay').onchange = ev => { A.pay = ev.target.value; };
  $('#appSubmit').onclick = () => placeOrder(e, d, set, site);
}

function placeOrder(e, d, set, site) {
  const now = new Date();
  // 重新驗證（避免多分頁同時操作）
  if (!Q.canPreorder(d, now, S.cfg)) return toast('已超過預訂截止時間');
  if (activeOrders(d).some(o => o.empId === e.id)) return toast('每人每日限預訂 1 份');
  const cap = menuFor(d).find(m => m.id === set.id).capacity;
  if ((preCounts(d)[set.id] || 0) >= cap) return toast('此套餐已售完');
  const loads = Q.slotLoads(Q.buildSlots(S.cfg), activeOrders(d, site.id), site.lockers);
  if (loads.find(l => l.slot === A.slot).full) return toast('此時段已滿，請改選其他時段');
  const locker = Q.allocateLocker(site.id, site.lockers, occupiedLockers(d, site.id, A.slot));
  if (!locker) return toast('美食櫃已滿');
  const coupon = validCoupons(e, d).find(c => c.id === A.couponId) || null;
  const usePass = A.usePass && passMeals(e) > 0;
  const price = Q.computePrice({ price: set.price, channel: 'pre', serviceDate: d, now, cfg: S.cfg, tierPct: tierOf(e).tier.discountPct, coupon, usePass, passCap: S.cfg.passCap });
  let passCost = 0;
  if (price.passUsed) {
    passCost = consumePass(e);
    // 餐券實收 = 該餐券每餐成本；折抵面額超出部分為平台補貼
  }
  if (coupon) e.coupons = e.coupons.filter(c => c.id !== coupon.id);
  const o = { id: uid('o'), date: d, empId: e.id, setId: set.id, site: site.id, slot: A.slot, locker, total: price.total, lines: price.lines, passCost, passUsed: price.passUsed, coupon, pay: A.pay, status: 'paid', createdAt: now.getTime() };
  S.orders.push(o);
  save();
  A.setId = null; A.couponId = ''; A.usePass = false; A.tab = 'mine';
  toast(`✅ 預訂成功！${fmtDate(d)} ${o.slot} 至 ${o.locker} 刷卡取餐`);
  renderAll();
}

function renderAppMine(e) {
  const body = $('#appBody');
  const list = S.orders.filter(o => o.empId === e.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 30);
  const now = new Date();
  const st = { paid: ['待取餐', 'acc'], picked: ['已取餐', 'ok'], cancelled: ['已取消', ''] };
  body.innerHTML = `<div class="card"><h3>📋 我的訂單</h3><div class="scroll"><table>
    <thead><tr><th>日期</th><th>套餐</th><th>取餐</th><th class="num">實付</th><th>狀態</th><th></th></tr></thead>
    <tbody>${list.map(o => {
      const t = tpl(o.setId);
      const can = o.status === 'paid' && Q.canPreorder(o.date, now, S.cfg) && o.date >= TODAY();
      return `<tr><td>${fmtDate(o.date)}</td><td>${t.emoji} ${esc(t.name)}</td>
        <td><b>${o.locker}</b> <span class="muted small">${o.slot}・${esc(siteById(o.site).name)}</span></td>
        <td class="num">${money(o.total)}${o.passUsed ? ' <span class="tag info">餐券</span>' : ''}</td>
        <td><span class="tag ${st[o.status][1]}">${st[o.status][0]}</span>${o.pickupSec ? ` <span class="small muted">${o.pickupSec}s</span>` : ''}</td>
        <td>${can ? `<button class="btn sm danger" data-cancel="${o.id}">取消</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">尚無訂單</td></tr>'}</tbody></table></div>
    <div class="pad small muted">取餐方式：於預訂時段到美食櫃旁取餐站刷員工證，系統顯示櫃號即可取餐（目標 30 秒內）。截止時間前可取消，退回原付款方式、優惠券與餐券。</div></div>`;
  body.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => {
    const o = S.orders.find(x => x.id === b.dataset.cancel);
    if (!o || o.status !== 'paid' || !Q.canPreorder(o.date, new Date(), S.cfg)) return toast('已無法取消');
    o.status = 'cancelled';
    if (o.coupon) e.coupons.push(o.coupon);
    if (o.passUsed) refundPass(e, o.passCost);
    save(); toast(`已取消，退款 ${money(o.total)}`); renderAll();
  });
}

function renderAppMember(e) {
  const body = $('#appBody');
  const t = tierOf(e);
  const streak = Q.workdayStreak(pickupDates(e.id), TODAY());
  const avgPrice = Math.round(S.catalog.reduce((a, c) => a + c.price, 0) / S.catalog.length);
  const progress = t.next ? (e.lifetime - t.tier.minPoints) / (t.next.minPoints - t.tier.minPoints) : 1;
  body.innerHTML = `
  <div class="grid g2">
    <div class="grid">
      <div class="tiercard ${t.tier.cls}">
        <div class="small" style="opacity:.8">快取GO 會員</div>
        <div style="font-size:26px;font-weight:900">${t.tier.name} ${t.tier.discountPct ? `・全品項 ${100 - t.tier.discountPct}折` .replace(/(\d)(\d)折/, '$1.$2折').replace('.0折', '折') : ''}</div>
        <div class="row" style="margin-top:8px;gap:16px"><div><b style="font-size:20px">${e.points}</b><div class="small">可用點數</div></div><div><b style="font-size:20px">${e.lifetime}</b><div class="small">累積點數</div></div><div><b style="font-size:20px">${streak}</b><div class="small">連續取餐（工作日）</div></div></div>
        <div class="meter" style="margin-top:10px;background:rgba(255,255,255,.25);border:none"><i style="width:${Math.min(100, progress * 100)}%;background:#fff"></i></div>
        <div class="small" style="margin-top:4px">${t.next ? `再 ${t.toNext} 點升級 ${t.next.name}（${t.next.discountPct}% 折扣）` : '已達最高等級'}</div>
      </div>
      <div class="card"><h3>🟢 集章卡 <span class="muted small">每取餐 1 次 1 章，集滿 ${S.cfg.stampGoal} 章送免費套餐券（折抵上限 ${money(S.cfg.passCap)}）</span></h3><div class="pad">
        <div class="stamps">${Array.from({ length: S.cfg.stampGoal }, (_, i) => `<div class="stamp ${i < e.stamps ? 'on' : ''}">${i < e.stamps ? '⚡' : ''}</div>`).join('')}</div>
        <div class="small muted" style="margin-top:8px">連續 ${S.cfg.streakBonusDays} 個工作日取餐再送 ${S.cfg.streakBonus} 點（每累積 ${S.cfg.streakBonusDays} 天發放一次）。消費每 ${S.cfg.pointPerDollars} 元得 1 點。</div>
      </div></div>
      <div class="card"><h3>🎟️ 我的優惠券</h3><div class="pad">
        ${validCoupons(e, TODAY()).map(c => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border)"><span>${esc(c.label)}</span><span class="tag acc">-${c.type === 'pct' ? c.value + '%' : money(c.value)}</span><span class="small muted">至 ${c.exp}</span></div>`).join('') || '<span class="muted small">目前沒有可用優惠券</span>'}
        <div class="row" style="margin-top:12px"><button class="btn" id="redeemBtn" ${e.points < S.cfg.redeemPoints ? 'disabled' : ''}>用 ${S.cfg.redeemPoints} 點兌換 ${money(S.cfg.redeemValue)} 券</button></div>
      </div></div>
    </div>
    <div class="card" style="align-self:start"><h3>🎫 優惠票・餐券包 <span class="muted small">預付多餐，適合輪班與固定用餐族群</span></h3><div class="pad">
      <div class="small muted" style="margin-bottom:8px">餐券可折抵任一套餐（每餐上限 ${money(S.cfg.passCap)}，超出補差額）。以套餐平均價 ${money(avgPrice)} 計算節省：</div>
      ${S.passes.map(p => { const v = Q.passValue(p, avgPrice); return `
        <div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <div><b>${esc(p.name)}</b><div class="small muted">每餐 ${money(v.perMeal)}・約省 ${v.savingPct.toFixed(1)}%（${money(v.savingTotal)}）</div></div>
          <button class="btn pri sm" data-pass="${p.id}">${money(p.price)} 購買</button></div>`; }).join('')}
      <div class="small muted" style="margin-top:10px">持有：${e.passes.length ? e.passes.map(p => `${p.meals} 餐（每餐 ${money(p.perMeal)}）`).join('、') : '無'}</div>
    </div></div>
  </div>`;
  $('#redeemBtn').onclick = () => {
    if (e.points < S.cfg.redeemPoints) return;
    e.points -= S.cfg.redeemPoints;
    e.coupons.push({ id: uid('c'), type: 'amount', value: S.cfg.redeemValue, label: `點數兌換 ${money(S.cfg.redeemValue)} 券`, exp: Q.addDays(TODAY(), 60) });
    save(); toast('兌換成功'); renderApp();
  };
  body.querySelectorAll('[data-pass]').forEach(b => b.onclick = () => {
    const p = S.passes.find(x => x.id === b.dataset.pass);
    if (!confirm(`確認以員工證扣款 ${money(p.price)} 購買「${p.name}」？`)) return;
    e.passes.push({ meals: p.meals, perMeal: p.price / p.meals });
    S.passSales.push({ id: uid('ps'), date: TODAY(), empId: e.id, passId: p.id, price: p.price, meals: p.meals, at: Date.now() });
    save(); toast(`已購買 ${p.name}`); renderApp();
  });
}
