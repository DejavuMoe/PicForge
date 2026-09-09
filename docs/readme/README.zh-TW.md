# PicForge

在瀏覽器裡處理圖片的開源工具箱：壓縮與縮放圖片、拆分 Android 動態相片、將 iOS 原況照片轉成 JPEG 和 MP4。檔案始終留在你的裝置上。

[開啟 PicForge](https://picforge.de) · [English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

## 選擇工具

| 工具 | 輸入 | 輸出 |
| --- | --- | --- |
| 圖片壓縮 | JPEG、PNG、WebP、AVIF 等支援的圖片 | JPEG、WebP、PNG 或 AVIF，可批次調整尺寸 |
| Android 動態相片 | 帶有附加影片的原始 JPG | 原始 JPG + MP4，不重新編碼 |
| iOS 原況照片 | HEIC/HEIF + MOV 原片，也可單獨處理照片或影片 | JPEG + H.264 MP4，可保留音訊 |

免註冊、免安裝、不上傳，沒有遙測。應用程式會下載自身的靜態資源與處理引擎；媒體處理全部在瀏覽器本機記憶體中完成。

## 使用方式

1. 在首頁選擇工具，或點擊 **使用範例**，將非私人生成範例送入真正的壓縮流程。
2. 加入檔案。圖片壓縮支援拖放與貼上；原況照片請同時匯入同名照片與影片。
3. 調整設定。圖片自動處理；動態相片與原況照片由你點擊批次操作開始。
4. 比較原圖與結果，縮放查看細節，再下載單一檔案或全部完成的結果。批次 ZIP 含有清單。

**設定範圍。** 全部圖片共用設定；僅此圖片建立完整的獨立設定。全域修改不會覆蓋自訂圖片，需明確選擇使用全域才能重新跟隨。

**尺寸。** 適應邊界保持比例且不放大；居中裁切填滿指定尺寸；拉伸使用精確寬高。百分比縮放位於進階設定。數字欄位按 Enter 或離開欄位後套用，Escape 取消輸入。PNG 為無損壓縮，不受品質滑桿影響。

**佇列。** 切換工具、回首頁和瀏覽器上一頁／下一頁會保留本次工作階段的佇列。重新整理或關閉頁面會清除檔案與結果，請先下載。手機點選檔案進入預覽；設定接在圖片下方，批次操作保持可用。

## 能力範圍

- Android 擷取保留原始位元組。影片能否預覽取決於內嵌編碼，無法播放仍可下載。
- iOS 依檔名配對，不驗證 Apple 資源識別碼。重名需要處理。輸出用於分享，並非保存 HEIC 中繼資料、HDR 與輔助圖像的封存檔。
- 影片預設保留原始時間戳，也可選擇 30 fps。目前 FFmpeg 搭配顯示裁切與旋轉適配器。
- Worker 並行數、檔案大小與像素數有限制；超大檔案可能被拒絕。取消與重試保留原始檔案。
- 離線使用需先快取應用資源。大型轉換引擎必須成功載入與快取後才能離線使用，首次轉換可能需要連線。
- 預設跟隨瀏覽器語言，以英語為後備。明確選擇的語言與主題儲存在本機，停用儲存時仍可在本次造訪中切換。支援五種語言資源及明暗主題。

## 本機開發

需要 Node.js **≥22.12.0** 與 pnpm **11.8.x**。

```sh
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge
pnpm install
pnpm dev
```

開啟 `http://127.0.0.1:5173`。`pnpm build` 建置，`pnpm preview` 預覽。編解碼器由專案自行託管在 `/wasm/`，不需要媒體處理伺服器或 API 金鑰。

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# 開發伺服器執行時檢查介面
PICFORGE_UI_GROUPS=entry,layout,interaction,usability node scripts/ui-check.mjs
pnpm test:browser
```

UI 檢查可設定 `PICFORGE_UI_BROWSER=chromium|firefox|webkit`，證據寫入暫存目錄。媒體驗收另需 `ffprobe`，合成轉換樣本另需 `heif-enc` 與 `ffmpeg`。請勿提交私人相機檔案。

正式壓縮路徑保留 `@jsquash/*` 相容引擎，wasm-vips 仍為實驗。介面使用 React 與原生 HTML/CSS，轉換引擎和 ZIP 程式庫按需要載入。參見 [介面與驗證](../UI_DESIGN.md)、[QA 清單](../QA_CHECKLIST.md)、[歷史媒體證據](../SAMPLE_VALIDATION.md) 與 [下一步](../next-steps-plan.md)。Playwright WebKit 不等於真實 Safari／iPhone 驗證；請勿跨主機比較效能數字。

## 授權

應用程式碼採 [MIT](../../LICENSE)。FFmpeg 為 GPL，libheif 為 LGPL，不因應用程式的 MIT 授權而改變。完整資訊見 [NOTICE.txt](../../packages/app/public/licenses/NOTICE.txt)。公開散布二進位檔前需履行對應原始碼義務；MotionFlow 與歷史視覺元件的授權檔案均保留。
