# PicForge

[![MIT License](https://img.shields.io/badge/license-MIT-111111?labelColor=ffffff)](../../LICENSE)
![React](https://img.shields.io/badge/React-18-111111?labelColor=ffffff)
![Vite](https://img.shields.io/badge/Vite-5-111111?labelColor=ffffff)
![Local first](https://img.shields.io/badge/local--first-no_uploads-111111?labelColor=ffffff)

**언어:** [English](../../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | 한국어

**데모:** [picforge.de](https://picforge.de)

PicForge는 로컬 우선 브라우저용 일괄 이미지 압축 및 크기 조정 앱입니다. Canvas, Web Workers, WebAssembly 코덱을 사용해 이미지를 사용자의 기기에서 처리합니다. 계정, 업로드, 서버 측 이미지 처리가 필요하지 않습니다.

![PicForge 작업 공간 미리보기](../assets/picforge-preview.svg)

## 주요 기능

| 기능              | 설명                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| 로컬 처리         | 디코딩, 크기 조정, 인코딩, 미리보기, 내보내기가 브라우저에서 실행됩니다.      |
| 일괄 워크플로     | 클릭 선택, 드래그 앤 드롭, 폴더 드롭, 붙여넣기를 지원합니다.                  |
| 압축 형식         | `@jsquash/*`를 통해 MozJPEG, WebP, OxiPNG, AVIF를 지원합니다.                 |
| Worker 파이프라인 | 브라우저에서 디코딩/크기 조정을 하고 WASM 인코딩은 WorkerPool에서 실행합니다. |
| 이미지별 설정     | 모든 이미지는 전체 설정을 완전한 설정 스냅샷으로 덮어쓸 수 있습니다.          |
| 미리보기 모드     | 슬라이더, 양쪽 비교, 단일 이미지 비교와 확대/이동을 지원합니다.               |
| 내보내기 추적     | 단일 다운로드 또는 ZIP 내보내기에 `picforge-manifest.json`을 포함합니다.      |
| PWA 지원          | 설치 가능한 앱 셸, 오프라인 캐시, 새 버전 알림을 제공합니다.                  |
| 다국어            | 영어, 중국어 간체, 중국어 번체, 일본어, 한국어를 지원합니다.                  |

## 빠른 시작

요구 사항:

- Node.js 18 이상
- pnpm 8 이상

```bash
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge
pnpm install
pnpm dev
```

`http://localhost:5173`을 엽니다.

프로덕션 빌드:

```bash
pnpm build
pnpm preview
```

## 아키텍처

```text
사용자 파일
  -> fileStore 큐
  -> 적용 설정: 전역 설정 또는 이미지별 스냅샷
  -> 브라우저 Canvas API로 디코딩하고 필요한 경우 크기 조정
  -> WorkerPool이 @jsquash WASM 코덱으로 픽셀 인코딩
  -> 미리보기 URL, 크기 통계, manifest 메타데이터, 내보내기 동작
```

UI는 네이티브 React App Shell이며 헤더, 도구 모음, 파일 목록, 미리보기, 이미지별 설정, 상태 표시줄을 포함한 밀도 높은 작업 공간을 제공합니다. 미리보기 오버레이는 이미지 변환 레이어와 분리되어 있어 확대 중에도 라벨과 메타데이터가 확대되지 않습니다.

## 명령어

| 명령어           | 설명                                          |
| ---------------- | --------------------------------------------- |
| `pnpm dev`       | 개발 서버를 시작합니다.                       |
| `pnpm build`     | 프로덕션 앱을 빌드합니다.                     |
| `pnpm preview`   | 프로덕션 빌드를 미리 봅니다.                  |
| `pnpm lint`      | ESLint를 실행합니다.                          |
| `pnpm test`      | Vitest를 실행합니다.                          |
| `pnpm typecheck` | app, worker, codecs 패키지를 타입 검사합니다. |

## 문서

| 문서                                  | 목적                           |
| ------------------------------------- | ------------------------------ |
| [Architecture](../ARCHITECTURE.md)    | 런타임 아키텍처와 데이터 흐름. |
| [Roadmap](../ROADMAP.md)              | 제품 및 엔지니어링 계획.       |
| [QA checklist](../QA_CHECKLIST.md)    | 수동 릴리스 점검.              |
| [i18n guide](../I18N.md)              | 번역과 언어 지원 설명.         |
| [Changelog](../CHANGELOG.md)          | 버전 기록.                     |
| [Contributing](../../CONTRIBUTING.md) | 개발 및 PR 가이드.             |
| [Security](../../SECURITY.md)         | 취약점 보고와 개인정보 모델.   |

## 개인정보

PicForge는 선택한 파일을 로컬에서 읽고 미리보기와 내보내기에 객체 URL을 사용합니다. 파일이나 결과가 제거되면 객체 URL도 해제됩니다. 직접 배포하는 경우 사용자가 명시적으로 동의하지 않는 한 분석, 업로드, 원격 처리를 기본 경로에 추가하지 마세요.

## 라이선스

[MIT](../../LICENSE) © [DejavuMoe](https://github.com/DejavuMoe)
