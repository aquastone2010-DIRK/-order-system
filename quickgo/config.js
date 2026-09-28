// 快取GO 部署設定
// backend: 'firebase' → 多裝置即時同步（正式營運）；'local' → 單機展示（資料只存在此瀏覽器）
// 網址加 ?backend=local 可強制單機展示；連不到 Firebase 時也會自動改用單機展示
window.QG_CONFIG = {
  backend: 'firebase',
  // 與既有「全物流出單與集點系統」同一個 Firebase 專案；快取GO 資料都放在 quickgo_ 開頭的集合
  // （Firebase 網頁 apiKey 本來就會公開在前端，資料安全由 firestore.rules 把關）
  firebase: {
    apiKey: 'AIzaSyDvKWgzTheJyHkKAqA9ClB_krxxNxEloEg',
    authDomain: 'order-management-system-2026.firebaseapp.com',
    projectId: 'order-management-system-2026',
    storageBucket: 'order-management-system-2026.firebasestorage.app',
    messagingSenderId: '417153826085',
    appId: '1:417153826085:web:edbe9a764790904012eecc',
  },
};
