// 快取GO Service Worker：讓 App 在 iOS／Android 主畫面開啟更快、網路不穩時仍能打開畫面
// 策略：網頁（HTML）網路優先（確保拿到最新版），其他檔案先用快取再背景更新；
//       Firebase 程式庫（網址含版本號）快取優先；Firestore 資料連線一律不經快取。
// 更新網站檔案後請把 VERSION 加 1，使用者下次開啟就會換新版。
const VERSION = 'quickgo-v1';
const SHELL = [
  './', 'index.html', 'market.html', 'stall.html', 'board.html', 'kiosk.html', 'admin.html', 'qr.html',
  'styles.css', 'config.js', 'cloud.js', 'core.js', 'menu-data.js', 'app-data.js', 'market-store.js', 'pwa.js',
  'app-employee.js', 'app-market.js', 'app-stall.js', 'app-kiosk.js', 'app-board.js', 'app-ops.js', 'app-admin.js',
  'vendor/qrcode.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'img/rc-black-tea.webp', 'img/rc-logo.webp', 'img/rc-milk-oolong.webp', 'img/rc-salt-cream.webp', 'img/rc-tea-sundae.webp',
  'img/yj-braised-rice-hero.webp', 'img/yj-braised-rice.webp', 'img/yj-line-qr.png', 'img/yj-noodles.webp', 'img/yj-soup.webp',
];
const FIREBASE_SDK = /^https:\/\/www\.gstatic\.com\/firebasejs\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('quickgo-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (FIREBASE_SDK.test(req.url)) {                       // 版本固定的程式庫：快取優先
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;             // Firestore／其他外部連線不處理

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isPage) {                                           // 網頁：網路優先，離線時用快取（忽略 ?venue= 等參數）
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // 其他檔案：先回快取，同時背景更新
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
