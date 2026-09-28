# 快取GO 上線步驟（美食街 MVP）

目標：顧客手機點餐、攤位平板接單、取餐區電視叫號，三者即時同步。
架構：網站放 **GitHub Pages**（免費），資料放既有的 **Firebase 專案 `order-management-system-2026`**（`quickgo_` 開頭的集合，不影響既有出單系統）。

預估時間：30–40 分鐘。

---

## 1. Firebase 設定（Firebase Console）

網址：https://console.firebase.google.com → 選 `order-management-system-2026`

### 1-1 開啟登入方式
**Authentication → Sign-in method**
- **匿名（Anonymous）**：應已開啟（既有出單系統在用）。顧客與叫號電視用它。
- **電子郵件／密碼（Email/Password）**：按「啟用」。攤位人員用它登入。

### 1-2 建立攤位帳號
**Authentication → Users → 新增使用者**，每個攤位一組，例如：

| 攤位 | Email | 密碼 |
|---|---|---|
| 楊家一鍋滷 | `yj@你的網域` | 至少 8 碼，交給攤位保管 |
| 一杯紅 | `rc@你的網域` | 同上 |

> Email 不需要真的能收信，只當帳號使用。攤位人員離職或密碼外流時，在這裡停用或改密碼即可。

### 1-3 發布安全規則（重要）
**Firestore Database → 規則**：把 `quickgo/firestore.rules` **整份**貼上 → 發布。

- 目前的規則允許「任何匿名登入者讀寫所有資料」，任何人都能改訂單、甚至改既有出單系統的客戶資料。新規則修補了這個問題。
- 新規則**完整保留**既有出單系統 `orders`、`customers`、`products`、`config` 四個集合的原本權限，出單系統不受影響。
- 若既有出單系統日後新增其他集合，要在規則裡照同樣格式加一行，否則會被擋。

發布後到「規則遊樂場」可自行驗證；本專案的 11 項規則測試（`npm run test:rules`）已在模擬器全數通過。

---

## 2. 放上 GitHub Pages

1. 把 `claude/relaxed-mendel-377t9v` 分支合併到 `main`（或直接用這個分支發布）。
2. GitHub 專案 → **Settings → Pages** → Source 選 `Deploy from a branch` → 選分支與 `/ (root)` → Save。
3. 約 1–2 分鐘後，網址會是：
   `https://<GitHub帳號>.github.io/-order-system/quickgo/`

各頁網址：

| 用途 | 網址（接在上面後面） | 裝置 |
|---|---|---|
| 顧客點餐 | `market.html` | 顧客手機（掃 QR 桌卡進入） |
| 攤位接單 | `stall.html?brand=YJ`／`stall.html?brand=RC` | 各攤位平板 |
| 叫號大螢幕 | `board.html?site=TCH` | 取餐區電視（瀏覽器全螢幕） |
| QR 桌卡 | `qr.html` | 管理者電腦列印 |
| 營運後台 | `admin.html` | 管理者電腦 |

> 若 Firebase 的 API 金鑰有設定「HTTP 參照網址限制」，要把 `https://<GitHub帳號>.github.io/*` 加入允許清單（Google Cloud Console → API 和服務 → 憑證）。沒設限制則略過。

---

## 3. 安裝成手機／平板 App（iOS、Android）

快取GO 是 PWA（網頁 App），**不需上架 App Store／Google Play**，打開網址後加到主畫面即可：

| 裝置 | 步驟 |
|---|---|
| **iPhone／iPad** | 用 **Safari** 開網址 → 下方「分享」⬆️ →「加入主畫面」→「新增」 |
| **Android** | 用 **Chrome** 開網址 → 畫面下方出現「安裝快取GO App」→ 安裝（或右上 ⋮ →「安裝應用程式」） |
| **電腦（Chrome／Edge）** | 網址列右側的安裝圖示 → 安裝 |

每個頁面是獨立的 App：顧客裝「快取GO點餐」，攤位平板裝「快取GO攤位」，電視裝「快取GO叫號」。

安裝後：
- 全螢幕開啟、有 App 圖示，開啟速度較快。
- 網路中斷時仍能打開畫面與菜單（下單與訂單更新需恢復網路，畫面上方會顯示離線提示）。
- 攤位平板、叫號電視、取餐站會**保持螢幕常亮**（iOS 16.4 以上、Android Chrome）。
- 攤位平板第一次開啟後請按「🔔 開啟提示音」（瀏覽器規定需先點一下才能發聲）；iPhone／iPad 請關閉「靜音模式」才聽得到新單提示音。

---

## 4. 開店前檢查

1. 列印 QR 桌卡：開 `qr.html` → 在「正式網址」欄填第 2 步的網址 → 列印（出現紅色警告代表網址不對，顧客會打不開）。
2. 攤位平板登入 `stall.html`，按「開啟提示音」。
3. 用自己手機掃 QR 下一張測試單 → 確認攤位響鈴、電視出現在「製作中」→ 攤位按「完成・叫號」→ 電視與手機都顯示「請取餐」→ 攤位「取消」這張測試單。
4. 各攤位在「售完管理」確認今日供應品項。

---

## 5. 日常營運

- 取餐號每天從 001 重新開始（依日期分開計數），各攤位號碼不同開頭（楊家 Y、一杯紅 R）。
- 付款：MVP 不串金流，顧客取餐時在櫃台付款，攤位按「收現金」或「收行動支付」記錄。
- 報表：攤位頁「報表」可看今日／本月／自訂期間，含品項銷量、收款方式、平均出餐時間，可匯出 CSV。
- 營運後台「合作品牌管理」會讀取當月美食街營業額計算拆帳。

---

## 6. 更換品牌 Logo 與 App 圖示

1. 把品富食品 Logo 放到：
   - `quickgo/img/brand-logo.png`：頁首用的完整 Logo（橫式，含文字，透明或米白底）
   - `quickgo/img/brand-mark.png`：只有圖形標誌（正方形，≥1024px），給 App 圖示用
2. 執行 `cd quickgo && npm run icons`，會重新產生 iOS／Android 所有尺寸圖示。
3. 把 `sw.js` 第一行附近的 `VERSION` 加 1（例如 `quickgo-v2`），已安裝的 App 下次開啟就會更新。

> iOS 主畫面圖示在安裝當下就固定了，換圖示後需刪除主畫面圖示再重新「加入主畫面」。

---

## 7. 修改菜單

菜單在 `quickgo/menu-data.js`（價格、上市日、套餐組成）。修改後執行 `npm test` 確認價格與套餐省額正確，再把 `sw.js` 的 `VERSION` 加 1 後發布。

---

## 測試（開發者）

```bash
cd quickgo
npm install
npm test               # 計算、菜單、App 設定（26 項）
npm run test:rules     # Firestore 安全規則（11 項，本機模擬器，不碰正式資料）
npm run test:e2e       # 多裝置端對端（顧客×N、攤位、電視；CROWD=12 可測 12 人同時下單）
```
