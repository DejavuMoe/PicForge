# 性能与处理回归

本页说明当前测量入口、参数和判定契约，不保存单次运行结果。处理架构见
[架构](../architecture.md)，媒体、离线和发布检查见[验证](../validation.md)。
生产压缩使用 Compat；基准中的 Vips 策略只用于实验，不会切换应用默认引擎。

## 运行入口

| 入口 | 范围 |
| --- | --- |
| `PICFORGE_BENCH_LAYER=legacy pnpm benchmark` | `decodeImage → resizeImage → WorkerPool` 的分阶段诊断，调用当前共享函数；不能代表应用端到端耗时。未指定 layer 时使用此入口。 |
| `PICFORGE_BENCH_LAYER=engine pnpm benchmark` | 应用源图预检与真实 Compat/Vips/animation 引擎，记录请求/实际引擎、尝试、回退、阶段与 Long Tasks。 |
| `PICFORGE_BENCH_LAYER=codec pnpm benchmark` | 通过共享 `encodeImage` 调用真实 WASM，检查 JPEG/WebP/AVIF/OxiPNG 的缓冲区视图、输入不变性、连续编码稳定性和解码结果。 |
| `node scripts/performance/application.mjs` | 生产页面中的首页样例、48 MP 导入→取消→重试、双文件导入和下载尺寸。复用 `packages/app/dist`，源码改变后须重新构建。 |

`pnpm benchmark` 先检查 harness 的 TypeScript，再构建独立临时站点。
application 入口需要原生 `ffmpeg` 生成临时图片；缺失时必需检查被标记为
`BLOCKED`，整个运行不能通过。两者都使用已安装的 Playwright 浏览器及系统库。

Windows 是源代码与 Git 的唯一工作区，Linux 构建/浏览器测量通过 `linux-task.ps1`
运行，不并发占用同一项目的 build mirror。例如在仓库根目录执行：

```powershell
$sourceRevision = git rev-parse HEAD
linux-task.ps1 -Mode build -Project (Get-Location).Path -Command "PICFORGE_BENCH_REVISION=$sourceRevision PICFORGE_BENCH_LAYER=engine PICFORGE_BENCH_CASES=S01,S02,S03,S04,S05,S06 pnpm benchmark"
```

mirror 没有 `.git`，必须传入 Windows 源版本；存在未提交改动时另行记录 diff 和
新增输入文件，不能把 HEAD 当作实际测量源码的完整身份。application 报告不自动记录
源码版本，应随结果记录构建的源版本及改动。

以下为可交给同一 runner 的 Linux 命令；benchmark 命令仍需设置源版本：

```bash
node --test scripts/performance/validate.test.mjs
PICFORGE_BENCH_LAYER=codec pnpm benchmark
PICFORGE_BENCH_LAYER=engine PICFORGE_BENCH_CASES=C01-o1,C01-o3,C01-o6,C01-o8,C02-contain,C02-cover,C02-stretch,C02-percentage,S08-cancel pnpm benchmark
# 已提供外部 sRGB、Display P3 ICC 文件时：
PICFORGE_BENCH_LAYER=engine PICFORGE_BENCH_CASES=C05-srgb-icc,C05-p3-icc pnpm benchmark
# 没有可复用的当前构建时先执行 pnpm build：
node scripts/performance/application.mjs
```

## 参数

| 变量 | 值与默认值 | 适用范围 |
| --- | --- | --- |
| `PICFORGE_BENCH_LAYER` | `legacy`（默认）、`engine`、`codec` | `run.mjs`；不接受 `application`。 |
| `PICFORGE_BENCH_CASES` | 逗号分隔的用例 ID；默认当前层全部用例 | 未知 ID 或当前层零用例时报错；属于其他层的 ID 记录为 `skipped`。 |
| `PICFORGE_BENCH_ENGINE` | `compat`（默认）、`auto`、`vips` | engine 执行策略；动画自行路由，`S08-cancel` 固定使用 Compat。 |
| `PICFORGE_BENCH_REPEATS` | 1–20，默认 3 | 两个入口均运行 `repeats + 1` 次；温度含义见下文。 |
| `PICFORGE_BROWSER` | `chromium`（默认）、`firefox`、`webkit` | 两个入口。 |
| `PICFORGE_BROWSER_EXECUTABLE` | 自定义浏览器路径 | 仅 `run.mjs`。 |
| `PICFORGE_BENCH_OUTPUT` | 结果目录；默认新建系统临时目录 | 两个入口；保留 raw JSON、临时样本、截图和导出，不放入仓库。 |
| `PICFORGE_BENCH_REVISION` | 源 commit；默认 `git rev-parse HEAD` | 仅 `run.mjs`；没有 `.git` 时必须提供。 |
| `PICFORGE_BENCH_VIPS_PROBE` | `1` 启用，默认关闭 | engine 层额外运行 S02 Vips 可用性探针，不改变选定用例列表。 |
| `PICFORGE_BENCH_FORCE_VIPS_FAIL` | `1` 启用，默认关闭 | engine 层额外注入一次 Vips 运行时故障，检查实际引擎和回退记录；不作为性能样本。 |
| `PICFORGE_SRGB_PROFILE` | 外部 sRGB ICC 路径 | `run.mjs`；未设置时检查脚本声明的已安装路径。 |
| `PICFORGE_P3_PROFILE` | 外部 Display P3 ICC 路径 | `run.mjs`；无默认文件。 |

选中色彩用例但缺少对应 ICC 时，该用例为 `BLOCKED`，整个运行失败。
只有选中色彩用例时才需要 ImageMagick 生成带 ICC 的样本和独立参考像素。
原始媒体输入使用[已批准样本](../../sample/README.md)，不得改写原文件或复制到站点资源中。

