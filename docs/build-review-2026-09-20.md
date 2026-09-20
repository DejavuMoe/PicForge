# 构建、工具链、资源与依赖检查（2026-09-20）

在已有 HEIF 安全修复和静态资源交付方案上进行增量检查。起始 Git HEAD 为
`9232f135030846d94925552813bf4f51ce2c4ee5`，本次及前序修复均仍在工作区，未提交或部署。
覆盖 package/lockfile、pnpm 补丁、Vite/Worker 构建、静态资源、Service Worker、CI、
发布脚本与依赖上游状态。保留历史 Phase 0–4 报告，不把这次检查描述为全部浏览器资格认证。

## 已落实的改动

| 项目 | 原状 | 本次处理 |
| --- | --- | --- |
| CI Node | 24.19.0，本机测试为 24.21.0 | 两条流水线统一 `node:24.21.0-alpine3.24`；核实官方 amd64 镜像存在 |
| 压缩器版本 | 四个 jSquash 包使用 `^`，静态 WASM 独立保存在 Git | 固定当前精确版本；不改变实际编码器版本 |
| JS/WASM 匹配 | HEIF 有校验，五个压缩器 WASM 缺少匹配门槛 | dev/build 和站点输出均与安装包的 WASM 作逐字节比较，失配则失败 |
| 重复资源 | 上游默认 `new URL(...wasm, import.meta.url)` 使 Vite 额外输出五份带哈希的 WASM | 仅在生产构建中，将五个明确的胶水模块默认 URL 指向已校验 `/wasm/` 静态文件；主构建与 Worker 都应用 |
| 测试接入 | 现有性能结果验证器的 22 项 Node 测试未列入普通 CI | 新增 `pnpm test:build`，运行这些测试和 1 项静态编解码器契约测试；不在 CI 跑性能基准 |
| 浏览器资源回归 | 常规 smoke 覆盖部分静态输出 | 加入 JPEG/WebP/PNG/AVIF 实际 Worker 编码、解码尺寸与在线/离线字节一致性检查 |

优化前五份重复 WASM 共 **4,528,413 字节（约 4.53 MB）**。优化后站点文件数从
77 降至 72，总量约 39.40 MB（不含 SHA256SUMS）。这是部署文件体积减少，
不是编码速度提升，也不声称首次加载少下载同样大小：原来的正常编码已通过 locateFile
使用 `/wasm/`，重复文件主要来自未使用的默认 URL 分支。

没有修改像素处理、压缩设置、队列、裁剪、旋转、PTS、并发或取消语义；五个静态压缩器
WASM 与安装包逐字节相同。HEIF 两个原生库的版本、二进制和双版本门槛保持不变。
先修正资源引用，再由构建器自然不生成重复副本，没有删除仍被引用的文件。
上游胶水 URL 结构变化会使测试/构建失败，要求重新审查映射。

## 依赖状态与升级判断

以下 latest 是本日 `pnpm outdated --recursive --format json` 的注册表快照；不代表
每个最新版本都应立即采用。`pnpm audit --json` 为 0 告警，peer dependency 检查通过；
这两个结果不覆盖所有内嵌原生库，也不能代替前序 libheif/libde265 检查。

| 依赖 | 当前 | 注册表最新 | 判断 |
| --- | --- | --- | --- |
| pnpm | 11.8.0（packageManager 固定） | 本次未迁移主版本 | 保留；项目声明选择 11.8.0 |
| Vite | 8.2.2 | 8.3.0 | 保留；现有 WASM/Worker/304 兼容性已验证，本次没有必须升级的证据 |
| TypeScript | 6.0.3 | 7.0.2 | **暂不升级**；当前 typescript-eslint 支持范围仍为 `<6.1.0` |
| ESLint | 9.39.5 | 10.11.0 | **优先后续维护项**：9.x 已 EOL；10.x 要求 Node 22.13+（或 24+），高于项目声明的 22.12 下限。本次保留开发环境兼容契约；升级时同步 engines/文档和编辑器运行时 |
| React / React DOM | 19.2.8 | 19.3.0 | 保留；涉及渲染与交互行为，不把框架升级混进资源优化 |
| React / React DOM types | 19.2.18 / 19.2.7 | 19.3.0 | 与运行时一并评估，不单独追新 |
| i18next / react-i18next | 26.3.1 / 17.0.8 | 26.4.2 / 17.0.14 | 可选维护；升级需覆盖五语言、自动检测、显式偏好和历史导航 |
| JSZip | 3.10.1 | 3.10.2 | 可选小版本维护；上游修复跨 realm 类型检测和 Node 18+ Blob 支持。当前浏览器 ZIP 路径已通过，不作为已确认故障处理 |
| Vitest | 5.0.0 | 5.0.1 | 可选测试工具维护；有 collection/import/mock 修复，当前 226 项正常通过 |
| Playwright | 1.58.2 | 1.63.0 | 建议另做浏览器资格更新；伴随浏览器二进制变化，不能继承旧性能数字当作新结果 |
| Prettier / react-icons | 3.9.6 / 5.6.0 | 3.9.8 / 5.7.0 | 当前无必要升级收益；避免格式/图标的无关变化 |
| @types/node | 22.20.1 | 26.6.2 | 保留与声明的 Node 22 下限相符的类型，不引入 Node 26 API |
| jSquash | AVIF 2.1.1、JPEG 1.6.0、OxiPNG 2.3.0、WebP 1.5.0 | 本次未报告更新 | 精确固定，保留单线程补丁和 WASM 匹配检查 |
| FFmpeg wrapper/core | 0.12.15 / 0.12.10 | 本次未报告更新 | 保留；核心上游构建仍来自 FFmpeg 5.1.4，未来升级必须验证裁剪适配、旋转、逐帧 PTS、音频及离线；原生 ffmpeg 最新版本不等于可用 WASM 发布 |
| wasm-vips | 0.0.18 | 本次未报告更新 | 保留实验资格；生产依然 Compat，不启用新引擎，也不加载额外 HEIF/JXL 模块 |
| libheif / libde265 | 1.23.4 / 1.1.1 | 前序已核实安全版本 | 复用项目内四个已批准静态文件，无需日常编译 |

