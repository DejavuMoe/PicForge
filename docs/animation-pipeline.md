# GIF/APNG → 动态 WebP

本实现选择项目已经固定版本的 FFmpeg 单线程 WASM 核心，通过它的 GIF/APNG 解码器与
`libwebp_anim` 编码器处理动画。没有新增依赖、生成第二份 FFmpeg、升级 Vips，或切换静态图默认引擎。
此能力随 0.17.0 发布；根包、应用包与 PWA 缓存版本同步更新。

## 路由与所有权

`Blob → inspectAnimation → createImageProcessor → animationEngine → FFmpeg Worker → WebP`

- 输入按内容识别，不依赖扩展名/MIME。`.apng`、`image/apng` 也能通过导入入口。
- 普通 PNG 在 IDAT 前检查 acTL，静态 WebP 检查头部；不为普通静态输入读取全部压缩数据。
- GIF/APNG 的帧数、画布、循环与时间轴在解码前检查。只缓存原始 Blob 对应的元数据，不缓存展开后的帧。
- 动画路由先于 Compat/Vips 策略。即使调用方指定 Compat，动画也不会进入静态解码；失败后没有静态回退。
- APNG 容器适配、CRC 更新、帧解码、处置、合成、缩放、编码与输出时间轴校验都在 FFmpeg Worker 内完成，不向 React/主线程发送 RGBA 帧数组。
- 保留原始 Blob 作为重试源。每个任务拥有一个直接加载固定 FFmpeg core 的专用 Worker，结束/取消后终止；复用 HTTP/WASM 编译缓存，
  不以常驻大堆换取启动时间。源数据、MEMFS、编码缓冲和最终输出仍有内存成本，并非零拷贝或恒定内存。
- 动画和 Live Photo 视频使用同一个 `runInFFmpegLane`，每个应用页面同时最多运行一个 FFmpeg 任务。
  被取消的排队任务立即返回；释放通道必须等待正在运行的任务完成清理。原有 Compat 限流仍有效。

## 媒体语义

- GIF 的 Netscape 重复次数转换为总播放次数；APNG 的 num_plays 直接映射。内部 0 表示无限循环。
- 读取 APNG 的分数延时，累计后量化为毫秒，避免逐帧舍入漂移。FFmpeg 使用 passthrough 和 1:1000 编码时间基准，
  不强制 30 fps。零时长采用明确的 100 ms；无法以至少 1 ms 表达的时间轴拒绝转换。
- 固定核心的 libwebp_anim 会估算末帧时长。`finishWebpTimeline` 先检查此前帧边界与源时间轴一致
  （允许等价帧合并和至多 1 ms 的时间基量化误差），再以源总时长确定末帧。
- 完全相同的帧可能被 libwebp 合并成静态 WebP。只重新封装成单帧动画，保存播放次数与总时长，不再次编码像素。
- GIF/APNG 的局部帧、透明混合、BACKGROUND/PREVIOUS 处置由解码器处理；输出容器明确使用透明背景。
- 固定核心不接受“独立封面 + 局部首帧”的 APNG。容器适配器将已有封面临时标记为 1 ms、BACKGROUND 处置的
  初始化帧，调整帧数、序号与 CRC；过滤器丢弃它并重置 PTS。封面适配自身只改容器，不把封面混入动画。
  只有未来核心通过同一局部首帧用例后才能移除适配器。
- RGB APNG 的透明清除，以及灰度/索引色等非 RGBA 路径，需要先用同一核心的 PNG 解码/编码器把各局部帧
  无损提升为 RGBA，再合成动画，避免解码器把透明区变成不透明黑色。普通无需透明处置的 RGB 和 RGBA 不做这次提升。
  此兼容路径会增加处理成本；逐帧清理临时文件，只累积有 100 MiB 上限的压缩块，绝不保存全部 RGBA 帧。

- 复用 `calculateResizeGeometry`，保持 contain 不放大、cover 居中裁切、stretch 精确尺寸。
  在完整合成帧上裁切/缩放；缩放时用 16 位预乘 alpha，随后反预乘，避免透明边缘黑晕和低 alpha 的 8 位量化损失。
- 原尺寸无损输出保持可见的解码像素；透明像素下的隐藏 RGB 不是保留目标。缩放本身会改变像素。
  去掉非必要源元数据；带未支持色彩描述的动画不会被简单改标为 sRGB。

## 产品范围与限制

