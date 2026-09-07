<h1 align="center">PicForge</h1>

<p align="center">
  <strong>基于 WebAssembly 的高性能纯前端图像与动态媒体处理工具箱</strong><br>
  100% 浏览器本地运算 · 零文件上传 · 零遥测跟踪 · 零后端依赖
</p>

<p align="center">
  <a href="https://picforge.de"><strong>在线演示：picforge.de</strong></a>
</p>

<p align="center">
  <strong>语言 / Language:</strong> <a href="../../README.md">English</a> | 简体中文 | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a>
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

**PicForge** 是一款本地优先（Local-first）的开源浏览器媒体工具箱，专为高通量批量图片压缩、Android 动态照片提取以及跨平台 iOS 实况照片转码设计。

与传统依赖云端服务的转换工具不同，PicForge 的所有解码、处理与编码管线均在客户端 Web Worker 与 WebAssembly 运行时中执行。用户的照片与视频资产完全停留在本地设备内存中，不向任何远程服务器发送请求。

<p align="center">
  <img src="../assets/picforge-workspace.jpg" alt="PicForge 工作区" width="100%" />
</p>

---

## 核心功能

### ⚡ 1. 批量图片压缩
* **WebAssembly 编解码套件**：集成 `@jsquash/*` 编译的 WebAssembly 原生编解码器：
  * **MozJPEG**：感知量化与渐进式扫描优化。
  * **WebP**：支持有损与无损压缩，自动探测并启用 SIMD 指令加速。
  * **OxiPNG**：无损多通道 PNG 深度体积优化。
  * **AVIF**：现代化高压缩比编码，适配 0–100 线性质量映射与色度抽样控制（`4:4:4` 与 `4:2:0`）。
* **自适应尺寸调整**：提供三种保持比例约束的缩放模式：
  * `contain`（包含）：按比例缩放至边界内，杜绝画质放大失真。
  * `cover`（覆盖）：以中心对齐裁剪填充至目标尺寸。
  * `stretch`（拉伸）：强制拉伸至指定的绝对宽高。
* **分级配置架构**：支持全局批量预设参数，并允许为队列中任意单张图片设置完整的独立配置快照，该快照在全局参数变动时不会被覆盖。
* **实时画质比对**：
  * 基于视口图层裁剪（Viewport-layer clip）的实时双向分割对比滑块。
  * 并排比对与单图模式，支持 2× 缩放和画布拖拽平移检验细节。
* **并发控制与安全性**：
  * 具备并发上限的 Web Worker 任务池调度机制。
  * 基于 `AbortController` 与 `taskEpoch` 序列号的任务取消机制，防止过期 Worker 回调引发脏写。
  * 经过防路径穿越转义的 ZIP 批量导出，附带机器可读的完整配置元数据清单（`picforge-manifest.json`）。

### 📱 2. Android 动态照片提取
* **二进制解析引擎**：直接扫描 JPEG 文件的二进制标记与结构，定位内嵌的 MP4 微视频流起始偏移。
* **完全无损与字节一致**：直接分离原始静态 JPEG 图像与内嵌 MP4 视频，不经过二次解码与重新编码，导出的字节流与原文件完全一致。
* **瞬时处理吞吐**：免去编解码计算开销，仅受限于客户端本地磁盘与内存 I/O。
* **批量提取**：支持多文件拖拽排队、提取进度反馈以及一键 ZIP 打包导出。

### 🍏 3. iOS 实况照片转换
* **启发式基名配对**：支持多文件混合导入，按不区分大小写的目录结构与文件基名（Basename）自动将 `.HEIC` 静态图与 `.MOV` 视频轨关联配对。
* **QuickTime Clean Aperture（`clap`）解析适配器**：解析 QuickTime Atom 元数据树中的有效孔径参数，在自动旋转与导出前校正裁剪范围，避免黑边及栅格缝隙。
* **纯前端转码管线**：
  * **HEIC → MozJPEG**：通过 `libheif-js` 解码 HEIF 高效图像并重新压缩为高质量 JPEG。
  * **MOV → H.264 / AAC**：在浏览器单线程 WebAssembly FFmpeg 环境中将视频流转码为高兼容性的标准 MP4。
* **逐帧精准 PTS 保留**：默认严格保留原始显示时间戳（PTS），防止帧率重采样导致的抖动或顿挫，并提供 30 fps 标准化重采样选项。
* **转码预设档位**：
  * **Balanced（平衡）**：CRF 23，长边 ≤ 1920px，MozJPEG 质量 85（推荐默认）。
  * **Quality（高画质）**：CRF 20，长边 ≤ 1920px，MozJPEG 质量 90。
  * **Compact（高压缩）**：CRF 26，长边 ≤ 1280px，MozJPEG 质量 75。
* **非兼容环境优雅降级**：当宿主浏览器环境缺失特定视频解码支持时，自动回退至静态画面展示并保留正常文件导出与下载功能。

---

## 架构与隐私准则

