# FitFlow Cloud

FitFlow Cloud 是以 Cloudflare Workers、Static Assets 與 D1 建立的全新週期訓練產品。它參考 wger 的運動領域模型，但不是 Django/wger 原始碼的移植，也不依賴舊版 FitFlow。

## 目前範圍（MVP）

- 繁體中文 React 響應式介面
- 動作庫與逐筆來源／授權欄位
- 4 週訓練計畫與週期時間軸
- 今日訓練、組數／次數／時間處方
- 匿名裝置進度與完成紀錄
- 同源 Hono Worker API
- D1 schema、初始動作與示範計畫

登入、跨裝置同步、自動規劃、疲勞調整、相機姿勢辨識與 Workers AI 尚未納入第一階段。

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

4. 發佈：

   ```bash
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

`/api/today`、`/api/progress` 與 `POST /api/runs` 需要 `x-fitflow-device`。目前這是匿名 MVP 識別，不是身分驗證；公開上線前要加入正式帳號與資料隔離。

`POST /api/runs` 由前端提供 UUID `runId`，重送相同記錄會回傳既有結果，避免網路重試產生重複訓練。

## 資料與授權

- 專案程式碼的授權需在公開前明確決定。
- wger 程式碼採 AGPL-3.0-or-later；本專案目前不複製其 Django 原始碼。
- 匯入任何 wger 動作、圖片或其他 Creative Commons 資料時，必須逐筆保存來源 URL、授權名稱與授權 URL。
- `0001_initial.sql` 目前是 FitFlow 自有的示範資料，不代表已完成 wger 資料匯入。

## 下一階段

1. Cloudflare Access／正式帳號及跨裝置同步。
2. 依目標、程度、器材、頻率產生 Program/Phase。
3. 疼痛、RPE/RIR、疲勞回饋與自動調整。
4. 排程拖延、補課、跳過與重新編排。
5. 相機姿勢辨識；先在瀏覽器端執行即時推論，再只上傳必要指標。
6. 經授權稽核後建立可重複執行的 wger 資料匯入流程。
