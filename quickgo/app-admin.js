'use strict';
// 後台：美食櫃、合作品牌管理、營運數據、設定（admin.html）
// ════════════════════════════════════════════════════════════
// 4️⃣ 跨場域美食櫃
// ════════════════════════════════════════════════════════════
const L = { slot: null };
function renderLocker() {
  const el = $('#v-locker');
  const d = TODAY();
  const slots = Q.buildSlots(S.cfg);
  if (!L.slot) L.slot = slots[0];
  const all = activeOrders(d);
  el.innerHTML = `
  <div class="row" style="margin-bottom:12px"><b>${fmtDate(d)} 美食櫃狀態</b><div class="grow"></div>
    <div class="chips">${slots.map(s => `<button class="chip ${s === L.slot ? 'on' : ''}" data-ls="${s}">${s}</button>`).join('')}</div></div>
  <div class="note">跨場域美食櫃：員工可在任一廠區預訂、指定就近場域取餐；各時段櫃位由系統自動配置（每時段可重複使用），同一套中央備料分送各場域。</div>
  <div class="grid g3">${S.sites.map(s => {
    const os = all.filter(o => o.site === s.id);
    const inSlot = os.filter(o => o.slot === L.slot);
    const map = Object.fromEntries(inSlot.map(o => [o.locker, o]));
    const picked = os.filter(o => o.status === 'picked').length;
    return `<div class="card"><h3>${esc(s.name)}</h3><div class="pad">
      <div class="row small" style="margin-bottom:8px;gap:12px"><span>今日預訂 <b>${os.length}</b></span><span>已取 <b>${picked}</b></span><span>取餐率 <b>${os.length ? pct(picked / os.length, 0) : '—'}</b></span></div>
      <div class="lgrid">${Array.from({ length: s.lockers }, (_, i) => { const code = s.id + '-' + String(i + 1).padStart(2, '0'); const o = map[code];
        return `<div class="lk ${o ? (o.status === 'picked' ? 'done' : 'wait') : ''}" title="${o ? esc(empById(o.empId).name + '・' + tpl(o.setId).name) : '空'}">${String(i + 1).padStart(2, '0')}</div>`; }).join('')}</div>
      <div class="row small muted" style="margin-top:8px;gap:10px"><span><span class="lk wait" style="display:inline-block;padding:0 6px">&nbsp;</span> 待取</span><span><span class="lk done" style="display:inline-block;padding:0 6px">&nbsp;</span> 已取</span><span>${L.slot} 使用 ${inSlot.length}/${s.lockers}</span></div>
    </div></div>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-ls]').forEach(b => b.onclick = () => { L.slot = b.dataset.ls; renderLocker(); });
}

