# ANNULA AI 空間規劃小幫手 — 原型伺服器

`plan.html` 頁面的後端：接收使用者上傳的空間照片，回傳建議植栽清單、數量、每月報價，以及一張「合成預覽圖」。

## 目前狀態

- **植栽分析與報價：真實串接 Gemini API**（`gemini-3.5-flash`），會實際讀取上傳的照片內容，從真實的植栽目錄中挑選建議並說明理由。
- **合成預覽圖：本機影像合成，不呼叫任何外部 AI 圖像 API。** Gemini 的圖像生成模型（`gemini-2.5-flash-image` 等）需要已啟用帳單的 Google AI Studio 專案 — 免費額度是 0，實測會直接回傳 `429 RESOURCE_EXHAUSTED`。與其要求申請 Stability AI／Fal.ai 等另一組帳號與金鑰（一樣有申請門檻，且多半也不是永久免費），改用完全在本機端處理、永久免費、不會有額度或帳單問題的做法：把目錄中植栽的去背去背 PNG（`server/assets/plant-cutouts/`）疊加到使用者上傳的照片下緣，做出一張「示意合成圖」。這不是相片級的 AI 融合結果，頁面上的徽章會清楚寫明「植栽合成預覽（將建議植栽疊加於照片，非 AI 生成影像）」，不會誤導使用者。

## 為什麼需要獨立伺服器？

網站其餘部分（`index.html`／`faq.html`／`projects.html`／`projects-web/`）都是純靜態檔案，可以直接用瀏覽器打開，不需要伺服器。但只要牽涉到呼叫 Gemini API，就一定要有一個伺服器端：**API 金鑰絕對不能出現在瀏覽器看得到的程式碼裡**，所以金鑰只會存在這個 `server/` 資料夾的 `.env` 檔案裡（已被 `.gitignore` 排除，不會進版本控制），由 Node 伺服器讀取後才去呼叫 Gemini，瀏覽器端只跟我們自己的伺服器溝通。

## 本機執行

```bash
cd server
npm install
npm start
```

伺服器啟動後會印出網址，預設是 `http://localhost:4000`。這個伺服器同時也會把整個網站（`index.html` 等）一起服務出來，所以可以直接打開：

- `http://localhost:4000/plan.html` — AI 規劃小幫手頁面
- `http://localhost:4000/index.html` — 主站首頁
- 其餘頁面同理

啟動前請先設定 API 金鑰：把 `server/.env.example` 複製成 `server/.env`，填入 `GEMINI_API_KEY=你的金鑰`（在 [Google AI Studio](https://aistudio.google.com/apikey) 免費申請）。沒有金鑰時，植栽分析會自動退回到目錄內建的保底邏輯（`geminiService.js` 裡的 `buildFallbackRecommendations`），頁面仍可運作，只是建議不會真的根據照片內容判斷。

## 目錄結構

```
server/
  index.js                    -- Express 伺服器 + /api/plan 端點
  geminiService.js             -- 植栽分析（Gemini）+ 合成預覽圖（本機疊圖）
  products.json                 -- 用於推薦邏輯與報價試算的植栽目錄（節錄自 index.html 的 PRODUCTS）
  assets/plant-cutouts/*.png     -- 16 項植栽的去背 PNG，合成預覽圖的素材
  .env.example                    -- 環境變數範例，複製成 .env 後填入金鑰
  package.json
```

## 如何重新產生植栽去背 PNG（新增商品到目錄時）

`assets/plant-cutouts/` 裡的每張去背圖，都是用 `products.json` 裡對應商品的照片（`plant-rental/*.jpeg`）去背而來，去背方式是取四個角落的背景色平均值，再依色差算出透明度。若之後在 `products.json` 新增商品，需要用同樣的方式為新照片產生對應的去背 PNG（存成 `assets/plant-cutouts/<商品id>.png`），否則 `generateMockupImage()` 在合成時會直接略過沒有去背圖的商品（不會出錯，只是該項不會出現在合成預覽圖裡，但仍會出現在建議清單與報價中）。

## 目前的已知限制（原型階段）

- 合成預覽圖是把植栽去背圖固定排列在照片下緣，不會判斷照片中實際的地面、牆面或透視關係，純粹是示意用的「拼貼」效果。
- `plan.html` 目前沒有加進三個既有頁面的導覽列連結，只能透過網址直接開啟，避免真實訪客在功能還不成熟時就看到。確認方向沒問題後，再請告知是否要正式加進導覽列。
