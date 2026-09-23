# ANNULA AI 空間規劃小幫手 — 原型伺服器

`plan.html` 頁面的後端：接收使用者上傳的空間照片，回傳建議植栽清單、數量、每月報價，以及每項植栽的「預設擺放位置」，讓使用者在前端用滑鼠／觸控拖曳調整。

## 目前狀態

- **植栽分析與報價：真實串接 Gemini API**（`gemini-3.5-flash`），會實際讀取上傳的照片內容，從真實的植栽目錄中挑選建議並說明理由。
- **合成預覽圖：前端互動式拖放，不呼叫任何外部 AI 圖像 API，也不在伺服器端做影像合成。** Gemini 的圖像生成模型（`gemini-2.5-flash-image` 等）需要已啟用帳單的 Google AI Studio 專案 — 免費額度是 0，實測會直接回傳 `429 RESOURCE_EXHAUSTED`。與其要求申請 Stability AI／Fal.ai 等另一組帳號與金鑰（一樣有申請門檻，且多半也不是永久免費），改用完全在使用者瀏覽器端處理的做法：伺服器只回傳每項建議植栽的去背 PNG 網址與一個「預設擺放座標」（在照片的百分比座標，落在一個概略對應「窗邊地面」的置中偏下區域 — 我們沒有真的偵測照片裡的窗戶或地板，這是一個沒有電腦視覺輔助下合理的預設猜測），`plan.html` 再把這些去背圖以絕對定位疊在使用者照片上，並讓使用者可以直接拖曳到任何想要的位置（例如真正的窗邊）。這不是相片級的 AI 融合結果，頁面上會清楚提示「可直接拖曳植栽調整擺放位置」，不會誤導使用者以為是 AI 生成的合成圖。

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
  index.js                    -- Express 伺服器 + /api/plan 端點 + /plant-cutouts 靜態路由
  geminiService.js             -- 植栽分析（Gemini）+ 預設擺放座標計算（buildPlacementLayout）
  products.json                 -- 用於推薦邏輯與報價試算的植栽目錄（節錄自 index.html 的 PRODUCTS）
  assets/plant-cutouts/*.png     -- 16 項植栽的去背 PNG，前端拖放疊圖用的素材（經 /plant-cutouts 路由對外提供）
  .env.example                    -- 環境變數範例，複製成 .env 後填入金鑰
  package.json
```

`/api/plan` 回傳的 `recommendations` 每一項除了名稱、數量、價格，還多了：
- `cutoutImage`：去背 PNG 的網址（例如 `/plant-cutouts/monstera-rental.png`），沒有對應去背圖時為 `null`。
- `defaultXPct` / `defaultYPct`：預設擺放座標，皆為 0-100 的百分比，`X` 代表植栽底部中心點的水平位置、`Y` 代表垂直位置。
- `defaultWidthPct`：預設寬度，為照片寬度的百分比（高度依去背圖本身比例自動計算，前端用 `height:auto` 處理）。

`plan.html` 收到後，把使用者上傳的照片（沿用前端已建立的 `URL.createObjectURL` 預覽，不需要伺服器回傳整張照片）當作底圖，再把每個 `cutoutImage` 以 `position:absolute` 疊上去，並用 Pointer Events 實作拖曳（滑鼠與觸控通用）。

## 如何重新產生植栽去背 PNG（新增商品到目錄時）

`assets/plant-cutouts/` 裡的每張去背圖，都是用 `products.json` 裡對應商品的照片（`plant-rental/*.jpeg`）去背而來，去背方式是取四個角落的背景色平均值，再依色差算出透明度。若之後在 `products.json` 新增商品，需要用同樣的方式為新照片產生對應的去背 PNG（存成 `assets/plant-cutouts/<商品id>.png`），否則該項在 `buildPlacementLayout()` 算出的 `cutoutImage` 會是 `null`，前端會直接略過不顯示去背圖（不會出錯，仍會出現在建議清單與報價中）。

## 目前的已知限制（原型階段）

- 預設擺放區域（`geminiService.js` 裡的 `PLACEMENT_ZONE`）是概略對應「窗邊地面」的置中偏下區域，並非真的分析照片找出窗戶或地板位置；使用者可自行拖曳到任何位置調整。
- `plan.html` 目前沒有加進三個既有頁面的導覽列連結，只能透過網址直接開啟，避免真實訪客在功能還不成熟時就看到。確認方向沒問題後，再請告知是否要正式加進導覽列。