## 用例选择

| engine 用例 | 检查内容 |
| --- | --- |
| `S01` | 12 MP JPEG，原尺寸 JPEG 输出。 |
| `S02`、`S03` | 24/48 MP JPEG，contain 到最长边 1920，JPEG 输出。 |
| `S04`、`S05` | 24 MP JPEG / 透明 PNG，contain 到最长边 1920，WebP 输出。 |
| `S06` | S01–S05 的批量任务，采用实际 `getMainPipelineConcurrency()`。 |
| `A01` | 动画 GIF → WebP，必须选中 animation 引擎。 |
| `C01-o1/o3/o6/o8` | EXIF 方向与尺寸。 |
| `C02-contain/cover/stretch/percentage` | 四种缩放设置。 |
| `C03-avif/oxipng` | AVIF、OxiPNG 输出。 |
| `C04-svg/bmp/gif-static/avif-input` | SVG、BMP、静态 GIF、AVIF 输入。 |
| `C05-srgb-icc`、`C05-p3-icc` | 带 ICC 的 128×96 PNG 色块 → 64×48，与独立 sRGB 参考比较。 |
| `S08-corrupt`、`S08-cancel`、`S08-target` | 损坏输入、两条解码路径的取消/清理/重试、超限目标拒绝。 |

斜线写法表示分别选择完整 ID，如 `C02-contain,C02-cover`；不能把斜线传入变量。
codec 层只有 `codec-view`，覆盖完整视图、非零偏移、零偏移短视图，以及运行时支持的
SharedArrayBuffer 和 resizable ArrayBuffer。缺少 SharedArrayBuffer 会阻断 codec 运行。

legacy 层的 ID 定义在 [`run.mjs`](../../scripts/performance/run.mjs) 的 `legacyCases`：
`jpeg-12mp/24mp/48mp/60mp`、`png-photo`、`png-alpha-mozjpeg/webp/avif/oxipng`、
`png-screenshot`、`webp-static`、`exif-1/3/6/8`、`resize-contain/cover/stretch/percentage`、
`tiny`、`wide`、`tall`。60 MP 是安全拒绝用例，不得绕过像素限制获得耗时数字。

## 判定契约

[`validate.mjs`](../../scripts/performance/validate.mjs) 检查准确的样本数量与 iteration、
尺寸/方向、输出哈希、实际引擎、批次任务完整性、颜色及有限数值指标。
[`validate.test.mjs`](../../scripts/performance/validate.test.mjs) 检查这些门槛本身，
也由 `pnpm test:build` 执行。失败先写结果，再以非零退出，不能输出整体 `PASS`。

- `S08-corrupt` 必须在预检以 `Error: Failed to read image dimensions` 失败，没有引擎尝试、实际引擎或回退。
- `S08-target` 必须以 `target: pixel limit` 拒绝，没有引擎尝试。
- 当前 `S08-cancel` 分别触发 Worker 解码和主线程图片加载取消：检查 `AbortError`、Worker 终止且队列/活动任务为空、图片监听器/URL 清理，以及同一个原始 Blob 成功重试。不支持 Worker 解码时显式记录该能力缺失。
- 色彩参考由 ImageMagick/LittleCMS 对实际带标记输入转换到 sRGB 后缩放；保存输入、ICC、参考像素哈希和工具版本。RGB/合成误差要求 MAE < 12，alpha MAE < 3，固定色块中心每通道最大误差 < 12。Firefox 测试显式使用 tagged-media 色彩管理、相对色度意图和所选 sRGB 显示配置，并写入报告；这些设置只作用于测试浏览器。
- application 检查页面错误、取消后无迟到结果、重试只发布一个结果，以及两个下载文件分别为 1600×1200、800×600；报告中的期望值和下载值都须匹配固定用例。

## 测量与结论边界

engine/legacy 每例第 0 次标记 `cold-worker`，后续为同池 warm 样本；这不等于清空
HTTP、浏览器或操作系统缓存。application 每次新建 context/page，全部标记
`fresh-context`，不计算 warm 中位数。它禁用 service worker，不能证明离线行为。

application 用页面 `performance.now()` 标记起点、首个结果和完成，完成时间在
observer drain 前固定；Long Tasks 按测量窗口重叠计入，未支持时为 `null`。
Node 墙钟耗时是独立字段，不与页面指标混合。这些入口不采集进程 RSS/PSS。

比较时固定主机、浏览器版本、输入字节/哈希、设置、色彩管理、隔离和缓存条件，
记录源版本、未提交差异、实际引擎、回退、耗时、输出体积与质量。不同层、不同主机
或不同测量窗口不能直接算提升比例；基准采集不与重型测试并行。合成图不能替代
真实照片画质检查，SSIM/PSNR 也应结合参考缩放算法、相同体积与视觉结果解释。

原始 Blob/File 是回退与重试来源；不能用已 detached 的缓冲区。取消、超时、过期任务
和安全拒绝不得伪装为可回退运行失败。优化必须保留尺寸、裁切/方向、ICC/颜色、alpha、
元数据清理和全局/单图设置语义；显式数组减少不代表浏览器完整解码位图消失。

Vips 必须满足实际应用性能与集成要求才可改变默认范围；初始化成功和故障熔断不能
发现“成功但慢”。保留单一 Vips 任务通道、六 pthread 配置和 AVIF/OxiPNG 单线程补丁。
任务结束或 Worker 消失不能证明 CPU/RSS 已立即回落。Playwright WebKit 不代表真实
Safari，硬件编解码质量、设备播放和资源回收仍需对应设备验证。