// ════════════════════════════════════════════════════════════
// 7️⃣ 合作品牌管理台
// ════════════════════════════════════════════════════════════
const B = { month: null, edit: null };
function brandSales(month) {
  const out = {};
  const add = (setId, base, collected) => {
    const t = tpl(setId); if (!t) return;
    const r = out[t.brandId] || (out[t.brandId] = { qty: 0, base: 0, collected: 0 });
    r.qty++; r.base += base; r.collected += collected;
  };
  const afterFlash = lines => lines.filter(l => l.label === '套餐原價' || l.label.startsWith('剩食快閃')).reduce((a, l) => a + l.amount, 0);
  S.orders.forEach(o => { if (o.status !== 'cancelled' && o.date.startsWith(month)) add(o.setId, tpl(o.setId).price, o.total + (o.passCost || 0)); });
  S.walkins.forEach(w => { if (w.date.startsWith(month)) add(w.setId, afterFlash(w.lines), w.total); });
  S.tickets.forEach(t => { if (t.date.startsWith(month)) add(t.setId, tpl(t.setId).price, t.total); });
  return out;
}
function renderBrand() {
  const el = $('#v-brand');
  if (!B.month) B.month = TODAY().slice(0, 7);
  const sales = brandSales(B.month);
  const stLabel = { active: ['合作中', 'ok'], trial: ['試營運', 'info'], negotiating: ['洽談中', 'acc'], paused: ['暫停', 'bad'] };
  let tot = { qty: 0, base: 0, commission: 0, payout: 0, collected: 0 };
  const rows = S.brands.map(b => {
    const s = sales[b.id] || { qty: 0, base: 0, collected: 0 };
    const st = Q.settlement(s.base, b.commissionPct);
    tot.qty += s.qty; tot.base += s.base; tot.commission += st.commission; tot.payout += st.payout; tot.collected += s.collected;
    const items = S.catalog.filter(c => c.brandId === b.id).length;
    return `<tr><td><b>${esc(b.name)}</b><div class="small muted">${esc(b.contact || '')}</div></td>
      <td><span class="tag ${stLabel[b.status][1]}">${stLabel[b.status][0]}</span></td>
      <td class="small">${b.sites.map(x => x).join('、') || '—'}</td><td class="num">${items}</td><td class="num">${b.commissionPct}%</td>
      <td class="num">${s.qty}</td><td class="num">${money(s.base)}</td><td class="num">${money(st.commission)}</td><td class="num"><b>${money(st.payout)}</b></td>
      <td><button class="btn sm" data-be="${b.id}">編輯</button></td></tr>`;
  }).join('');
  const eb = B.edit ? (S.brands.find(b => b.id === B.edit) || { id: '', name: '', status: 'negotiating', commissionPct: 15, contact: '', sites: [] }) : null;
  el.innerHTML = `
  <div class="row" style="margin-bottom:12px"><b>結算月份</b><input class="in" type="month" id="bMonth" value="${B.month}" style="width:auto"><div class="grow"></div><button class="btn pri" id="bNew">＋ 新增合作品牌</button><button class="btn" id="bCsv">匯出拆帳 CSV</button></div>
  <div class="grid g4" style="margin-bottom:14px">
    <div class="card kpi"><b>${S.brands.filter(b => b.status === 'active').length}/${S.brands.length}</b><span>合作中品牌</span></div>
    <div class="card kpi"><b>${money(tot.base)}</b><span>品牌營業額（計價基準）</span></div>
    <div class="card kpi"><b>${money(tot.commission)}</b><span>平台抽成</span></div>
    <div class="card kpi"><b>${money(Math.max(0, tot.base - tot.collected))}</b><span>平台行銷補貼（早鳥/會員/券）</span></div>
  </div>
  <div class="card"><h3>🤝 品牌列表與拆帳</h3><div class="scroll"><table>
    <thead><tr><th>品牌</th><th>狀態</th><th>上架場域</th><th class="num">品項</th><th class="num">抽成</th><th class="num">份數</th><th class="num">營業額</th><th class="num">抽成金額</th><th class="num">撥款</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><th>合計</th><th></th><th></th><th></th><th></th><th class="num">${tot.qty}</th><th class="num">${money(tot.base)}</th><th class="num">${money(tot.commission)}</th><th class="num">${money(tot.payout)}</th><th></th></tr></tfoot>
  </table></div>
  <div class="pad small muted">計價基準：預訂與一般點餐以套餐原價、現場快取以剩食快閃後價格（快閃折扣由品牌承擔以換取去化）；早鳥、會員折扣、優惠券與餐券差額由平台行銷預算吸收，不影響品牌撥款。抽成四捨五入到元，撥款 = 營業額 − 抽成。</div></div>
  ${eb ? `<div class="card" style="margin-top:14px"><h3>${eb.id ? '編輯' : '新增'}品牌</h3><div class="pad grid g2">
    <div><label class="f">品牌名稱</label><input class="in" id="beName" value="${esc(eb.name)}"></div>
    <div><label class="f">聯絡窗口 / 備註</label><input class="in" id="beContact" value="${esc(eb.contact)}"></div>
    <div><label class="f">狀態</label><select class="in" id="beStatus">${Object.entries(stLabel).map(([k, v]) => `<option value="${k}" ${eb.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
    <div><label class="f">抽成 %（0–50 整數）</label><input class="in" id="beComm" type="number" min="0" max="50" step="1" value="${eb.commissionPct}"></div>
    <div style="grid-column:1/-1"><label class="f">上架場域</label><div class="row">${S.sites.map(s => `<label class="row small"><input type="checkbox" data-bs="${s.id}" ${eb.sites.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div></div>
    <div class="row"><button class="btn pri" id="beSave">儲存</button><button class="btn" id="beCancel">取消</button></div>
  </div></div>` : ''}`;
  $('#bMonth').onchange = ev => { B.month = ev.target.value; renderBrand(); };
  $('#bNew').onclick = () => { B.edit = '__new'; renderBrand(); };
  el.querySelectorAll('[data-be]').forEach(b => b.onclick = () => { B.edit = b.dataset.be; renderBrand(); });
  $('#bCsv').onclick = () => {
    const rows = [['月份', '品牌', '狀態', '抽成%', '份數', '營業額', '抽成金額', '撥款']];
    S.brands.forEach(b => { const s = sales[b.id] || { qty: 0, base: 0 }; const st = Q.settlement(s.base, b.commissionPct); rows.push([B.month, b.name, stLabel[b.status][0], b.commissionPct, s.qty, s.base, st.commission, st.payout]); });
    download(`快取GO品牌拆帳_${B.month}.csv`, csv(rows));
  };
  if (eb) {
    $('#beCancel').onclick = () => { B.edit = null; renderBrand(); };
    $('#beSave').onclick = () => {
      const name = $('#beName').value.trim(); const comm = Number($('#beComm').value);
      if (!name) return toast('請輸入品牌名稱');
      if (!Number.isInteger(comm) || comm < 0 || comm > 50) return toast('抽成需為 0–50 整數');
      const data = { name, contact: $('#beContact').value.trim(), status: $('#beStatus').value, commissionPct: comm, sites: [...el.querySelectorAll('[data-bs]')].filter(c => c.checked).map(c => c.dataset.bs) };
      if (eb.id) Object.assign(S.brands.find(b => b.id === eb.id), data);
      else S.brands.push({ id: uid('B'), ...data });
      B.edit = null; save(); toast('已儲存'); renderAll();
    };
  }
}

// ════════════════════════════════════════════════════════════
// 營運數據
// ════════════════════════════════════════════════════════════
function backtest(siteId, days) {
  const h = siteHistory(siteId);
  const map = new Map(h.map(x => [x.date, x]));
  const rows = [];
  for (let i = days; i >= 1; i--) {
    const d = Q.addDays(TODAY(), -i);
    const x = map.get(d); if (!x) continue;
    const b = Q.walkinBaseline(h, d, S.cfg.forecastWeeks); if (!b) continue;
    const walkinPrep = Q.ceilSafe(b.value * (100 + S.cfg.safetyPct) / 100);
    const soldWalkin = Math.min(x.walkin, walkinPrep);
    rows.push({ date: d, pre: x.pre, fc: b.value, actual: x.walkin, prepared: x.pre + walkinPrep, sold: x.pre + soldWalkin, lost: x.walkin - soldWalkin, waste: walkinPrep - soldWalkin, demo: x.demo });
  }
  return rows;
}
function renderData() {
  const el = $('#v-data');
  const d = TODAY();
  const ps = S.pickups.filter(p => p.date === d);
  const all = Q.pickupStats(ps.map(p => p.sec), S.cfg.targetSec);
  const pre = Q.pickupStats(ps.filter(p => p.type === 'pre').map(p => p.sec), S.cfg.targetSec);
  const walk = Q.pickupStats(ps.filter(p => p.type === 'walkin').map(p => p.sec), S.cfg.targetSec);
  const tk = S.tickets.filter(t => t.date === d && t.readyAt);
  const regWait = tk.length ? tk.reduce((a, t) => a + (t.readyAt - t.createdAt) / 1000, 0) / tk.length : 0;
  const nPre = activeOrders(d).length, nWalk = S.walkins.filter(w => w.date === d).length, nReg = S.tickets.filter(t => t.date === d).length;
  const nAll = nPre + nWalk + nReg;
  const tierCount = S.tiers.map(t => ({ t, n: S.employees.filter(e => tierOf(e).tier === t).length }));
  const passRev = S.passSales.filter(p => p.date.slice(0, 7) === d.slice(0, 7)).reduce((a, p) => a + p.price, 0);
  const bt = S.sites.map(s => {
    const rows = backtest(s.id, 28);
    const prepared = rows.reduce((a, r) => a + r.prepared, 0);
    const sold = rows.reduce((a, r) => a + r.sold, 0);
    const demand = rows.reduce((a, r) => a + r.pre + r.actual, 0);
    return { s, rows, mape: Q.mape(rows.map(r => ({ forecast: r.fc, actual: r.actual }))), waste: Q.wasteRate(prepared, sold), service: demand ? sold / demand : 0, lost: rows.reduce((a, r) => a + r.lost, 0), wasteQty: prepared - sold, demo: rows.some(r => r.demo) };
  });
  const fmtS = st => st.count ? st.avg.toFixed(1) + 's' : '—';
  el.innerHTML = `
  <div class="grid g4" style="margin-bottom:14px">
    <div class="card kpi"><b>${fmtS(all)}</b><span>快取GO 平均取餐（${all.count} 筆）</span></div>
    <div class="card kpi"><b>${all.count ? pct(all.underRate, 0) : '—'}</b><span>${S.cfg.targetSec} 秒內完成率</span></div>
    <div class="card kpi"><b>${tk.length ? (regWait / 60).toFixed(1) + ' 分' : '—'}</b><span>一般隊伍平均等候</span></div>
    <div class="card kpi"><b>${nAll ? pct(nPre / nAll, 0) : '—'}</b><span>今日預訂滲透率（${nPre}/${nAll}）</span></div>
  </div>
  <div class="grid g2" style="margin-bottom:14px">
    <div class="card"><h3>⚡ 今日取餐速度分析</h3><table>
      <thead><tr><th>類型</th><th class="num">筆數</th><th class="num">平均</th><th class="num">P90</th><th class="num">最慢</th><th class="num">≤${S.cfg.targetSec}s</th></tr></thead>
      <tbody>${[['預訂取餐', pre], ['現場快取', walk], ['合計', all]].map(([n, st]) => `<tr><td>${n}</td><td class="num">${st.count}</td><td class="num">${fmtS(st)}</td><td class="num">${st.count ? st.p90.toFixed(1) + 's' : '—'}</td><td class="num">${st.count ? st.max.toFixed(1) + 's' : '—'}</td><td class="num">${st.count ? pct(st.underRate, 0) : '—'}</td></tr>`).join('')}</tbody></table>
      <div class="pad small muted">數據來自取餐站實際計時；P90 採最近排名法。</div></div>
    <div class="card"><h3>👥 會員與優惠票</h3><table><tbody>
      ${tierCount.map(x => `<tr><td>${x.t.name}（${x.t.discountPct}% 折扣）</td><td class="num">${x.n} 人</td><td class="num">${pct(x.n / S.employees.length)}</td></tr>`).join('')}
      <tr><td>今日通路組成</td><td class="num" colspan="2">預訂 ${nPre}・現場快取 ${nWalk}・一般 ${nReg}</td></tr>
      <tr><td>本月餐券包營收</td><td class="num" colspan="2">${money(passRev)}（${S.passSales.filter(p => p.date.slice(0, 7) === d.slice(0, 7)).length} 筆）</td></tr>
    </tbody></table></div>
  </div>
  <div class="card"><h3>🎯 備餐預估回測（近 28 天，現場快取量）${bt.some(b => b.demo) ? '<span class="tag acc">含示範歷史資料</span>' : ''}</h3><div class="scroll"><table>
    <thead><tr><th>場域</th><th class="num">回測天數</th><th class="num">MAPE</th><th class="num">剩餘浪費率</th><th class="num">剩餘份數</th><th class="num">缺貨份數</th><th class="num">供餐滿足率</th></tr></thead>
    <tbody>${bt.map(b => `<tr><td>${esc(b.s.name)}</td><td class="num">${b.rows.length}</td><td class="num">${b.mape == null ? '—' : b.mape.toFixed(1) + '%'}</td><td class="num">${b.waste.toFixed(1)}%</td><td class="num">${b.wasteQty}</td><td class="num">${b.lost}</td><td class="num">${pct(b.service)}</td></tr>`).join('')}</tbody>
  </table></div>
  <div class="pad small muted">回測方法：對每一天只使用「當天以前」的歷史資料，以前 ${S.cfg.forecastWeeks} 週同星期加權平均預估現場量，備餐 = 預訂 + ⌈預估 × (1+${S.cfg.safetyPct}%)⌉，再與實際需求比對。MAPE = 平均 |預估−實際| / 實際。調整「設定 → 安全庫存 %」可觀察浪費率與缺貨的取捨。</div></div>`;
}

// ════════════════════════════════════════════════════════════
// 設定
// ════════════════════════════════════════════════════════════
const CFG_FIELDS = [
  ['叫號大螢幕', [['marketMode', '市場類型', 'select', [['closed', '封閉市場（科技廠・工號末碼）'], ['open', '開放市場（美食街・取餐號）']]], ['callDigits', '工號末幾碼叫號', 'select', [['3', '末 3 碼'], ['4', '末 4 碼']]], ['concurrentCalls', '尖峰同時叫號人數（試算用）', 'int']]],
  ['營運規則', [['cutoffTime', '當日預訂截止', 'time'], ['slotStart', '取餐開始', 'time'], ['slotEnd', '取餐結束', 'time'], ['slotMinutes', '時段長度（分）', 'int'], ['targetSec', '取餐目標秒數', 'int'], ['avgMakeSec', '一般餐平均製作秒數', 'int'], ['stations', '一般出餐站數', 'int'], ['demoIgnoreCutoff', '展示模式：忽略截止時間', 'bool']]],
  ['備餐預估', [['forecastWeeks', '參考週數', 'int'], ['safetyPct', '安全庫存 %', 'int'], ['fallbackWalkinPct', '無歷史時現場量 = 預訂 × %', 'int']]],
  ['行銷優惠', [['earlyBirdTime', '早鳥期限（前一日）', 'time'], ['earlyBirdDiscount', '早鳥折抵（元）', 'int'], ['flashEnabled', '啟用剩食快閃', 'bool'], ['flashTime', '快閃開始時間', 'time'], ['flashPct', '快閃售價 %（70 = 7折）', 'int'], ['passCap', '餐券/免費券折抵上限（元）', 'int']]],
  ['會員黏著', [['pointPerDollars', '每幾元得 1 點', 'int'], ['stampGoal', '集滿幾章換券', 'int'], ['streakBonusDays', '連續幾個工作日獎勵', 'int'], ['streakBonus', '連續獎勵點數', 'int'], ['redeemPoints', '兌換所需點數', 'int'], ['redeemValue', '兌換券面額（元）', 'int']]],
];
// 工號末碼撞號試算：平均分布（連續編號）情境 + 目前名冊實際分布
function callAnalysis() {
  const k = S.cfg.concurrentCalls;
  const fmtP = p => (p * 100).toFixed(1) + '%';
  const rows = [3000, 5000, 8000].map(n => {
    const p3 = Q.suffixCollisionProb(Q.evenGroups(n, 3), k), p4 = Q.suffixCollisionProb(Q.evenGroups(n, 4), k);
    return `<tr><td>${n.toLocaleString()} 人（連續編號）</td><td class="num">${(n / 1000).toFixed(0)} 人</td><td class="num">${fmtP(p3)}</td><td class="num">${n <= 10000 ? '1 人以下' : ''}</td><td class="num"><b>${fmtP(p4)}</b></td></tr>`;
  });
  const ids = S.employees.map(e => e.id);
  const g3 = Q.suffixGroups(ids, 3), g4 = Q.suffixGroups(ids, 4);
  rows.push(`<tr><td>目前名冊 ${ids.length} 人（實際工號）</td><td class="num">最多 ${Math.max(...g3)} 人</td><td class="num">${fmtP(Q.suffixCollisionProb(g3, k))}</td><td class="num">最多 ${Math.max(...g4)} 人</td><td class="num"><b>${fmtP(Q.suffixCollisionProb(g4, k))}</b></td></tr>`);
  return `<div class="card" style="margin-top:14px"><h3>🔢 工號末碼撞號試算 <span class="muted small">尖峰同時叫號 ${k} 人時，至少兩人末碼相同的機率（精確計算）</span></h3>
    <div class="scroll"><table><thead><tr><th>員工規模</th><th class="num">末 3 碼・每碼人數</th><th class="num">末 3 碼撞號</th><th class="num">末 4 碼・每碼人數</th><th class="num">末 4 碼撞號</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>
    <div class="pad small muted">建議科技廠（3,000–8,000 人）使用末 4 碼：工號連續編號時每個末碼最多 1 人，不會撞號；末 3 碼每碼約 3–8 人，尖峰撞號機率明顯偏高。若工號非連續（跨廠區、跳號），仍可能撞號，系統會在大螢幕自動加註遮罩姓名（王○明）區分。計算方式：無撞號組合數 e<sub>k</sub>(各末碼人數) ÷ C(總人數, k)。</div></div>`;
}
function renderSettings() {
  const el = $('#v-settings');
  el.innerHTML = `
  <div class="grid g2">${CFG_FIELDS.map(([g, fs]) => `<div class="card"><h3>${g}</h3><div class="pad grid g2">${fs.map(([k, n, t, opts]) => `<div>
    <label class="f">${n}</label>${t === 'select' ? `<select class="in" data-cfg="${k}" data-t="select">${opts.map(([v, l]) => `<option value="${v}" ${String(S.cfg[k]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : t === 'bool' ? `<label class="row"><input type="checkbox" data-cfg="${k}" data-t="bool" ${S.cfg[k] ? 'checked' : ''}> 啟用</label>`
      : `<input class="in" data-cfg="${k}" data-t="${t}" type="${t === 'time' ? 'time' : 'number'}" ${t === 'int' ? 'min="0" step="1"' : ''} value="${esc(S.cfg[k])}">`}</div>`).join('')}</div></div>`).join('')}</div>
  ${callAnalysis()}
  <div class="row" style="margin-top:14px"><button class="btn pri" id="cfgSave">儲存設定</button><button class="btn" id="cfgExport">匯出全部資料 JSON</button><button class="btn danger" id="cfgReset">重置示範資料</button></div>
  <div class="note acc" style="margin-top:14px">資料目前儲存在此瀏覽器（localStorage），同一台裝置多個分頁會即時同步。正式導入時請將 save()/load() 改接公司後端或 Firebase，並串接門禁卡讀卡機（USB 鍵盤模式可直接使用）、薪資扣款與 SSO。</div>`;
  $('#cfgSave').onclick = () => {
    const next = { ...S.cfg };
    for (const i of el.querySelectorAll('[data-cfg]')) {
      const k = i.dataset.cfg, t = i.dataset.t;
      if (t === 'bool') next[k] = i.checked;
      else if (t === 'select') next[k] = /^\d+$/.test(i.value) ? Number(i.value) : i.value;
      else if (t === 'int') { const v = Number(i.value); if (!Number.isInteger(v) || v < 0) return toast(`「${i.closest('div').querySelector('.f').textContent}」需為 0 以上整數`); next[k] = v; }
      else { if (!/^\d{2}:\d{2}$/.test(i.value)) return toast('時間格式錯誤'); next[k] = i.value; }
    }
    if (Q.hmToMin(next.slotEnd) <= Q.hmToMin(next.slotStart)) return toast('取餐結束需晚於開始');
    if (next.slotMinutes < 5) return toast('時段長度至少 5 分鐘');
    if (next.flashPct < 1 || next.flashPct > 100) return toast('快閃售價 % 需介於 1–100');
    if (next.concurrentCalls < 2 || next.concurrentCalls > 200) return toast('尖峰同時叫號人數需介於 2–200');
    if (next.stampGoal < 1 || next.streakBonusDays < 1 || next.pointPerDollars < 1 || next.stations < 1 || next.forecastWeeks < 1) return toast('集章數、連續天數、每點金額、出餐站數、參考週數需至少為 1');
    S.cfg = next; save(); toast('設定已儲存'); renderAll();
  };
  $('#cfgExport').onclick = () => download(`quickgo_${TODAY()}.json`, JSON.stringify(S, null, 2), 'application/json');
  $('#cfgReset').onclick = () => { if (!confirm('確定清除所有資料並重建示範資料？')) return; S = seed(); save(); toast('已重置'); renderAll(); };
}
