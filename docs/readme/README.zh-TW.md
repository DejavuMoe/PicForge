<h1 align="center">PicForge</h1>

<p align="center">
  <strong>基於 WebAssembly 的高效能純前端影像與動態媒體處理工具箱</strong><br>
  100% 瀏覽器本地運算 · 零檔案上傳 · 零遙測追蹤 · 零後端依賴
</p>

<p align="center">
  <a href="https://picforge.de"><strong>線上展示：picforge.de</strong></a>
</p>

<p align="center">
  <strong>語言 / Language:</strong> <a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | 繁體中文 | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.15.0-blue.svg" alt="Version 0.15.0" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License MIT" />
  <img src="https://img.shields.io/badge/react-18-blue.svg" alt="React 18" />
  <img src="https://img.shields.io/badge/typescript-5-blue.svg" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/vite-5-646CFF.svg" alt="Vite 5" />
  <img src="https://img.shields.io/badge/pwa-offline_ready-orange.svg" alt="PWA Ready" />
  <img src="https://img.shields.io/badge/tests-128%20passed-brightgreen.svg" alt="Tests" />
</p>

---

## 概述

**PicForge** 是一款本地優先（Local-first）的開源瀏覽器媒體工具箱，專為高輸送量批次圖片壓縮、Android 動態相片提取以及跨平台 iOS 原況照片轉碼所設計。

與傳統仰賴雲端伺服器的轉換服務不同，PicForge 的所有解碼、處理與編碼管線皆在用戶端 Web Worker 與 WebAssembly 執行環境中完成。使用者的相片與影片完全留存在本機裝置記憶體中，絕不對外發送任何網路請求。

<p align="center">
  <img src="../assets/picforge-workspace.jpg" alt="PicForge 工作區" width="100%" />
</p>

---

## 核心功能

### ⚡ 1. 批次圖片壓縮
* **WebAssembly 編解碼套件**：整合 `@jsquash/*` 編譯的 WebAssembly 原生編解碼器：
  * **MozJPEG**：感知量化與漸進式掃描最佳化。
  * **WebP**：支援失真與無失真壓縮，自動偵測並啟用 SIMD 指令加速。
  * **OxiPNG**：無損多行程 PNG 深度體積最佳化。
  * **AVIF**：新一代高壓縮率編碼，支援 0–100 線性品質映射與色度取樣控制（`4:4:4` 與 `4:2:0`）。
* **自適應尺寸調整**：提供三種保持比例約束的縮放模式：
  * `contain`（包含）：等比例縮放至邊界內，防止影像被放大失真。
  * `cover`（覆蓋）：以中心對齊裁切填滿至目標幾何尺寸。
  * `stretch`（拉伸）：強制拉伸至指定的絕對寬高。
* **分層設定架構**：支援全域批次預設參數，並允許為佇列中任一單張圖片設定完全獨立的設定快照，此快照在全域參數變更時不會被覆寫。
* **即時畫質檢驗**：
  * 基於視口圖層裁切（Viewport-layer clip）的即時雙向分割對比滑桿。
  * 並排比對與單圖模式，支援 2× 放大與畫布拖曳平移檢驗細節。
* **並行控制與安全機制**：
  * 具備並行上限的 Web Worker 任務池排程機制。
  * 基於 `AbortController` 與 `taskEpoch` 序號的任務取消機制，防止逾期 Worker 回呼引發狀態污染。
  * 經過防路徑穿越過濾的 ZIP 批次匯出，隨附機器可讀的完整設定中繼資料清單（`picforge-manifest.json`）。

### 📱 2. Android 動態相片提取
* **二進位解析引擎**：直接掃描 JPEG 檔案的二進位標記結構，定位內嵌 MP4 微微影片串流的起始位移。
* **完全無損與位元組一致**：直接分離原始靜態 JPEG 影像與內嵌 MP4 影片，不經過任何二次解碼與重新編碼，匯出的位元組串流與原檔案完全一致。
* **即時處理輸送量**：免除編解碼運算負載，處理速度僅取決於本機磁碟與記憶體 I/O。
* **批次提取**：支援多檔案拖放排隊、提取進度回饋以及一鍵 ZIP 打包匯出。

