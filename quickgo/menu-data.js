/*
 * 快取GO 開放市場（美食街）品牌菜單
 * 來源：
 *   楊家一鍋滷 — 「楊家一鍋滷 單色點餐菜單（梧棲童綜合醫院美食街 B2）」Word 點餐單
 *   一杯紅     — 一杯紅 菜單海報（1–30 號品項）
 * 價格為新台幣整數元；from = 上市日（含當天起可點）。
 * 瀏覽器：window.QGMarket；Node：require('./menu-data.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QGMarket = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const venues = [
    { id: 'TCH', name: '梧棲童綜合醫院美食街 B2', sub: '統一童綜合商場', brands: ['YJ', 'RC'] },
  ];

  const RICE_NOODLE = { label: '主食', options: ['飯', '拌麵'] };
  const GENG = { label: '主食', options: ['羹麵', '羹飯'] };

  const brands = {
    YJ: {
      name: '楊家一鍋滷', code: 'Y', tagline: '一鍋慢滷・飯麵都香',
      hero: 'img/yj-braised-rice-hero.webp', line: 'img/yj-line-qr.png',
      categories: [
        { id: 'main', name: '經典主食', img: 'img/yj-noodles.webp', items: [
          { id: 'YJ-M1', name: '傳香滷肉飯／拌麵', price: 60, img: 'img/yj-braised-rice.webp', tag: '招牌', choice: RICE_NOODLE },
          { id: 'YJ-M2', name: '蔥香雞絲飯／拌麵', price: 60, choice: RICE_NOODLE },
          { id: 'YJ-M3', name: '台式酥香燒肉飯／拌麵', price: 110, from: '2026-10-05', choice: RICE_NOODLE },
          { id: 'YJ-M4', name: '土魠魚羹麵／羹飯', price: 90, choice: GENG },
        ] },
        { id: 'soup', name: '羹湯・燉湯', img: 'img/yj-soup.webp', items: [
          { id: 'YJ-S1', name: '酥香土魠魚羹', price: 75 },
          { id: 'YJ-S2', name: '蒜香鮮雞腿湯', price: 120, from: '2026-10-01' },
          { id: 'YJ-S3', name: '百菇鮮雞腿湯', price: 120, from: '2026-10-01' },
          { id: 'YJ-S4', name: '清燉豬腳湯', price: 130, from: '2026-10-05' },
        ] },
        { id: 'side', name: '暖心小菜', items: [
          { id: 'YJ-D1', name: '滷香油豆腐', note: '3 塊', price: 35 },
          { id: 'YJ-D2', name: '古早味豆干絲', price: 40 },
          { id: 'YJ-D3', name: '養生黑木耳', price: 40 },
          { id: 'YJ-D4', name: '鮮燙時蔬', note: '淋肉燥', price: 45 },
          { id: 'YJ-D5', name: '清燉豬腳盤', price: 120, from: '2026-10-05' },
        ] },
        // parts：套餐組成（用來計算原價與省下金額）；D 套餐的「拌飯／拌麵」未列單價，改用點餐單標示的省額
        { id: 'set', name: '超值套餐', items: [
          { id: 'YJ-A', name: 'A 傳香滷肉雙寶', desc: '滷肉飯／麵＋土魠魚羹', price: 120, parts: ['YJ-M1', 'YJ-S1'], choice: RICE_NOODLE },
          { id: 'YJ-B', name: 'B 蔥香雞絲雙寶', desc: '雞絲飯／麵＋土魠魚羹', price: 120, parts: ['YJ-M2', 'YJ-S1'], choice: RICE_NOODLE },
          { id: 'YJ-C', name: 'C 酥香燒肉雙寶', desc: '燒肉飯／麵＋土魠魚羹', price: 165, parts: ['YJ-M3', 'YJ-S1'], choice: RICE_NOODLE },
          { id: 'YJ-D', name: 'D 招牌清燉豬腳定食', desc: '清燉豬腳＋拌飯／拌麵＋鮮燙時蔬＋滷香油豆腐', price: 168, listedSaving: 32, from: '2026-10-05', choice: { label: '主食', options: ['拌飯', '拌麵'] } },
          { id: 'YJ-E', name: 'E 酥香燒肉定食', desc: '燒肉飯／麵＋時蔬＋油豆腐', price: 155, parts: ['YJ-M3', 'YJ-D4', 'YJ-D1'], choice: RICE_NOODLE },
        ] },
        { id: 'addon', name: '加購', note: '需搭配主食或套餐', addon: true, items: [
          { id: 'YJ-X1', name: '加購 鮮燙時蔬', price: 30, addon: true },
          { id: 'YJ-X2', name: '加購 滷香油豆腐', price: 30, addon: true },
          { id: 'YJ-X3', name: '加購 土魠魚羹', price: 65, addon: true },
        ] },
      ],
    },
    RC: {
      name: '一杯紅', en: 'ONE RED CUP', code: 'R', tagline: '一杯紅，一葉青',
      hero: 'img/rc-tea-sundae.webp', logo: 'img/rc-logo.webp',
      heroTitle: '焙香茶淋 × 鹽雪脆香', heroText: '以原葉為本・焙香茶淋冰淇淋・鹽雪點綴，嚐見全新風味層次。',
      drinkOptions: { sugar: ['正常糖', '少糖', '半糖', '微糖', '無糖'], ice: ['正常冰', '少冰', '微冰', '去冰', '溫', '熱'] },
      notes: ['甜度可調', '冰熱可選', '部份品項依季節供應', '外帶・內用・自取'],
      categories: [
        { id: 'red', name: '① 經典紅茶系列', img: 'img/rc-black-tea.webp', items: [
          { id: 'RC-01', no: 1, name: '一杯紅茶', price: 35 },
          { id: 'RC-02', no: 2, name: '蜜香紅茶', price: 40 },
          { id: 'RC-03', no: 3, name: '桂花紅茶', price: 45 },
          { id: 'RC-04', no: 4, name: '焙香紅茶', price: 45, img: 'img/rc-black-tea.webp' },
          { id: 'RC-05', no: 5, name: '葡萄柚紅茶', price: 55 },
        ] },
        { id: 'green', name: '② 青茶・烏龍系列', items: [
          { id: 'RC-06', no: 6, name: '一葉青茶', price: 35 },
          { id: 'RC-07', no: 7, name: '高山青茶', price: 40 },
          { id: 'RC-08', no: 8, name: '金宣烏龍', price: 45 },
          { id: 'RC-09', no: 9, name: '輕焙烏龍', price: 45 },
          { id: 'RC-10', no: 10, name: '深焙烏龍', price: 50 },
        ] },
        { id: 'milk', name: '③ 奶香茶系列', img: 'img/rc-milk-oolong.webp', items: [
          { id: 'RC-11', no: 11, name: '一杯奶茶', price: 50 },
          { id: 'RC-12', no: 12, name: '珍珠奶茶', price: 60 },
          { id: 'RC-13', no: 13, name: '焙香奶茶', price: 60 },
          { id: 'RC-14', no: 14, name: '紅玉厚奶', price: 70 },
          { id: 'RC-15', no: 15, name: '深焙烏龍厚奶', price: 70 },
        ] },
        { id: 'fruit', name: '④ 果茶・暖茶系列', items: [
          { id: 'RC-16', no: 16, name: '檸檬青茶', price: 55 },
          { id: 'RC-17', no: 17, name: '柚香蜜紅', price: 65 },
          { id: 'RC-18', no: 18, name: '桂圓紅棗紅茶', price: 65 },
          { id: 'RC-19', no: 19, name: '黑糖薑汁紅茶', price: 65 },
          { id: 'RC-20', no: 20, name: '烤地瓜烏龍厚奶', price: 75 },
        ] },
        { id: 'salt', name: '⑤ 鹽雪特調系列', img: 'img/rc-salt-cream.webp', tag: '人氣推薦', items: [
          { id: 'RC-21', no: 21, name: '鹽花雪頂紅茶', price: 75, img: 'img/rc-salt-cream.webp' },
          { id: 'RC-22', no: 22, name: '鹽花雪頂青茶', price: 75 },
          { id: 'RC-23', no: 23, name: '白雪鹽花紅', price: 85 },
          { id: 'RC-24', no: 24, name: '黑雪鹽花紅', price: 90 },
          { id: 'RC-25', no: 25, name: '莓雪鹽花紅', price: 90 },
          { id: 'RC-26', no: 26, name: '焦糖鹽雪紅', price: 90 },
          { id: 'RC-27', no: 27, name: '白雪焙香烏龍', price: 85 },
          { id: 'RC-28', no: 28, name: '黑雪焙香烏龍', price: 90 },
          { id: 'RC-29', no: 29, name: '焦糖焙香鹽雪', price: 90 },
          { id: 'RC-30', no: 30, name: '焙香鹽雪厚奶', price: 90 },
        ] },
      ],
    },
  };

  const MAX_LINES = 10, MAX_QTY = 20;

  // ── 查詢與計算 ───────────────────────────────────────────
  function items(brandId) { return brands[brandId].categories.flatMap(c => c.items.map(i => ({ ...i, brandId, cat: c.id }))); }
  function item(id) { for (const b of Object.keys(brands)) { const f = items(b).find(i => i.id === id); if (f) return f; } return null; }
  // 可點日：自身上市日與所有組成品項上市日取最晚者
  function availableFrom(it) {
    const dates = [it.from, ...(it.parts || []).map(p => item(p).from)].filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }
  function isAvailable(it, dateStr) { const f = availableFrom(it); return !f || dateStr >= f; }
  // 套餐：原價 = 組成單價合計；省下 = 原價 − 套餐價（無 parts 時用點餐單標示值）
  function setValue(it) {
    if (!it.parts) return { original: null, saving: it.listedSaving ?? null, computed: false };
    const original = it.parts.reduce((a, p) => a + item(p).price, 0);
    return { original, saving: original - it.price, computed: true };
  }
  // 購物車：lines = [{ id, qty }]；加購需同品牌車內有主食或套餐
  function cartSummary(lines) {
    let total = 0; const errors = [];
    const byBrand = {};
    for (const l of lines) {
      const it = item(l.id);
      if (!it) { errors.push(`查無品項 ${l.id}`); continue; }
      if (!Number.isInteger(l.qty) || l.qty < 1) { errors.push(`${it.name} 數量需為正整數`); continue; }
      const sub = it.price * l.qty;
      total += sub;
      (byBrand[it.brandId] = byBrand[it.brandId] || { total: 0, qty: 0, hasMeal: false, addons: 0, lineCount: 0 });
      byBrand[it.brandId].total += sub; byBrand[it.brandId].qty += l.qty; byBrand[it.brandId].lineCount++;
      if (l.qty > MAX_QTY) errors.push(`${it.name} 單項最多 ${MAX_QTY} 份`);
      if (it.cat === 'main' || it.cat === 'set') byBrand[it.brandId].hasMeal = true;
      if (it.addon) byBrand[it.brandId].addons += l.qty;
    }
    for (const [b, v] of Object.entries(byBrand)) if (v.addons && !v.hasMeal) errors.push(`${brands[b].name} 加購需搭配主食或套餐`);
    // 雲端規則限制：每家店每張單最多 10 種品項（見 firestore.rules）
    for (const [b, v] of Object.entries(byBrand)) if (v.lineCount > MAX_LINES) errors.push(`${brands[b].name} 每張單最多 ${MAX_LINES} 種品項，請分兩次下單`);
    return { total, byBrand, errors, ok: errors.length === 0 };
  }

  return { MAX_LINES, MAX_QTY, venues, brands, items, item, availableFrom, isAvailable, setValue, cartSummary };
});
