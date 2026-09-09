# PicForge

在浏览器里处理图片的开源工具箱：压缩与缩放图片、拆分 Android 动态照片、把 iOS 实况照片转成 JPEG 和 MP4。文件始终留在你的设备上。

[打开 PicForge](https://picforge.de) · [English](../../README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

## 选择工具

| 工具 | 输入 | 输出 |
| --- | --- | --- |
| 图片压缩 | JPEG、PNG、WebP、AVIF 等支持的图片 | JPEG、WebP、PNG 或 AVIF，可批量调整尺寸 |
| Android 动态照片 | 带有附加视频的原始 JPG 动态照片 | 原始 JPG + MP4，不重新编码 |
| iOS 实况照片 | HEIC/HEIF + MOV 原片，也可单独处理照片或视频 | JPEG + H.264 MP4，可保留音频 |

不需要注册、安装或上传。应用会下载自身的静态资源和处理引擎，媒体处理完全在浏览器本地内存中完成，没有遥测。

## 使用方法

1. 在首页选择工具，也可以点击 **试试这张图片**，将非私人生成示例导入真实压缩流程。
2. 添加文件。图片压缩支持拖放和粘贴；实况照片请同时导入同名照片与视频。
3. 调整设置。图片自动处理；动态照片和实况照片由你点击批次操作开始。
4. 对比原图与结果，缩放检查细节，下载单个文件或全部已完成结果。批量 ZIP 包含清单。

**设置范围。**「全部图片」调整共享设置；「仅此图片」创建完整的独立设置。修改全局设置不会覆盖单图设置，点击「使用全局」才能重新跟随。

**调整尺寸。**「适应边界」保持比例且不放大；「居中裁切」填满指定尺寸；「拉伸」使用精确宽高。百分比缩放在高级设置中。数字输入按 Enter 或移开焦点后应用，Escape 取消本次输入。PNG 是无损压缩，不受质量滑块影响。

**队列与导航。** 切换工具、返回首页和使用浏览器前进／后退，都会保留当前会话的队列。刷新或关闭页面会清除文件和结果，请先下载。手机上点击文件进入预览，返回文件列表的按钮位于预览顶部；设置在图片下方，批次操作始终可达。

## 能力边界

- Android 提取保留原始字节。视频能否预览取决于内嵌编码；无法播放时仍可下载。
- iOS 通过文件名配对，不验证 Apple 资源标识。重名文件需要处理。输出面向分享，不是保留 HEIC 元数据、HDR 和辅助图像的归档。
- 视频默认保留原始时间戳，也可明确选择 30 fps。当前 FFmpeg 使用专门的适配处理显示裁切和旋转。
- Worker 并发、文件大小和像素数受到限制，超大文件可能被拒绝。取消和重试保留原文件作为处理来源。
- 离线使用需要先缓存应用资源；大型转换引擎只有成功加载并缓存后才能离线工作，首次转换可能需要联网。
- 默认跟随浏览器语言，未支持的语言回退为英语。明确选择的语言与主题保存在本地；禁用存储时仍可在当前访问中切换。支持中、英、日、韩五种语言资源及明暗主题。

## 本地开发

需要 Node.js **≥22.12.0** 和 pnpm **11.8.x**。

```sh
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173`。使用 `pnpm build` 构建，`pnpm preview` 预览。编解码资源由项目准备并托管在 `/wasm/`，不需要处理服务器或 API 密钥。

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# 保持开发服务器运行，检查界面与交互
PICFORGE_UI_GROUPS=entry,layout,interaction,usability node scripts/ui-check.mjs
# 生产构建的压缩与离线检查
pnpm test:browser
```

UI 检查支持 `PICFORGE_UI_BROWSER=chromium|firefox|webkit`，证据输出至临时目录。媒体验收另需 `ffprobe`；合成转换样本另需 `heif-enc` 和 `ffmpeg`。请勿提交私人相机样本。

生产压缩仍使用 `@jsquash/*` 兼容引擎；wasm-vips 保持实验状态。界面使用 React、原生 HTML/CSS，转换引擎和 ZIP 库按需要加载。参见 [界面设计与验证](../UI_DESIGN.md)、[QA 清单](../QA_CHECKLIST.md)、[历史媒体验证](../SAMPLE_VALIDATION.md) 和 [下一步计划](../next-steps-plan.md)。Playwright WebKit 检查不等于真实 Safari／iPhone 认证，不应跨机器比较性能数据。

## 开源许可

应用代码采用 [MIT](../../LICENSE)。FFmpeg 为 GPL、libheif 为 LGPL，媒体组件不会因应用使用 MIT 而改变许可。完整说明见 [NOTICE.txt](../../packages/app/public/licenses/NOTICE.txt)；公开分发二进制前需履行对应源码义务。MotionFlow 和历史视觉组件的许可文件均保留。