* **100% 本地运算与隐私安全**：无数据埋点、无用户跟踪、无 Cookie、无远程文件上传。全部计算与内存占用均局限在当前浏览器标签页内。
* **WASM 引擎按需惰性加载**：体积较大的 WebAssembly 运行时（如 FFmpeg 与 libheif）仅在用户实际进入相应工作区时按需加载，减轻首次进入开销。
* **完整 PWA 离线支持**：内置 Service Worker，在构建时自动生成静态资源预缓存清单（`precache.json`）。首访缓存完成后，应用在完全断网环境下即可离线启动并运行。
* **内存生命周期管理**：显式跟踪并释放生成的 Object URL 与二进制 ArrayBuffer，防止长时间大批量任务导致的浏览器内存泄漏。
* **多语言支持**：内置 `i18next` 方案，无缝切换 5 种语言界面：
  * 英语 (`en`)
  * 简体中文 (`zh-CN`)
  * 繁體中文 (`zh-TW`)
  * 日语 (`ja`)
  * 韩语 (`ko`)
* **现代化自适应界面**：基于 CSS 变量与设计令牌构建的毛玻璃风格界面，适配 Geist 字体、动态 Canvas 粒子背景、任务完成彩带动效以及系统深浅色主题切换。

---

## 性能与验收基准

在官方标准验收样本（Chromium / Linux x86_64）上的实测转码数据：

| 媒体流 | 原始输入 | 导出输出 | 输出分辨率 | 体积变化率 | 结构相似性 (SSIM) |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **iOS 照片** | 2.33 MB HEIC | 2.01 MB MozJPEG (Q85) | 4284 × 5712 | **-13.8%** | **0.9898** |
| **iOS 视频** | 2.89 MB MOV | 0.94 MB H.264 MP4 | 1308 × 1744 | **-67.4%** | **0.9821** |
| **Android 动态照片** | 9.35 MB JPG | 字节一致的 JPG + MP4 | 原始尺寸 | 无损 | **1.0000** |

*详细的时间戳对齐验证、SSIM 测试脚本与跨浏览器表现参见 [docs/SAMPLE_VALIDATION.md](../SAMPLE_VALIDATION.md)。*

---

## Monorepo 代码结构

PicForge 采用基于 `pnpm` 管理的模块化 TypeScript Monorepo 架构：

```text
PicForge/
├── docs/                       # QA 检查清单、验证基准与多语言文档
├── packages/
│   ├── app/                    # React 18 + Vite 客户端应用、Zustand 状态与 UI 工作区
│   │   ├── public/             # PWA Manifest、Service Worker、字体及 vendor 级 WASM 资产
│   │   └── src/
│   │       ├── components/     # UI 视图组件（DropZone、Preview、FileList、Settings 等）
│   │       ├── hooks/          # autoCompressController 与 Worker 任务池控制器
│   │       ├── landing/        # Canvas 交互粒子背景与落地页
│   │       ├── motion/         # Clean-aperture 解析器、HEIC/FFmpeg 处理流、MotionWorkspace
│   │       └── stores/         # Zustand 状态管理（fileStore、settingsStore）
│   ├── codecs/                 # 编解码器定义、参数 Schema 与 WASM 加载入口
│   └── worker/                 # Web Worker 执行池、解码缩放与 AVIF/WebP 编码管线
├── sample/                     # 官方 Android 与 iOS 验收样片（保持原始状态）
└── scripts/                    # 编解码器准备脚本、Playwright 浏览器测试及部署工具
```

---

## 快速上手

### 环境要求
* **Node.js**：`^20.11.0` 或 `^22.0.0`（推荐 LTS 版本）
* **pnpm**：`^11.8.0`

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge

# 安装依赖
pnpm install

# 启动本地开发服务（监听于 127.0.0.1:5173）
pnpm dev
```

### 生产构建

```bash
# 构建前端产物并复制绑定的 WASM 二进制引擎
pnpm build

# 本地预览生产构建产物
pnpm preview
```

---

## 质量保障与自动化测试

提交代码或进行版本发布前，需执行全套验证测试：

```bash
# 代码风格检查
pnpm lint

# 全工作区静态类型检查
pnpm typecheck

# 单元测试与 WASM 集成测试（128 项测试全部通过）
pnpm test

# 真实样片端到端浏览器测试（需安装 Chromium 与本地 ffprobe）
pnpm exec playwright install chromium
pnpm test:browser
```

---

## 浏览器兼容性

| 浏览器内核 | 桌面端 | 移动端 | 验证状态 | 说明 |
| :--- | :---: | :---: | :---: | :--- |
| **Chromium** (Chrome, Edge, Brave) | ✅ | ✅ | **完整验证** | 原生支持 H.264 播放，完整 PWA 离线能力，支持 WASM SIMD 指令集。 |
| **Gecko** (Firefox) | ✅ | ✅ | **支持良好** | 完整支持图像压缩、提取与下载；部分无原生解码环境提供静态预览回退。 |
| **WebKit** (Safari, iOS Safari) | ✅ | ✅ | **支持良好** | 采用标准 Web Workers 与 WebAssembly 架构，无需依赖 `SharedArrayBuffer`。 |

---

## 开源协议与合规声明

* **应用本体代码**：遵循 [MIT License](../../LICENSE)。
* **第三方编解码库与二进制资产**：
  * **FFmpeg WebAssembly Core**：遵循 [GPL-2.0-or-later](../../packages/app/public/licenses/FFmpeg-GPL-2.0.txt)。
  * **libheif**：遵循 [LGPL-3.0](../../packages/app/public/licenses/libheif-LGPL-3.0.txt)。
  * **MotionFlow**：提取算法逻辑遵循 [MIT License](../../packages/app/public/licenses/MotionFlow-MIT.txt)。
* 完整的第三方开源声明请参阅 [NOTICE.txt](../../packages/app/public/licenses/NOTICE.txt)。
