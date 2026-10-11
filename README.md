# FitFlow Cloud

FitFlow Cloud 是以 Cloudflare Workers、Static Assets 與 D1 建立的全新週期訓練產品。它參考 wger 的運動領域模型，但不是 Django/wger 原始碼的移植，也不依賴舊版 FitFlow。

## 目前範圍（MVP）

- 繁體中文／English React 響應式介面，記住語言選擇
- 飲食日誌：自訂每 100 克食物標示、餐別／份量、熱量與三大營養素、每日自訂目標
- 動作庫與逐筆來源／授權欄位
- 4 週訓練計畫與週期時間軸
- 今日訓練、組數／次數／時間處方
- Google Identity Services 登入與帳號隔離的飲食／訓練紀錄
- 同源 Hono Worker API
- D1 schema、初始動作與示範計畫

自動規劃、疲勞調整、相機姿勢辨識與 Workers AI 尚未納入第一階段。

## 技術架構

```text
React 19 + Vite
       │ same origin /api/*
       ▼
Cloudflare Worker (Hono)
       │
       ▼
Cloudflare D1
```

靜態前端與 API 由同一個 Worker 專案發佈，避免額外 CORS 與兩套部署流程。

## 本機開發

需求：Node.js 22+、npm。

```bash
npm install
npm run db:migrate:local
npm run dev
```

首次開發會由 Wrangler 在 `.wrangler/` 建立本機 D1。若 migration 已套用，不需重複執行。

完整驗證：

```bash
npm run check
```

## Cloudflare 部署

1. 建立正式 D1：

   ```bash
   npx wrangler d1 create fitflow-db
   ```

2. 把輸出的 `database_id` 寫入 `wrangler.jsonc`，取代 `local-placeholder`。
3. 套用正式 migration：

   ```bash
   npm run db:migrate:remote
   ```

4. 重新建置後發佈（build 會產生部署設定快照）：

   ```bash
   npm run build
   npm run deploy
   ```

在正式 D1 migration 與網址驗證成功以前，不應停止或刪除舊 `fitflow.service`。

## API

- `GET /api/health`
- `GET /api/exercises?q=&category=`
- `GET /api/programs`
- `GET /api/programs/:slug`
- `GET /api/sessions/:id`
- `GET /api/today`
- `GET /api/progress`
- `POST /api/runs`
- `GET /api/nutrition?date=YYYY-MM-DD`
- `POST /api/nutrition/foods`
- `POST /api/nutrition/entries`
- `DELETE /api/nutrition/entries/:id`
- `PUT /api/nutrition/targets`

`/api/today`、`/api/progress`、`POST /api/runs` 與所有 `/api/nutrition/*` 路由都需要已登入的 session。資料僅依帳號隔離；舊匿名裝置資料保留在資料庫中，但不會在登入後暴露。

`POST /api/runs` 由前端提供 UUID `runId`，重送相同記錄會回傳既有結果，避免網路重試產生重複訓練。

## Google 登入設定

FitFlow 使用 Google Identity Services 的 ID token 登入，不使用 Cloudflare Access；因此靜態 UI 可以公開於 workers.dev。建立 **OAuth 2.0 Client ID → Web application** 後，在 Google Cloud Console 的 **Authorized JavaScript origins** 至少加入：

- `http://localhost:5173`
- `https://fitflow-cloud.alex6563834.workers.dev`

若使用自訂網域或另一個正式部署網址，也必須將該部署專屬 origin 加入。將 Client ID 以 Worker secret 設定（Client ID 雖是 OAuth 協定中的公開值，仍避免寫入提交的部署設定）：

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```

本機可在未提交的 `.dev.vars` 設定 `GOOGLE_CLIENT_ID=...`。不要建立或提交 client secret；此流程不需要它。前端會先請求 `GET /api/auth/config`，只有設定了 Client ID 才載入 `https://accounts.google.com/gsi/client`。Google credential 僅在 Worker 驗證 JWKS、RS256 簽章、issuer、audience、到期時間與已驗證 email 後交換成 HttpOnly、Secure、SameSite=Lax 的不透明 session cookie；前端不保存 JWT。

## 資料與授權

- 此 repository 會公開供檢視與協作；在專案擁有者新增明確授權前，未授予重製、修改或散布程式碼的權利。
- wger 程式碼採 AGPL-3.0-or-later；本專案目前不複製其 Django 原始碼。
- 匯入任何 wger 動作、圖片或其他 Creative Commons 資料時，必須逐筆保存來源 URL、授權名稱與授權 URL。
- `0001_initial.sql` 目前是 FitFlow 自有的示範資料，不代表已完成 wger 資料匯入。

## 下一階段

1. 依目標、程度、器材、頻率產生 Program/Phase。
2. 疼痛、RPE/RIR、疲勞回饋與自動調整。
3. 排程拖延、補課、跳過與重新編排。
4. 相機姿勢辨識；先在瀏覽器端執行即時推論，再只上傳必要指標。
5. 經授權稽核後建立可重複執行的 wger 資料匯入流程。

## 營養與語言

營養 API 均需登入 session，資料按 Google 帳號隔離。食物與餐點使用前端 UUID 作為重試鍵；刪除餐點保留 tombstone，避免舊請求重試時重新出現。營養標示由使用者輸入，不是 wger 食物資料庫或自動飲食建議；目標預設為空，可自行設定或清空。

語言切換覆蓋現有介面、示範課表、動作名稱與說明，不翻譯使用者自訂名稱及筆記；新增訓練內容需同步補充 `src/translations.ts`。語言保存在 `fitflow-locale`，切換不會重掛訓練頁或清除訓練狀態。