### 🍏 3. iOS 原況照片轉換
* **啟發式基名配對**：支援多檔案混合選取，按不分大小寫的目錄結構與檔案基名（Basename）自動將 `.HEIC` 靜態圖與 `.MOV` 影片軌關聯配對。
* **QuickTime Clean Aperture（`clap`）解析配接器**：解析 QuickTime Atom 中繼資料樹狀結構中的有效孔徑參數，在自動旋轉與匯出前校正裁切區域，避免邊緣黑邊或網格縫隙。
* **純前端轉碼管線**：
  * **HEIC → MozJPEG**：透過 `libheif-js` 解碼 HEIF 高效能影像並重新壓縮為高品質 JPEG。
  * **MOV → H.264 / AAC**：在瀏覽器單執行緒 WebAssembly FFmpeg 環境中將影片串流轉碼為高相容性的標準 MP4。
* **逐幀精準 PTS 保留**：預設嚴格保留原始顯示時間戳記（PTS），消除畫面重新取樣引起的抖動與幀重複現象，並提供 30 fps 標準化重取樣選項。
* **轉碼預設檔位**：
  * **Balanced（平衡）**：CRF 23，長邊 ≤ 1920px，MozJPEG 品質 85（推薦預設）。
  * **Quality（高品質）**：CRF 20，長边 ≤ 1920px，MozJPEG 品質 90。
  * **Compact（高壓縮）**：CRF 26，長邊 ≤ 1280px，MozJPEG 品質 75。
* **非相容環境無縫降級**：當宿主瀏覽器環境缺少特定影片解碼支援時，自動切換至靜態預覽畫面，並完整保留檔案匯出與下載功能。

---

## 架構與隱私準則

* **100% 本地運算與隱私安全**：無追蹤埋點、無使用者行為記錄、無 Cookie、無遠端檔案上傳。所有運算與記憶體佔用皆嚴格限制於當前瀏覽器分頁內。
* **WASM 引擎隨需延遲載入**：體積較大的 WebAssembly 執行環境（如 FFmpeg 與 libheif）僅在使用者實際切換至相應工具工作區時才進行載入，降低初始首頁負擔。
* **完整 PWA 離線支援**：內建 Service Worker，建置時自動產生靜態資源預快取資訊清單（`precache.json`）。首次造訪快取完成後，應用程式即可在完全離線環境下啟動並穩定運作。
* **記憶體生命週期控管**：嚴格追蹤並即時撤銷釋放產生的 Object URL 與二進位 ArrayBuffer，避免長時間大量批次處理造成瀏覽器分頁崩潰。
* **多國語言支援**：內建 `i18next` 國際化框架，支援 5 種語言介面切換：
  * 英語 (`en`)
  * 簡體中文 (`zh-CN`)
  * 繁體中文 (`zh-TW`)
  * 日語 (`ja`)
  * 韓語 (`ko`)
* **現代化自適應介面**：基於 CSS 變數與設計權杖建置的毛玻璃風格介面，搭配 Geist 字體、動態 Canvas 粒子背景、批次完成彩花動畫以及深淺色主題切換。

---

## 效能與驗收基準

在官方標準驗收樣本（Chromium / Linux x86_64）上的實際轉碼測試數據：

| 媒體串流 | 原始輸入 | 匯出輸出 | 輸出解析度 | 體積變化率 | 結構相似性 (SSIM) |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **iOS 相片** | 2.33 MB HEIC | 2.01 MB MozJPEG (Q85) | 4284 × 5712 | **-13.8%** | **0.9898** |
| **iOS 影片** | 2.89 MB MOV | 0.94 MB H.264 MP4 | 1308 × 1744 | **-67.4%** | **0.9821** |
| **Android 動態相片** | 9.35 MB JPG | 位元組一致的 JPG + MP4 | 原始尺寸 | 無失真 | **1.0000** |

