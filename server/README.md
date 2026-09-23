# ANNULA AI 空間規劃小幫手 — 原型伺服器

`plan.html` 頁面的後端原型：接收使用者上傳的空間照片，回傳建議植栽清單、數量、每月報價，以及一張「模擬預覽圖」。

**目前狀態：完全使用模擬資料（stub），尚未串接真實的 Gemini API。** 這樣可以在還沒有 API 金鑰、也還沒決定正式上線環境之前，先驗證整個流程（上傳 → 伺服器 → 顯示結果）跑不跑得通、UI 好不好用。

## 為什麼需要獨立伺服器？

網站其餘部分（`index.html`／`faq.html`／`projects.html`／`projects-web/`）都是純靜態檔案，可以直接用瀏覽器打開，不需要伺服器。但只要牽涉到呼叫 Gemini API，就一定要有一個伺服器端：**API 金鑰絕對不能出現在瀏覽器看得到的程式碼裡**，所以金鑰只會存在這個 `server/` 資料夾的 `.env` 檔案裡，由 Node 伺服器讀取後才去呼叫 Gemini，瀏覽器端只跟我們自己的伺服器溝通。

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

## 之後要接上真正的 Gemini API 時

1. 到 [Google AI Studio](https://aistudio.google.com/apikey) 申請一組免費的 API 金鑰。
2. 把 `server/.env.example` 複製成 `server/.env`，填入：
   ```
   GEMINI_API_KEY=你的金鑰
   ```
   `.env` 已經被 `.gitignore` 排除，不會被提交進版本控制。
3. 打開 `server/geminiService.js`，裡面 `analyzeSpace()` 和 `generateMockupImage()` 兩個函式上方都有清楚標註 `TODO` 的區塊，說明要呼叫哪一個 Gemini API endpoint、要帶什麼參數。把模擬邏輯換成真正的 `fetch()` 呼叫即可，其他程式（`server/index.js`、`plan.html`）完全不需要改動，因為回傳的資料格式已經先設計好了。

## 目錄結構

```
server/
  index.js           -- Express 伺服器 + /api/plan 端點
  geminiService.js    -- AI 分析與圖像生成邏輯（目前是 stub，含真實串接的 TODO）
  products.json        -- 用於推薦邏輯與報價試算的植栽目錄（節錄自 index.html 的 PRODUCTS）
  .env.example          -- 環境變數範例，複製成 .env 後填入金鑰
  package.json
```

## 目前的已知限制（原型階段）

- 植栽推薦是根據照片內容的「雜湊值」做偽隨機挑選，並非真的分析照片內容。
- 「模擬預覽圖」目前只是把使用者上傳的原圖原樣回傳，頁面上會清楚標示「模擬預覽（尚未串接真實 AI 圖像生成）」，不會誤導使用者以為那是 AI 生成的結果。
- `plan.html` 目前沒有加進三個既有頁面的導覽列連結，只能透過網址直接開啟，避免真實訪客在還沒串接真實 AI 之前就看到這個功能。確認方向沒問題後，再請告知是否要正式加進導覽列。
