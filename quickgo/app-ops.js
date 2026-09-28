'use strict';
// 後台：一般點餐櫃台、供應商備餐與共同食材（admin.html）
// ════════════════════════════════════════════════════════════
// 1️⃣ 一般點餐隊伍（現點現做）
// ════════════════════════════════════════════════════════════
const RG = { brand: 'ALL' }; // 美食街：各攤位只看自己的單
function renderRegular() {
  const el = $('#v-regular');
  const d = TODAY();
  const menu = menuFor(d);
  const venue = venueById(curSite);
  if (!venue) RG.brand = 'ALL';
  const mine = S.tickets.filter(t => t.date === d && t.site === curSite && (RG.brand === 'ALL' || ticketBrand(t) === RG.brand));
  const making = mine.filter(t => t.status === 'making');
  const ready = mine.filter(t => t.status === 'ready');
  const waits = mine.filter(t => t.readyAt).map(t => (t.readyAt - t.createdAt) / 1000);
  const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  const est = Q.estimateWait(making.length, S.cfg.avgMakeSec, S.cfg.stations);
  const qs = Q.pickupStats(S.pickups.filter(p => p.date === d && p.site === curSite).map(p => p.sec), S.cfg.targetSec);
  const closed = modeOf(curSite) === 'closed';
  const qcard = (t, ready) => {
    const dup = sameCallNo(t, d);
    const e = t.empId && empById(t.empId);
    return `<div class="qitem" ${ready ? 'style="border-color:var(--accent)"' : ''}><div class="qnum" ${ready ? 'style="color:var(--accent)"' : ''}>${esc(callNo(t))}</div>
      <div class="small muted">${callNo(t) !== t.no ? `單號 ${t.no}・` : ''}${e ? esc(e.name) : '訪客'}</div>
      ${dup.length ? `<div class="small"><span class="tag bad">同號 ${dup.length + 1} 人，螢幕加註姓名</span></div>` : ''}
      ${t.channel === 'market' ? `<div class="small"><span class="tag brand">${esc(brandById(t.brandId).name)}</span> <span class="tag">${t.dine === 'in' ? '內用' : '外帶'}</span></div>
        ${t.lines.map(l => `<div class="small">${esc(l.name)}${l.opt ? `<span class="muted">（${esc(l.opt)}）</span>` : ''} ×${l.qty}</div>`).join('')}`
      : `<div class="small">${esc(t.itemName)}</div>`}${t.note ? `<div class="small muted">📝 ${esc(t.note)}</div>` : ''}
      ${ready ? `<button class="btn sm" data-done="${t.id}" style="margin-top:6px">已取餐</button>`
        : `<div class="small muted">${fmtTime(t.createdAt)} 點餐</div><button class="btn sm pri" data-ready="${t.id}" style="margin-top:6px">完成・叫號</button>`}</div>`;
  };
  el.innerHTML = `
  <div class="note">叫號模式：<b>${closed ? `封閉市場・工號末 ${S.cfg.callDigits} 碼` : '開放市場・品牌流水號（A001）'}</b>${venue ? '（美食街固定為開放市場）' : '（系統設定可切換）'}｜<a href="board.html?site=${curSite}" target="_blank">開啟叫號大螢幕 ↗</a></div>
  ${venue ? `<div class="row" style="margin-bottom:12px"><b>攤位</b><div class="chips">${[['ALL', '全部攤位'], ...venue.brands.map(b => [b, brandById(b).name])].map(([k, n]) => `<button class="chip ${RG.brand === k ? 'on' : ''}" data-rgb="${k}">${esc(n)}</button>`).join('')}</div></div>` : `
  <div class="note acc">雙隊伍分流：<b>一般隊伍</b>現點現做（可客製），<b>快取GO 隊伍</b>預訂/現貨刷卡即取。現在排一般隊伍預估等候 <b>${Math.ceil(est / 60)} 分鐘</b>；快取GO 今日平均 <b>${qs.count ? qs.avg.toFixed(1) + ' 秒' : '—'}</b>。</div>`}
  <div class="grid side">
    <div class="grid">
      <div class="card"><h3>🔥 製作中 <span class="tag">${making.length}</span></h3><div class="pad"><div class="qgrid">
        ${making.map(t => qcard(t, false)).join('') || '<span class="muted small">無</span>'}
      </div></div></div>
      <div class="card"><h3>📣 叫號待取 <span class="tag acc">${ready.length}</span></h3><div class="pad"><div class="qgrid">
        ${ready.map(t => qcard(t, true)).join('') || '<span class="muted small">無</span>'}
      </div></div></div>
    </div>
    <div class="grid" style="align-self:start">
      ${venue ? `<div class="card"><h3>🛒 美食街訂單</h3><div class="pad small">
        <p>顧客在 <a href="market.html" target="_blank">前台・美食街點餐</a> 下單後，訂單會即時出現在左側。櫃台代客點餐也請使用同一頁。</p>
        <a class="btn pri" href="market.html" target="_blank" style="margin-top:10px">開啟美食街點餐 ↗</a></div></div>` : `
      <div class="card"><h3>🧑‍🍳 一般點餐</h3><div class="pad">
        <label class="f">${closed ? `工號（叫號用末 ${S.cfg.callDigits} 碼，並累點）` : '工號（選填，會員累點）'}</label><input class="in" id="rEmp" placeholder="刷卡或輸入工號">
        <label class="f">餐點</label>
        <select class="in" id="rItem">${menu.map(m => `<option value="${m.id}">${m.emoji} ${esc(m.name)}　${money(m.price)}</option>`).join('')}</select>
        <label class="f">客製需求</label><input class="in" id="rNote" placeholder="例：飯少、不要辣">
        <button class="btn pri" id="rAdd" style="width:100%;justify-content:center;margin-top:12px">開單・取號</button>
      </div></div>`}
      <div class="card"><h3>📈 ${venue ? '今日訂單' : '一般隊伍今日'}</h3><div class="grid g2">
        <div class="kpi"><b>${mine.length}</b><span>開單數</span></div>
        <div class="kpi"><b>${waits.length ? (avgWait / 60).toFixed(1) + ' 分' : '—'}</b><span>平均等候（開單→叫號）</span></div>
      </div></div>
    </div>
  </div>`;
  el.querySelectorAll('[data-rgb]').forEach(b => b.onclick = () => { RG.brand = b.dataset.rgb; renderRegular(); });
  bindTicketButtons(el);
  if (venue) return; // 美食街沒有員工餐廳的開單表單
  $('#rAdd').onclick = () => {
    const code = $('#rEmp').value.trim();
    const e = code ? findEmp(code) : null;
    if (code && !e) return toast('查無此工號');
    const t = tpl($('#rItem').value);
    const price = Q.computePrice({ price: t.price, channel: 'regular', serviceDate: d, now: new Date(), cfg: S.cfg, tierPct: e ? tierOf(e).tier.discountPct : 0 });
    const no = ticketNo(d, curSite);
    const tk = { id: uid('t'), no, date: d, site: curSite, empId: e ? e.id : null, setId: t.id, itemName: t.name, note: $('#rNote').value.trim(), total: price.total, status: 'making', createdAt: Date.now() };
    S.tickets.push(tk);
    const dup = sameCallNo(tk, d);
    save();
    toast(`取餐號 ${callNo(tk)}｜${money(price.total)}${dup.length ? `｜與 ${dup.length} 人同號，大螢幕將加註姓名` : ''}${closed && !e ? '｜未輸入工號，改用單號' : ''}`);
    renderRegular();
  };
}