- 本阶段支持 GIF/APNG 输入、动态 WebP 输出，包含质量、无损、压缩方法和已有缩放设置。
- JPEG、当前 PNG/AVIF 编码器属于静态路径；对动画选择这些格式时显示明确错误，不导出单帧替代文件。
  改成 WebP 后自动恢复处理。其他无法由参数纠正的错误及用户取消不会因全局编辑被自动重试。
- 动态 WebP 输入、GIF 纯文本/交互帧、16 位 APNG、ICC/非标准色彩描述、非默认且未映射的 WebP 高级选项
  暂不支持，显示对应错误。没有新增“提取第一帧”模式。
- 当前边界：动画源文件 50 MiB，单帧源/目标各 8 MP，每边最多 16,383，最多 2,000 帧、10 分钟、65,535 次总播放；
  源帧与目标帧各自累计不超过 5 亿像素。输出最多 100 MiB；执行约 110 秒内部超时、120 秒任务 watchdog。
  这些是拒绝边界，不是所有上限组合都已在所有设备上通过性能资格验证的承诺。
- 动画沿用原生图片预览；原图/结果的播放时钟独立，不提供同步逐帧比较器。
- WASM 仍从现有 `/wasm/ffmpeg-0.12.10/` 懒加载，约 30.7 MiB 未压缩 WASM。
  第一次加载成本存在；成功缓存后支持离线。沿用现有 FFmpeg 许可与源码分发要求。

## 为什么选择此方案

- **现有 FFmpeg**：实际构建包含 GIF/APNG 解码和 libwebp_anim；两种输入共享完整帧语义与编码路径，
  单线程核心不要求 SharedArrayBuffer/隔离头；无需新建源码编译供应链。
- **现有 Vips**：全页 GIF → WebP 可以运行，但固定构建的 PNG loader 没有 `n` 多帧选项，不能作为统一 APNG 方案。
  生产静态 Vips 的既有资格边界保持不变。
- **ImageDecoder**：本机 Chromium/Firefox 均暴露该 API，但它不能代替动画 WebP 编码器。
  原生解码加新编码核心会引入另一套帧桥接、构建和资格验证；本阶段不增加这条路径。
- **wasm-webp 0.1.0 候选封装**：公开接口接收所有帧数组，源码没有显式提交最终结束时间，且配置映射有限，
  不满足本项目的资源和时序契约，因此未安装。

未来只有在实测证明首载字节或固定核心内存成为主要瓶颈时，才替换动画引擎为精简的
GIF/APNG + libwebp WASM 构建；保留上述 Blob、时间轴、取消、设置和输出验证契约。

## 验证入口

先运行 `pnpm dev`，然后：

```sh
pnpm test:animation
PICFORGE_BROWSER=firefox pnpm test:animation
pnpm benchmark:animation
```

默认连接 `http://127.0.0.1:5173`，可用 `PICFORGE_QA_URL` 指定实际开发端口。
动画语义脚本使用浏览器 ImageDecoder 独立校验 WebP 像素，并需要 ImageMagick 和原生 FFmpeg 生成 GIF，性能脚本还需要 Linux `ps`；全部合成输入/导出写入临时目录。
`PICFORGE_QA_OUTPUT` 可指定语义测试产物目录。性能采集必须单独运行，不与重型测试并行。

`pnpm test:browser` 包含真实生产页面的格式纠正、多帧下载、手机 ZIP、离线重载和再次转换。
更改共享 FFmpeg 通道时加跑 `PICFORGE_SYNTHETIC_MEDIA=1 node scripts/browser-check.mjs`（复用刚构建的产物），
验证 Motion/Live Photo 的取消/重试、逐帧时间、配对与下载。

现有单测涵盖容器边界、时间轴、无静态回退、设置映射、队列取消和错误恢复。
本次 Chromium/Firefox 证据不能替代真实 Safari/iOS 资格验证；本机 Playwright WebKit 缺少系统运行库。

## 上游依据

- [PNG/APNG 标准](https://www.w3.org/TR/png-3/)
- [libwebp 动画编码 API](https://chromium.googlesource.com/webm/libwebp/+/refs/heads/main/src/webp/mux.h)
- [libvips 多页与动画](https://www.libvips.org/API/8.17/multipage-and-animated-images.html)
- [FFmpeg APNG 解复用器](https://ffmpeg.org/doxygen/trunk/apngdec_8c_source.html)
- [WebCodecs 标准](https://www.w3.org/TR/webcodecs/)
- [未采用封装的源代码](https://github.com/nieyuyao/webp-wasm/blob/main/webp/encode.cpp)
