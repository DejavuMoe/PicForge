# 2026-09-20 安全检查与修复

检查起点：`9232f135030846d94925552813bf4f51ce2c4ee5`。修复在当前工作区，未提交、推送或部署。
按项目所有者要求，保留 HEIC 功能，自行编译更新后的 WASM。没有使用 OpenAI 网络安全技能。

## 技能与覆盖范围

使用 [Cloudflare 官方 security-audit-skill](https://github.com/cloudflare/security-audit-skill)，
固定到 `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`，安装于
`.agents/skills/security-audit/`，附上上游 MIT 许可证，未修改技能正文。
本次为 quick 源码检查，包含入口/信任边界梳理、分工检查、独立候选复核和最终覆盖复核。
没有可沿用的同项目历史审计 ledger。

检查覆盖 HEIC 调用链、Android 二进制提取、动画/裁剪解析、部分内存所有权和回退、
DOM/文件名/下载、URL/偏好设置、Service Worker，以及原有依赖构建/发布路径。
没有发现这些已查路径中的有效 XSS、任意媒体上传或 ZIP 路径穿越链路。
这不代表对整个项目或其全部原生依赖作出无漏洞保证。

严格 Cloudflare 审计状态为 **incomplete**：其两个 CLI 校验器在 Windows 上因缺少
`O_NOFOLLOW` 等文件保护能力拒绝读取；没有修改它们来伪造通过。对本次父代理生成的 JSON
调用其导出的内存校验函数，findings 和 coverage ledger 的结构检查均通过。
所有者明确允许普通依赖安装、测试和构建覆盖技能的沙箱/联网安装限制；未运行原生漏洞载荷，
未探测线上部署。正式记录保留 3 条 `needs_validation`、0 条运行影响已经复现的 `confirmed`，
没有给尚未复现的浏览器影响分配严重等级。

最终覆盖 ledger：3 个 covered 单元、2 个 candidate 单元、2 个明确 deferred 单元。
deferred 为共享 Worker/FFmpeg 队列的完整资源生命周期，以及新原生构建流程的完整供应链专章审查。
当前修复已做代码复核、源码哈希校验和功能验证；这些不等于上述完整专项审计。
服务器实际 TLS/CSP、分支保护、CI 主机权限不在此次本地证据范围。

## 已确定的依赖状态与修复

| 项目 | 修复前实测 | 修复后实测 | 处理 |
| --- | --- | --- | --- |
| libheif | 1.23.2 | 1.23.4 | 移除 `libheif-js` npm 包，使用校验源码的自构建 WASM |
| libde265 | 1.0.15 | 1.1.1 | 同时更新 HEVC 后端，启用新版本安全限制接口 |
| Android 解析 | 每个 `ftyp` 候选重新扫描后缀 | 全次调用最多 100,000 次 box 检查 | 保留原字节导出和尾部填充规则 |

原始 npm 包版本不作为原生版本的唯一依据。旧模块的 `heif_get_version()` 返回 1.23.2；
通过旧模块 `_de265_get_version()` 的公开 C 字符串结果核实后端为 1.0.15。
原始 bundle SHA-256 与既有验证记录相符：
`d05292271af008d300cc75be374feb8fd35b418a71420a556c3fb817f662b502`。

libheif 1.23.4 修复了
[iinf 项目数限制绕过及 Emscripten 栈分配问题](https://github.com/strukturag/libheif/security/advisories/GHSA-vg7w-rp49-4fc2)
和 [iref 引用列表/递归检查问题](https://github.com/strukturag/libheif/security/advisories/GHSA-xrp2-63fq-jm8q)。
项目的 `HeifDecoder.decode()` 在 50 MP 检查之前调用这些原生解析路径，因此后置像素上限不能替代上游修复。
独立复核也检查了 1.23.4 源码的计数限制、显式工作列表和 shim 的 vector 分配。

[libde265 1.1.1](https://github.com/strukturag/libde265/releases/tag/v1.1.1)
修复 CVE-2026-54240/54241，之前的
[1.1.0](https://github.com/strukturag/libde265/releases/tag/v1.1.0)
包含更多内存安全修复和安全限制 API。没有沿用 libheif 构建脚本中过时的 1.0.15 默认值。
这些是版本/源码和上游公告证据，不是本项目浏览器代码执行或泄露的复现。

浏览器 Worker 和 WASM 限制了影响范围：用户须主动导入文件；每个 HEIC 使用新 Worker，
有 100 MiB 输入上限、120 秒看门狗及取消/终止清理。没有后端媒体服务。
不能把上游原生进程的崩溃/RCE 描述直接当成本项目的实际后果，也不能因“纯浏览器”忽略解析器缺陷。

## 构建、加载与缓存

- `scripts/build-heif.py` 固定源版本、源码 SHA-256 和 Emscripten 3.1.61；只启用 HEVC 解码，
  关闭动态插件、动态 JS 执行、其他编解码器和 pthread。工具链/中间文件均在临时目录。
- 构建 smoke 和 `heicWorker.ts` 同时核对 libheif/libde265 的实际运行版本，再接收/解析媒体。
- `verify-heif.mjs` 校验版本、关键标志和产物哈希；缺失或不一致时 dev/build 拒绝继续。
  `verify-site-output.mjs` 同时拒绝旧 HEIF 目录。哈希用于检测混用/损坏，不宣称可认证被攻陷的构建主机。
- 模块与 WASM 使用 `/wasm/heif-1.23.4-de265-1.1.1/`，更新 SW 缓存 revision，
  激活时清除旧缓存。加载成功后保持离线转换。
- 按所有者后续明确选择，四个已验证 HEIF 文件作为项目静态资源纳入版本管理；
  Woodpecker 直接复用检出的文件，已移除每次测试/部署中的 Emscripten 编译步骤。
  [构建说明](heif-build.md) 和项目约束已同步。其他临时构建文件、测试导出和截图仍不加入 Git。

## 最终验证

| 检查 | 结果 |
| --- | --- |
| `pnpm lint` | 0 errors；7 个既有 `no-explicit-any` warnings |
| `pnpm typecheck` | app、worker、codecs 全部通过 |
| `pnpm test` | 26 个文件、226 项通过 |
| `pnpm test:heif` | 缺失、旧 libheif、旧 libde265、危险标志及损坏产物拒绝测试通过 |
| `pnpm build` 与站点产物校验 | 通过，77 个文件；无旧 HEIF 产物 |
| Chromium 145 实际浏览器验收 | 通过；沿用 `scripts/browser-check.mjs` 和已批准原片 |
| 运行时版本门槛 | 模拟旧 libheif 或旧 libde265，在构造解码器前拒绝 |
| 开发环境/304/无隔离头 | 新模块和 WASM 初始化通过；304 保留 COEP；无隔离头也可初始化单线程解码器 |
| 旧缓存与离线 | 旧 decoder 缓存清除、离线重载后 HEIC/MOV 转换通过 |
| 原片完整性 | 三个 `sample/README.md` SHA-256 均未改变 |

浏览器测试包含压缩、动画、Android 原字节提取、iOS 配对与转换、裁剪/旋转、逐帧 PTS、
取消/重试、独立下载/ZIP、桌面/手机布局及离线重新转换。本次未新增 Safari/Firefox 资格声明。
Windows 测试环境临时补齐了 ffprobe 9.0.2、ImageMagick 7.1.2-31 和 Playwright Chromium。
首次全套单元测试因缺少 ffprobe 失败，补齐后最终全套通过；没有隐藏失败或跳过该用例。

最终解码器与旧解码器对已批准 `IMG_1539.HEIC` 的输出均为 **4284 × 5712**，
**97,880,832** 个 RGBA 字节；全部字节 SHA-256 相同：
`f3feda1ecdf4012b828cfc146a0c26da62adc1ac7399c5eef77abe322c86e4da`。
这证明该样本的解码像素未改变，不推广为所有相机/颜色空间的完整资格测试。

`pnpm audit --json` 在移除旧 npm 包前返回 0 告警。它未覆盖嵌入 WASM 的这些原生依赖问题，
不能用该结果替代原生版本核实。审计 JSON、架构和详细待验证项保存在本机仓库之外的
`C:/Users/ice/security-audit-skill/PicForge/run-1/`；最终浏览器导出位于系统临时目录
`picforge-security-final-de265-20260920`。