function bindTicketButtons(el) {
  el.querySelectorAll('[data-ready]').forEach(b => b.onclick = () => { const t = S.tickets.find(x => x.id === b.dataset.ready); t.status = 'ready'; t.readyAt = Date.now(); save(); renderRegular(); });
  el.querySelectorAll('[data-done]').forEach(b => b.onclick = () => {
    const t = S.tickets.find(x => x.id === b.dataset.done); t.status = 'done'; t.doneAt = Date.now();
    if (t.empId) { const m = rewardOnConsume(empById(t.empId), t.total, t.date); if (m.length) toast(m.join('・')); }
    save(); renderRegular();
  });
}

// ════════════════════════════════════════════════════════════
// 2️⃣ 供應商備餐 + 4️⃣ 共同食材
// ════════════════════════════════════════════════════════════
const V = { date: null, site: 'ALL' };

function renderVendor() {
  const el = $('#v-vendor');
  const dates = menuDates();
  if (!V.date || !dates.includes(V.date)) V.date = dates[0];
  const d = V.date;
  const menu = menuFor(d);
  const siteIds = V.site === 'ALL' ? S.sites.map(s => s.id) : [V.site];
  const fcs = Object.fromEntries(siteIds.map(s => [s, forecastFor(d, s)]));
  const agg = menu.map(m => {
    const r = { id: m.id, m, pre: 0, walkinExp: 0, suggested: 0, confirmed: 0, allConfirmed: true };
    siteIds.forEach(s => {
      const row = fcs[s].rows.find(x => x.id === m.id);
      r.pre += row.pre; r.walkinExp += row.walkinExp; r.suggested += row.suggested;
      const c = S.prep[d] && S.prep[d][s] && S.prep[d][s][m.id];
      if (Number.isInteger(c)) r.confirmed += c; else { r.allConfirmed = false; r.confirmed += row.suggested; }
    });
    return r;
  });
  const cutoff = Q.orderCutoff(d, S.cfg);
  const mins = Math.round((cutoff - new Date()) / 60000);
  // 共同食材
  const prepBySite = {};
  S.sites.forEach(s => { prepBySite[s.id] = {}; const fc = forecastFor(d, s.id); menu.forEach(m => { prepBySite[s.id][m.id] = prepQty(d, s.id, m.id, fc); }); });
  const bom = Object.fromEntries(S.catalog.map(c => [c.id, c.bom || []]));
  const plan = Q.ingredientPlan(prepBySite, bom, S.ingredients);
  const oneSite = V.site !== 'ALL' ? fcs[V.site] : null;

  el.innerHTML = `
  <div class="row" style="margin-bottom:12px">
    <div class="chips">${dates.map(x => `<button class="chip ${x === d ? 'on' : ''}" data-vd="${x}">${fmtDate(x)}</button>`).join('')}</div>
    <div class="grow"></div>
    <select class="in" id="vSite" style="width:auto"><option value="ALL">全部場域合計</option>${S.sites.map(s => `<option value="${s.id}" ${V.site === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
  </div>
  <div class="note ${mins > 0 ? '' : 'acc'}">預訂截止 ${fmtDate(d)} ${S.cfg.cutoffTime}：${mins > 0 ? `尚有 ${Math.floor(mins / 60)} 小時 ${mins % 60} 分，預訂量仍會增加` : '已截止，預訂量已確定'}。建議備餐量 = 預訂量 + ⌈現場預估 × (1 + 安全庫存 ${S.cfg.safetyPct}%)⌉</div>
  <div class="grid g4" style="margin-bottom:14px">
    <div class="card kpi"><b>${agg.reduce((a, r) => a + r.pre, 0)}</b><span>已預訂份數</span></div>
    <div class="card kpi"><b>${agg.reduce((a, r) => a + r.walkinExp, 0).toFixed(1)}</b><span>現場快取預估</span></div>
    <div class="card kpi"><b>${agg.reduce((a, r) => a + r.suggested, 0)}</b><span>建議備餐總量</span></div>
    <div class="card kpi"><b>${money(plan.totalSaved)}</b><span>跨場域合併採購節省</span></div>
  </div>
  <div class="card" style="margin-bottom:14px"><h3>📦 備餐建議 <span class="muted small">${V.site === 'ALL' ? '三場域合計（確認量請切換到單一場域）' : esc(siteById(V.site).name)}</span><span class="grow"></span>
    ${oneSite ? '<button class="btn sm" id="vApply">套用建議量</button><button class="btn sm pri" id="vSave">確認備餐量</button>' : ''}<button class="btn sm" id="vCsv">匯出備料單 CSV</button></h3>
    <div class="scroll"><table>
      <thead><tr><th>套餐</th><th>品牌</th><th class="num">已預訂</th><th class="num">現場預估</th><th class="num">建議備餐</th><th class="num">總產能</th><th class="num">${oneSite ? '確認備餐' : '備餐（確認/建議）'}</th></tr></thead>
      <tbody>${agg.map(r => `<tr>
        <td>${r.m.emoji} ${esc(r.m.name)}</td><td class="small">${esc((brandById(r.m.brandId) || {}).name || '')}</td>
        <td class="num">${r.pre}</td><td class="num">${r.walkinExp.toFixed(1)}</td><td class="num"><b>${r.suggested}</b></td>
        <td class="num">${r.m.capacity}${r.suggested > r.m.capacity ? ' <span class="tag bad">超出</span>' : ''}</td>
        <td class="num">${oneSite ? `<input class="in num" style="width:80px" type="number" min="0" step="1" data-prep="${r.id}" value="${prepQty(d, V.site, r.id, oneSite)}">` : `${r.confirmed}${r.allConfirmed ? ' <span class="tag ok">已確認</span>' : ''}`}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="pad small muted">${oneSite ? (oneSite.source === 'history'
      ? `現場預估基準：前 ${S.cfg.forecastWeeks} 週同星期現場快取量加權平均 = ${oneSite.walkinTotal.toFixed(2)} 份（${oneSite.used.map(u => `${u.date.slice(5)}：${u.walkin}份×權重${u.weight}`).join('、')}）；各套餐依預訂占比（拉普拉斯平滑）分配。`
      : `歷史資料不足，現場預估 = 預訂量 × ${S.cfg.fallbackWalkinPct}% = ${oneSite.walkinTotal.toFixed(2)} 份。`) : '選擇單一場域可查看預估依據並確認備餐量。'}</div>
  </div>
  <div class="grid">
    <div class="card"><h3>🥬 跨場域共同食材方案 <span class="muted small">三場域合併採購，減少零頭浪費</span></h3><div class="scroll"><table>
      <thead><tr><th>食材</th><th class="num">總需求</th>${S.sites.map(s => `<th class="num">${s.id}</th>`).join('')}<th class="num">分開採購</th><th class="num">合併採購</th><th class="num">節省</th></tr></thead>
      <tbody>${plan.rows.map(r => `<tr><td>${esc(r.name)}<div class="small muted">每包 ${(S.ingredients[r.ing].packGrams / 1000)}kg・${money(S.ingredients[r.ing].packPrice)}</div></td>
        <td class="num">${(r.grams / 1000).toFixed(2)}kg</td>${S.sites.map(s => `<td class="num">${((r.bySite[s.id] || 0) / 1000).toFixed(2)}</td>`).join('')}
        <td class="num">${r.separatePacks} 包</td><td class="num"><b>${r.pooledPacks}</b> 包</td><td class="num">${r.savedPacks ? `<span class="tag ok">-${r.savedPacks} 包 ${money(r.savedCost)}</span>` : '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="${S.sites.length + 3}">合計採購 ${money(plan.totalCost)}</th><th class="num" colspan="2">節省 ${plan.totalSavedPacks} 包 ${money(plan.totalSaved)}</th></tr></tfoot>
    </table></div><div class="pad small muted">分開採購＝各場域各自無條件進位到整包；合併採購＝三場域需求加總後才進位。食材單價與規格為示範值，請於設定中依實際合約調整。</div></div>
    <div class="card"><h3>🍱 ${fmtDate(d)} 菜單設定 <span class="muted small">每日 ${Q.MIN_SETS}–${Q.MAX_SETS} 款</span></h3><div class="pad">
      <table><thead><tr><th></th><th>套餐</th><th>品牌</th><th class="num">售價</th><th class="num">總產能</th></tr></thead><tbody>
      ${S.catalog.map(c => { const m = (S.menus[d] || []).find(x => x.id === c.id); const b = brandById(c.brandId); return `<tr>
        <td><input type="checkbox" data-mc="${c.id}" ${m ? 'checked' : ''} ${b && b.status !== 'active' ? 'disabled' : ''}></td>
        <td>${c.emoji} ${esc(c.name)}</td><td class="small">${esc(b ? b.name : '')}</td><td class="num">${money(c.price)}</td>
        <td class="num"><input class="in num" style="width:72px" type="number" min="0" step="1" data-mcap="${c.id}" value="${m ? m.capacity : 120}"></td></tr>`; }).join('')}
      </tbody></table>
      <div id="menuErr" class="small" style="color:var(--bad);margin-top:6px"></div>
      <button class="btn pri" id="vMenuSave" style="margin-top:10px">儲存菜單</button>
      <details style="margin-top:12px"><summary class="small" style="cursor:pointer">＋ 新增套餐品項</summary>
        <div class="grid g2" style="margin-top:8px">
          <div><label class="f">名稱</label><input class="in" id="ncName"></div>
          <div><label class="f">圖示</label><input class="in" id="ncEmoji" value="🍱"></div>
          <div><label class="f">售價（整數）</label><input class="in" id="ncPrice" type="number" min="1" step="1" value="100"></div>
          <div><label class="f">品牌</label><select class="in" id="ncBrand">${S.brands.filter(b => b.status === 'active').map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
        </div>
        <button class="btn" id="ncAdd" style="margin-top:8px">新增到品項庫</button>
      </details>
    </div></div>
  </div>`;
  el.querySelectorAll('[data-vd]').forEach(b => b.onclick = () => { V.date = b.dataset.vd; renderVendor(); });
  $('#vSite').onchange = ev => { V.site = ev.target.value; renderVendor(); };
  if (oneSite) {
    $('#vApply').onclick = () => { el.querySelectorAll('[data-prep]').forEach(i => { i.value = oneSite.rows.find(r => r.id === i.dataset.prep).suggested; }); };
    $('#vSave').onclick = () => {
      const out = {};
      for (const i of el.querySelectorAll('[data-prep]')) {
        const v = Number(i.value);
        if (!Number.isInteger(v) || v < 0) return toast('備餐量需為 0 以上整數');
        const pre = oneSite.rows.find(r => r.id === i.dataset.prep).pre;
        if (v < pre) return toast(`${tpl(i.dataset.prep).name} 備餐量不可少於已預訂 ${pre} 份`);
        out[i.dataset.prep] = v;
      }
      S.prep[d] = S.prep[d] || {}; S.prep[d][V.site] = out; save(); toast('已確認備餐量'); renderAll();
    };
  }
  $('#vCsv').onclick = () => {
    const rows = [['日期', '場域', '套餐', '品牌', '已預訂', '現場預估', '建議備餐', '確認備餐']];
    S.sites.forEach(s => { const fc = forecastFor(d, s.id); fc.rows.forEach(r => rows.push([d, s.name, r.name, (brandById(tpl(r.id).brandId) || {}).name, r.pre, r.walkinExp.toFixed(2), r.suggested, prepQty(d, s.id, r.id, fc)])); });
    rows.push([]); rows.push(['食材', '總需求(g)', '分開採購包數', '合併採購包數', '節省包數', '節省金額']);
    plan.rows.forEach(r => rows.push([r.name, r.grams, r.separatePacks, r.pooledPacks, r.savedPacks, r.savedCost]));
    download(`快取GO備料單_${d}.csv`, csv(rows));
  };
  $('#vMenuSave').onclick = () => {
    const sel = [...el.querySelectorAll('[data-mc]')].filter(c => c.checked).map(c => ({ id: c.dataset.mc, capacity: Number(el.querySelector(`[data-mcap="${c.dataset.mc}"]`).value) }));
    const check = Q.validateMenu(sel.map(m => ({ ...tpl(m.id), capacity: m.capacity })));
    if (!check.ok) { $('#menuErr').textContent = check.errors.join('；'); return; }
    const removed = (S.menus[d] || []).filter(m => !sel.find(x => x.id === m.id)).map(m => m.id).filter(id => activeOrders(d).some(o => o.setId === id));
    if (removed.length) { $('#menuErr').textContent = `已有預訂的套餐不可移除：${removed.map(id => tpl(id).name).join('、')}`; return; }
    const pc = preCounts(d);
    const under = sel.filter(m => m.capacity < (pc[m.id] || 0));
    if (under.length) { $('#menuErr').textContent = under.map(m => `${tpl(m.id).name} 產能不可低於已預訂 ${pc[m.id]} 份`).join('；'); return; }
    S.menus[d] = sel; save(); toast('菜單已儲存'); renderAll();
  };
  $('#ncAdd').onclick = () => {
    const name = $('#ncName').value.trim(); const price = Number($('#ncPrice').value);
    if (!name || !Number.isInteger(price) || price <= 0) return toast('請輸入名稱與正整數售價');
    const id = 'T' + (Math.max(...S.catalog.map(c => Number(c.id.slice(1)) || 0)) + 1);
    S.catalog.push({ id, name, emoji: $('#ncEmoji').value || '🍱', brandId: $('#ncBrand').value, price, bom: [] });
    save(); toast('已新增品項（食材配方可於後續擴充）'); renderVendor();
  };
}