*詳細的時間戳記對齊驗證、SSIM 測試指令碼與跨瀏覽器效能表現請參閱 [docs/SAMPLE_VALIDATION.md](../SAMPLE_VALIDATION.md)。*

---

## Monorepo 專案結構

PicForge 採用基於 `pnpm` 模組化管理的 TypeScript Monorepo 架構：

```text
PicForge/
├── docs/                       # QA 檢查清單、基準報告與多語系文件
├── packages/
│   ├── app/                    # React 18 + Vite 用戶端應用、Zustand 狀態與 UI 工作區
│   │   ├── public/             # PWA Manifest、Service Worker、字型與 vendor 級 WASM 資產
│   │   └── src/
│   │       ├── components/     # UI 檢視元件（DropZone、Preview、FileList、Settings 等）
│   │       ├── hooks/          # autoCompressController 與 Worker 任務池排程器
│   │       ├── landing/        # Canvas 互動粒子背景與著陸頁
│   │       ├── motion/         # Clean-aperture 解析器、HEIC/FFmpeg 處理管線、MotionWorkspace
│   │       └── stores/         # Zustand 狀態儲存（fileStore、settingsStore）
│   ├── codecs/                 # 編解碼器介面定義、參數結構與 WASM 載入入口
│   └── worker/                 # Web Worker 執行池、解碼縮放與 AVIF/WebP 編碼核心
└── scripts/                    # 編解碼器準備指令碼、Playwright 瀏覽器測試及自動部署工具
```

---

## 快速上手

### 環境需求
* **Node.js**：`^20.11.0` 或 `^22.0.0`（建議使用 LTS 版本）
* **pnpm**：`^11.8.0`

### 本地端開發

```bash
# 複製儲存庫
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge

# 安裝相依套件
pnpm install

# 啟動本地開發伺服器（預設繫結於 127.0.0.1:5173）
pnpm dev
```

### 正式環境建置

```bash
# 建置前端產物並複製鎖定版本的 WASM 執行引擎
pnpm build

# 本地預覽正式建置產物
pnpm preview
```

---

## 品質保證與自動化測試

在提交 PR 或釋出新版本前，請執行完整的驗證測試流程：

```bash
# 程式碼風格與 Lint 檢查
pnpm lint

# 全工作區靜態型別檢查
pnpm typecheck

# 單元測試與 WASM 整合測試（128 項測試全數通過）
pnpm test

# 端到端瀏覽器測試（需安裝 Chromium 與本地 ffprobe）
pnpm exec playwright install chromium
pnpm test:browser
```

---

## 瀏覽器相容性支援

| 瀏覽器核心 | 桌面端 | 行動端 | 驗證狀態 | 說明 |
| :--- | :---: | :---: | :---: | :--- |
| **Chromium** (Chrome, Edge, Brave) | ✅ | ✅ | **完整驗證** | 原生支援 H.264 解碼播放，完整 PWA 離線能力，支援 WASM SIMD 加速。 |
| **Gecko** (Firefox) | ✅ | ✅ | **良好支援** | 完整支援圖片壓縮、提取與下載；無原生解碼環境提供靜態預覽回退。 |
| **WebKit** (Safari, iOS Safari) | ✅ | ✅ | **良好支援** | 基於標準 Web Workers 與 WebAssembly 架構，不依賴 `SharedArrayBuffer`。 |

---

## 開源授權與合規宣告

* **應用程式本體原始碼**：採用 [MIT License](../../LICENSE) 授權。
* **第三方編解碼函式庫與二進位資產**：
  * **FFmpeg WebAssembly Core**：採用 [GPL-2.0-or-later](../../packages/app/public/licenses/FFmpeg-GPL-2.0.txt) 授權。
  * **libheif**：採用 [LGPL-3.0](../../packages/app/public/licenses/libheif-LGPL-3.0.txt) 授權。
  * **MotionFlow**：動態提取演算法邏輯採用 [MIT License](../../packages/app/public/licenses/MotionFlow-MIT.txt) 授權。
* 完整的第三方開源宣告請參閱 [NOTICE.txt](../../packages/app/public/licenses/NOTICE.txt)。
