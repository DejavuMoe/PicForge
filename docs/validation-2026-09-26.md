# 2026-09-26 审查修复与 5C 调度验证

基于 `dd63bd8` 的未提交工作区。未提交、推送、部署或发版；应用版本与 `CACHE_VERSION` 仍为 0.17.0，
正式发布前需按 AGENTS.md 同步提升。历史基线（SAMPLE_VALIDATION、phase 报告）保持不变。

## 范围

| 问题 | 处理 |
| --- | --- |
| HEIC → JPEG 把 Display P3 像素写进无标签 JPEG | 解析主图 `colr`（ICC 矩阵/TRC 或 nclx），在解码 Worker 中转换到 sRGB；LUT 型 RGB ICC 改为嵌入 APP2 |
| `advanced` 跨格式泄漏、预设累积 | 按当前格式白名单归一；预设替换格式/质量/高级选项并保留缩放 |
| 设置导致的错误不随设置恢复；超时自动重跑 | 错误分类 input/settings/runtime/timeout；仅 runtime 自动重试 |
| 第 3 个 Worker 闲置、无选中优先、固定并发 2 | 页面级内存预算 + 编码池大小并发 + 选中优先；Worker 按需创建、大任务后回收、空闲释放 |
| 引擎加载计入转换看门狗 | 加载 300 s 与转换 120 s/300 s 分开计时 |
| SW 自动接管旧页面、引擎缓存随版本清空 | 更新等待用户确认；上一代 app shell 保留一代；引擎按版本单独缓存并迁移 |
| 文件夹拖放无效；`.AAE` 阻塞配对 | drop 事件内同步取 entry；不支持文件单独成行 |
| 推进项 | Apple content identifier 配对与校验、不透明 PNG 直通 OxiPNG、WORKERFS 读取视频、生产 CSP、死代码清理 |

未改变：Android 字节级重建（导出 JPG 仍保留 Motion Photo XMP，这是该约束的直接结果）；
Samsung 等非 Google 容器（MP4 后有非零尾部）的兼容性仍需真实样本；Compat 解码仍在主线程。

## 实测证据

- 真实 OxiPNG WASM：`optimise()` 对 PNG 字节保留 tEXt/tIME/pHYs/eXIf，因此直通前必须由 JS 过滤；
  `optimiseAlpha` 在无法缩小文件时不会生效，因此带透明度的 PNG 继续走 Canvas 路径。
- 样本 `IMG_1539.HEIC` 主图（grid，item 46）关联 Display P3 ICC；由其计算的线性矩阵与公开的
  Display P3 → sRGB 矩阵误差 < 0.002。HEIC 与 MOV 的 content identifier 同为 `F587AE2E-…`。
- 浏览器端到端（WSL Chromium，生产构建，已批准样本）：HEIC 导出与 ImageMagick/LCMS 的 sRGB
  参考图平均差 0.27（24×32 缩略图，8 bit），与未转换版本差 1.45；视频保留 smpte432/bt709/smpte170m 标记。
- 同机对照（含 FFmpeg 加载）：实况照片从开始到完成 HEAD 19.2 s（1 次），本次 20.1 s 与 19.4 s（2 次）；
  24 MP sRGB 转换在 Node 中约 0.15–0.35 s。样本很少，只说明没有可见回退，不作为性能结论。

## 独立复核后的修正

一次只读代码复核（未运行）发现并已修正：保留的旧 app shell 按缓存创建顺序会遮蔽当前版本的固定 URL
（改为先查当前缓存，旧 shell 只保留带哈希的 `/assets/`）；性能 harness 依赖被删除的 `runWithConcurrency`
（已恢复，并加入 harness 类型检查）；“全部取消后在旧解码结束前重试”会让文件停在 pending（改为在旧任务结束后重新调度，
回归测试经变异验证）；FFmpeg 自身 110 s 超时被归为 decode；Worker 创建失败会永久占用槽位；
读取失败的目录项会让整次拖放失败。另为 OxiPNG 拒收的 PNG 直通增加一次 Canvas 回退。
复核提出、按设计保留：切换格式会丢弃其他格式的高级选项；引擎版本升级后，被接管的旧标签页不能再使用已删除的旧引擎；
`CACHE_VERSION` 未提升（见开头）。

## 执行的检查

| 检查 | 环境 | 结果 |
| --- | --- | --- |
| `pnpm lint` | WSL | 0 error，7 个既有 `any` warning |
| `pnpm test` | WSL | 31 个文件、280 项通过（含需 ffprobe 的 AVIF 实测） |
| `pnpm typecheck`、harness `tsc`、`pnpm build`、`verify-site-output` | WSL | 通过 |
| `pnpm test:build` | WSL | 23 项通过 |
| `pnpm test:heif` | Windows（需 `.git`） | 2 项通过；WSL 构建镜像无 `.git`，Git 属性检查无法在其中运行 |
| `browser-check.mjs`（已批准样本） | WSL Chromium | 全部 PASS，含新增 SW 缓存策略、CSP、PNG 直通、HEIC 颜色、视频颜色标记 |
| `PICFORGE_SYNTHETIC_MEDIA=1 browser-check.mjs` | WSL Chromium | 全部 PASS（需 `libheif-plugin-x265`） |
| `ui-check.mjs` layout/interaction/details/controls | WSL Chromium + dev | 通过（复核修正前运行；修正未涉及 UI 布局） |
| `pnpm test:animation` | WSL Chromium + dev | 通过，maxPixelError 0（修正后复跑通过） |

未运行：Firefox/WebKit/真实 Safari、低内存设备、20/50 文件批量压力与性能基准。
