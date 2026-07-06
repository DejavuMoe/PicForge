# PicForge

[![MIT License](https://img.shields.io/badge/license-MIT-111111?labelColor=ffffff)](../../LICENSE)
![React](https://img.shields.io/badge/React-18-111111?labelColor=ffffff)
![Vite](https://img.shields.io/badge/Vite-5-111111?labelColor=ffffff)
![Local first](https://img.shields.io/badge/local--first-no_uploads-111111?labelColor=ffffff)

**言語:** [English](../../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 日本語 | [한국어](README.ko.md)

**デモ:** [picforge.de](https://picforge.de)

PicForge は、ローカルファーストのブラウザ向け一括画像圧縮・リサイズアプリです。Canvas、Web Workers、WebAssembly コーデックを使い、画像をユーザーの端末上で処理します。アカウント、アップロード、サーバー側の画像処理は不要です。

![PicForge ワークスペースプレビュー](../assets/picforge-preview.svg)

## ハイライト

| 機能                | 詳細                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------ |
| ローカル処理        | デコード、リサイズ、エンコード、プレビュー、エクスポートはブラウザ内で実行されます。 |
| 一括ワークフロー    | クリック選択、ドラッグ＆ドロップ、フォルダードロップ、貼り付けに対応します。         |
| 圧縮形式            | `@jsquash/*` により MozJPEG、WebP、OxiPNG、AVIF をサポートします。                   |
| Worker パイプライン | ブラウザ側でデコード/リサイズし、WASM エンコードを WorkerPool で実行します。         |
| 画像ごとの上書き    | 任意の画像で、全体設定を完全な設定スナップショットで上書きできます。                 |
| プレビューモード    | スライダー、2画面、単一画像の比較とズーム/パンに対応します。                         |
| エクスポート追跡    | 単一ダウンロードまたは ZIP エクスポートに `picforge-manifest.json` を含めます。      |
| PWA 対応            | インストール可能なアプリシェル、オフラインキャッシュ、更新通知を備えます。           |
| 多言語              | 英語、簡体字中国語、繁体字中国語、日本語、韓国語に対応します。                       |

## クイックスタート

要件:

- Node.js 18 以上
- pnpm 8 以上

```bash
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge
pnpm install
pnpm dev
```

`http://127.0.0.1:5173` を開きます。

本番ビルド:

```bash
pnpm build
pnpm preview
```

## アーキテクチャ

```text
ユーザーファイル
  -> fileStore キュー
  -> 有効設定: 全体設定または画像ごとのスナップショット
  -> ブラウザ Canvas API でデコードし、必要に応じてリサイズ
  -> WorkerPool が @jsquash WASM コーデックでピクセルをエンコード
  -> プレビュー URL、サイズ統計、manifest メタデータ、エクスポート操作
```

UI はネイティブ React App Shell で、ヘッダー、ツールバー、ファイル一覧、プレビュー、画像ごとの設定、ステータスバーを備えた密度の高いワークスペースです。プレビューのオーバーレイは画像変換レイヤーから分離されているため、ズーム時にラベルやメタデータは拡大されません。

## コマンド

| コマンド         | 内容                                               |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | `127.0.0.1` で開発サーバーを起動します。           |
| `pnpm build`     | 本番アプリをビルドします。                         |
| `pnpm preview`   | 本番ビルドをプレビューします。                     |
| `pnpm lint`      | ESLint を実行します。                              |
| `pnpm test`      | Vitest を実行します。                              |
| `pnpm typecheck` | app、worker、codecs パッケージを型チェックします。 |

## ドキュメント

| ドキュメント                          | 用途                                     |
| ------------------------------------- | ---------------------------------------- |
| [Architecture](../ARCHITECTURE.md)    | ランタイムアーキテクチャとデータフロー。 |
| [QA checklist](../QA_CHECKLIST.md)    | 手動の回帰・リリース確認。               |
| [i18n guide](../I18N.md)              | 翻訳と言語サポートの説明。               |
| [Changelog](../CHANGELOG.md)          | バージョン履歴。                         |
| [Contributing](../../CONTRIBUTING.md) | 開発と PR ガイド。                       |
| [Security](../../SECURITY.md)         | 脆弱性報告とプライバシーモデル。         |

## プライバシー

PicForge は選択されたファイルをローカルで読み取り、プレビューとエクスポートにオブジェクト URL を使用します。ファイルや結果が削除されるとオブジェクト URL は破棄されます。自分でデプロイする場合、ユーザーが明示的に同意しない限り、分析、アップロード、リモート処理を既定の経路に追加しないでください。

## ライセンス

[MIT](../../LICENSE) © [DejavuMoe](https://github.com/DejavuMoe)
