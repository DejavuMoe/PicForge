# PicForge

[![MIT License](https://img.shields.io/badge/license-MIT-111111?labelColor=ffffff)](../../LICENSE)
![React](https://img.shields.io/badge/React-18-111111?labelColor=ffffff)
![Vite](https://img.shields.io/badge/Vite-5-111111?labelColor=ffffff)
![Local first](https://img.shields.io/badge/local--first-no_uploads-111111?labelColor=ffffff)

**语言：** [English](../../README.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

**演示站点：** [picforge.de](https://picforge.de)

PicForge 是一个本地优先的浏览器批量图片压缩与尺寸调整工具。它使用 Canvas、Web Workers 和 WebAssembly 编解码器在你的设备上处理图片，不需要账户、上传或服务器端图片处理。

![PicForge 工作区预览](../assets/picforge-preview.svg)

## 功能亮点

| 功能        | 说明                                                       |
| ----------- | ---------------------------------------------------------- |
| 本地处理    | 解码、尺寸调整、编码、预览和导出都在浏览器内完成。         |
| 批量工作流  | 支持点击选择、拖放、文件夹拖放和粘贴导入。                 |
| 压缩格式    | 通过 `@jsquash/*` 支持 MozJPEG、WebP、OxiPNG 和 AVIF。     |
| Worker 管线 | 浏览器侧解码/调整尺寸，WASM 编码在受控 WorkerPool 中执行。 |
| 单图覆盖    | 任意图片都可以用完整设置快照覆盖全局设置。                 |
| 预览模式    | 支持滑块、双栏和单图对比，并带缩放与平移。                 |
| 导出追踪    | 单图下载或 ZIP 导出，并包含 `picforge-manifest.json`。     |
| PWA 支持    | 可安装应用壳、离线缓存和前台新版本提示。                   |
| 多语言      | 英语、简体中文、繁体中文、日语和韩语。                     |

## 快速开始

要求：

- Node.js 18 或更新版本
- pnpm 8 或更新版本

```bash
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173`。

生产构建：

```bash
pnpm build
pnpm preview
```

## 架构

```text
用户文件
  -> fileStore 队列
  -> 生效设置：全局设置或单图设置快照
  -> 使用浏览器 Canvas API 解码并按需调整尺寸
  -> WorkerPool 使用 @jsquash WASM 编码像素
  -> 生成预览 URL、体积统计、manifest 元数据和导出动作
```

UI 是原生 React App Shell，包含高密度工作区控件：头部、工具栏、文件列表、预览、单图设置和状态栏。预览覆盖层与图片变换层分离，因此缩放时标签和元数据不会被放大。

## 命令

| 命令             | 作用                                      |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | 在 `127.0.0.1` 启动开发服务器。          |
| `pnpm build`     | 构建生产应用。                            |
| `pnpm preview`   | 预览生产构建。                            |
| `pnpm lint`      | 运行 ESLint。                             |
| `pnpm test`      | 运行 Vitest。                             |
| `pnpm typecheck` | 对 app、worker、codecs 三个包做类型检查。 |

## 文档

| 文档                                  | 用途                 |
| ------------------------------------- | -------------------- |
| [Architecture](../ARCHITECTURE.md)    | 运行时架构与数据流。 |
| [QA checklist](../QA_CHECKLIST.md)    | 手动回归与发布检查。 |
| [i18n guide](../I18N.md)              | 翻译与语言支持说明。 |
| [Changelog](../CHANGELOG.md)          | 版本历史。           |
| [Contributing](../../CONTRIBUTING.md) | 开发和 PR 指南。     |
| [Security](../../SECURITY.md)         | 漏洞报告与隐私模型。 |

## 隐私

PicForge 只在本地读取用户选择的文件，并用对象 URL 完成预览和导出。文件或结果移除时会回收对象 URL。如果你自行部署，请不要在默认路径中加入分析、上传或远程处理，除非用户明确选择加入。

## 许可证

[MIT](../../LICENSE) © [DejavuMoe](https://github.com/DejavuMoe)