### 上游依据

- [Node 24.21.0](https://nodejs.org/en/blog/release/v24.21.0)：更新 OpenSSL、证书及 Undici；本机已使用此版本验证。
- [ESLint 支持周期](https://eslint.org/version-support/)：9.x 自 2026-08-06 EOL；[10.x 迁移说明](https://eslint.org/docs/latest/use/migrate-to-10.0.0)列出 Node 下限与配置查找变化。当前已装的 React Hooks/TypeScript ESLint 插件声明兼容 10；剩余问题主要是开发环境契约与迁移验证。
- [typescript-eslint 支持矩阵](https://typescript-eslint.io/users/dependency-versions/)：TypeScript `>=4.8.4 <6.1.0`。
- [Vite 静态资源说明](https://vite.dev/guide/assets)：public 文件使用根绝对路径，构建时原样复制；静态 new URL 会进入资源图。
- [JSZip 变更](https://github.com/Stuk/jszip/blob/main/CHANGES.md)、[Vitest 5.0.1](https://github.com/vitest-dev/vitest/releases/tag/v5.0.1)、[FFmpeg.wasm 发布](https://github.com/ffmpegwasm/ffmpeg.wasm/releases)。

## 构建和发布检查结果

- ESM workspace 引用与 TS 源码导出有效；pnpm 补丁哈希与 lockfile 一致。没有新增 npm 依赖。
- HEIF 静态模块/许可证/清单通过 Git 换行过滤测试。FFmpeg 仍从固定包复制，且准备阶段核实 core 版本必须为 0.12.10，避免升级包却沿用旧 URL/缓存；HEIF 不再编译。
- 压缩器 public WASM、Worker chunk、precache 引用、HEIF 和 FFmpeg 动态路径均验证可用。
  FFmpeg 约 32.23 MB，是产物主体，保持懒加载；不把它加入 app-shell 预缓存。
- 主/应用版本保持 0.17.0；已有待发布 HEIF 缓存 revision 保留。本次不是发布或部署。
- Vite dev/preview 只监听 loopback，COOP/COEP 与 304 中间件保留；无隔离头时单线程编码正常。
- 生产构建未混入 Vips、相机 sample 或临时导出。许可证文件、品牌资产角色和尺寸不变。
- 发布脚本的目录约束、校验和、锁、原子切换、旧流水线拒绝与双版本保留策略保留。
  本机无 Linux Docker/WSL，因此没有执行生产同款容器和 POSIX 发布脚本；源码检查不等于实际部署成功。
- 测试流水线与部署流水线目前分别执行安装/构建。可通过同一次构建的不可变产物交接消除重复，
  但涉及 CI 工作区隔离、产物认证和发布权限；没有在本轮改写成熟发布流程。
- 当前 CI 仅在 master push 时触发，PR 不会自动跑这组检查；是否启用 PR job 应结合 Forgejo 的不可信代码审批/runner 策略另行配置。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| frozen lockfile 安装（不执行安装脚本） | 通过，无包版本漂移 |
| pnpm peers check / audit | 无 peer 冲突；0 个 npm 告警 |
| lint / typecheck | 0 errors，7 个既有 any warnings；三个包类型检查通过 |
| Vitest | 26 文件、226 项通过 |
| test:heif | 2 项通过，包括真实静态文件及 Git 换行字节校验 |
| test:build | 23 项通过：1 项静态 WASM/胶水映射契约 + 22 项已有结果验证器回归 |
| production build / site verification | 通过；72 文件，无五份重复 WASM |
| Chromium 145 生产相机/PWA harness | 通过；JPEG/WebP/PNG/AVIF、动画、Android 原字节重组、HEIC/MOV、逐帧 PTS、取消重试、ZIP、响应式、离线 |
| dev/production 无隔离与 304 | 四格式输出哈希与生产样本一致；静态 304 保留 COEP |

第一次独立 dev 探测遇到 Vite 冷启动依赖优化触发页面重载，导致测试执行上下文丢失。
改为从静态同源文档运行 Worker 探测，排除 HMR 导航干扰后，上述 dev/no-isolation/304
全部通过；没有给产品加重试或吞掉错误。

浏览器证据及生成媒体位于系统临时目录 `picforge-build-review-browser-20260920`，
其中 `static-codecs.json` 保存四种格式的尺寸、字节数与 SHA-256。未重跑与本次变更无关的
大型 Vips 性能矩阵；未声称 Firefox、真实 Safari 或 Linux CI 获得新的实测资格。
