<h1 align="center">PicForge</h1>

<p align="center">
  <strong>WebAssembly 기반의 고성능 브라우저 로컬 이미지 및 모션 미디어 툴박스</strong><br>
  100% 브라우저 클라이언트 연산 · 파일 업로드 없음 · 텔레메트리 없음 · 서버 의존성 없음
</p>

<p align="center">
  <a href="https://picforge.de"><strong>라이브 데모: picforge.de</strong></a>
</p>

<p align="center">
  <strong>언어 / Language:</strong> <a href="../../README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | 한국어
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

## 개요

**PicForge**는 고처리량 대량 이미지 압축, Android 모션 포토 추출, 크로스 플랫폼 iOS 라이브 포토 트랜스코딩을 지원하는 로컬 우선(Local-first) 오픈 소스 브라우저 미디어 툴박스입니다.

클라우드 기반의 기존 변환 서비스와 달리, PicForge의 디코딩, 처리, 인코딩 파이프라인은 모두 클라이언트 측 Web Worker와 WebAssembly 런타임 내에서 실행됩니다. 사용자의 사진과 영상 데이터는 외부 서버로 전송되지 않고 사용자 기기 메모리에만 머무릅니다.

<p align="center">
  <img src="../assets/picforge-workspace.jpg" alt="PicForge 워크스페이스" width="100%" />
</p>

---

## 핵심 기능

### ⚡ 1. 대량 이미지 압축
* **WebAssembly 코덱 제품군**: `@jsquash/*`로 컴파일된 네이티브 WebAssembly 코덱 통합:
  * **MozJPEG**: 인지 양자화 및 프로그레시브 스캔 최적화.
  * **WebP**: 손실 및 무손실 압축 지원, 브라우저 환경에 따른 SIMD 가속 자동 감지.
  * **OxiPNG**: 무손실 다중 패스 PNG 심층 압축 최적화.
  * **AVIF**: 0–100 선형 품질 매핑 및 크로마 서브샘플링 제어(`4:4:4` vs `4:2:0`)를 지원하는 차세대 포맷.
* **비율 유지 크기 조정**: 종횡비 왜곡을 방지하는 세 가지 리사이즈 모드:
  * `contain`(맞춤): 해상도 확대 없이 지정된 경계 크기 내로 축소.
  * `cover`(채움): 중앙 기준으로 크롭하여 목표 치수에 정확히 맞춤.
  * `stretch`(늘림): 비율과 관계없이 지정된 절대 가로/세로 크기로 강제 조정.
* **계층형 설정 아키텍처**: 일괄 적용되는 전역 프리셋 외에도 큐 내부의 특정 이미지에 독립적인 개별 설정 스냅샷을 부여할 수 있으며, 전역 설정이 변경되어도 개별 스냅샷은 보존됩니다.
* **실시간 화질 비교**:
  * 뷰포트 레이어 클리핑(Viewport-layer clip) 기반의 실시간 분할 비교 슬라이더.
  * 나란히 보기(Side-by-side) 및 단일 보기 모드, 2배율 확대 및 캔버스 드래그 이동을 통한 디테일 검증.
* **동시성 제어 및 안전성**:
  * 최대 동시 실행 수가 제어되는 Web Worker 풀 스케줄러.
  * `AbortController` 및 `taskEpoch` 일련번호 기반 작업 취소 보호(오래된 Worker의 지연 콜백으로 인한 스토어 오염 방지).
  * 디렉터리 경로 순회 공격이 방지된 ZIP 대량 내보내기 및 설정 메타데이터 매니페스트(`picforge-manifest.json`) 동봉.

### 📱 2. Android 모션 포토 추출
* **바이너리 파싱 엔진**: JPEG 파일의 바이너리 구조를 스캔하여 내장된 MP4 마이크로 비디오 스트림의 오프셋을 직접 검색.
* **완전 무손실 및 바이트 일치**: 재인코딩 과정 없이 원본 정지화면 JPEG과 내장 MP4 비디오를 원본 바이트 그대로 분리하여 원본과 동일한 비트스트림 보장.
* **초고속 처리**: 인코딩 연산 부하가 없으므로 로컬 디스크 및 메모리 I/O 속도만으로 즉시 처리 완료.
* **대량 추출**: 여러 파일 드래그 앤 드롭, 진행 상태 표시 및 원클릭 ZIP 아카이브 다운로드 지원.

### 🍏 3. iOS 라이브 포토 변환
* **휴리스틱 베이스네임 페어링**: 대소문자를 구분하지 않는 디렉터리 구조 및 파일 기본 이름(Basename)을 기반으로 혼합된 `.HEIC` 사진과 `.MOV` 동영상을 자동 매칭.
* **QuickTime Clean Aperture(`clap`) 어댑터**: QuickTime Atom 구조 내의 유효 디스플레이 영역을 파싱하여 자동 회전 후 크롭 범위를 사전 보정함으로써 비디오 가장자리의 검은 여백이나 래스터 아티팩트를 제거.
* **클라이언트 사이드 트랜스코딩**:
  * **HEIC → MozJPEG**: `libheif-js`를 통해 HEIF 비트스트림을 브라우저에서 직접 디코딩한 후 고화질 JPEG으로 변환.
  * **MOV → H.264 / AAC**: 단일 스레드 WebAssembly FFmpeg를 활용하여 웹 표준에 부합하는 호환성 높은 MP4로 변환.
* **프레임 단위 정확한 PTS 유지**: 원본 표시 타임스탬프(PTS)를 기본으로 엄격히 유지하여 프레임 레이트 재샘플링으로 인한 떨림이나 프레임 중복을 방지하며, 표준 30 fps 정규화 옵션 제공.
* **트랜스코딩 프리셋**:
  * **Balanced(균형)**: CRF 23, 긴 축 ≤ 1920px, MozJPEG 품질 85 (권장 기본값).
  * **Quality(고화질)**: CRF 20, 긴 축 ≤ 1920px, MozJPEG 품질 90.
  * **Compact(고압축)**: CRF 26, 긴 축 ≤ 1280px, MozJPEG 품질 75.
* **비지원 환경 폴백**: 특정 비디오 코덱의 인라인 재생을 지원하지 않는 브라우저 환경에서는 정적 썸네일과 안내 메시지를 표시하며, 다운로드 기능은 정상 유지.

---

## 아키텍처 및 프라이버시 원칙

* **100% 로컬 연산 및 제로 트러스트 프라이버시**: 분석 도구, 쿠키, 사용자 추적, 원격 서버 업로드가 전혀 존재하지 않습니다. 모든 연산과 메모리 할당은 현재 브라우저 탭 내에서만 수행됩니다.
* **WASM 엔진 지연 로딩(Lazy Loading)**: FFmpeg 및 libheif와 같은 대용량 WebAssembly 엔진은 사용자가 해당 도구 워크스페이스에 진입할 때만 필요에 따라 로드됩니다.
* **PWA 오프라인 지원**: 빌드 시 정적 자산 프리캐시 목록(`precache.json`)을 생성하는 Service Worker가 내장되어 있습니다. 첫 로드 후 오프라인 환경에서도 독립적으로 실행됩니다.
* **메모리 수명 주기 관리**: 생성된 Object URL과 ArrayBuffer를 명시적으로 해제하여 대량 작업 중 브라우저 탭 메모리 누수를 방지합니다.
* **5개 국어 다국어 지원**: `i18next`를 통해 5개 언어 인터페이스를 완벽하게 지원합니다:
  * 영어 (`en`)
  * 중국어 간체 (`zh-CN`)
  * 중국어 번체 (`zh-TW`)
  * 일본어 (`ja`)
  * 한국어 (`ko`)
* **현대적인 반응형 UI**: CSS 변수 및 디자인 토큰 기반 글래스모피즘 디자인, Geist 타이포그래피, 캔버스 인터랙티브 파티클 배경, 작업 완료 컨페티 효과 및 다크/라이트 테마 전환을 제공합니다.

---

## 성능 및 검증 벤치마크

공식 인수 테스트 샘플(Chromium / Linux x86_64 환경) 기반 실제 트랜스코딩 측정 데이터:

| 미디어 스트림 | 원본 입력 | 내보내기 출력 | 해상도 | 크기 감소율 | 구조적 유사도 (SSIM) |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **iOS 사진** | 2.33 MB HEIC | 2.01 MB MozJPEG (Q85) | 4284 × 5712 | **-13.8%** | **0.9898** |
| **iOS 비디오** | 2.89 MB MOV | 0.94 MB H.264 MP4 | 1308 × 1744 | **-67.4%** | **0.9821** |
| **Android 사진** | 9.35 MB JPG | 바이트 일치 JPG + MP4 | 원본 유지 | 무손실 | **1.0000** |

*세부 PTS 타임스탬프 분석, SSIM 측정 방식, 크로스 브라우저 검증 결과는 [docs/SAMPLE_VALIDATION.md](../SAMPLE_VALIDATION.md)에 상세히 기술되어 있습니다.*

---

## Monorepo 프로젝트 구조

PicForge는 `pnpm` 기반의 모듈형 TypeScript 모노레포로 구성되어 있습니다:

```text
PicForge/
├── docs/                       # QA 체크리스트, 성능 벤치마크, 다국어 문서
├── packages/
│   ├── app/                    # React 18 + Vite 클라이언트 앱, Zustand 스토어, UI 워크스페이스
│   │   ├── public/             # PWA Manifest, Service Worker, 폰트 및 벤더 WASM 자산
│   │   └── src/
│   │       ├── components/     # UI 위젯 (DropZone, Preview, FileList, Settings, Toolbar 등)
│   │       ├── hooks/          # autoCompressController 및 Worker 풀 제어 훅
│   │       ├── landing/        # 인터랙티브 파티클 캔버스 및 랜딩 페이지
│   │       ├── motion/         # Clean-aperture 파서, HEIC/FFmpeg 처리 파이프라인, MotionWorkspace
│   │       └── stores/         # Zustand 상태 관리 (fileStore, settingsStore)
│   ├── codecs/                 # 코덱 정의, 설정 스키마 및 WASM 로더
│   └── worker/                 # Web Worker 실행 풀, 디코딩/리사이징, AVIF/WebP 인코딩 코어
├── sample/                     # Android 및 iOS 공식 인수 테스트 샘플 (수정 불가)
└── scripts/                    # 코덱 준비 스크립트, Playwright 브라우저 테스트 및 배포 도구
```

---

## 빠른 시작

### 요구 사양
* **Node.js**: `^20.11.0` 또는 `^22.0.0` (LTS 권장)
* **pnpm**: `^11.8.0`

### 설치 및 로컬 개발

```bash
# 저장소 클론
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge

# 의존성 설치
pnpm install

# 로컬 개발 서버 시작 (127.0.0.1:5173에 바인딩)
pnpm dev
```

### 프로덕션 빌드

```bash
# 프론트엔드 빌드 및 고정 버전 WASM 바이너리 패키징
pnpm build

# 로컬에서 프로덕션 빌드 미리보기
pnpm preview
```

---

## 품질 보증 및 테스트

코드 제출 또는 릴리스 전 아래 검증 명령어를 실행합니다:

```bash
# 코드 컨벤션 검사
pnpm lint

# 전체 작업 공간 정적 타입 검사
pnpm typecheck

# 단위 테스트 및 WASM 통합 테스트 (128개 테스트 전체 통과)
pnpm test

# 실제 샘플 파일 브라우저 E2E 테스트 (Chromium 및 로컬 ffprobe 필요)
pnpm exec playwright install chromium
pnpm test:browser
```

---

## 브라우저 지원 현황

| 브라우저 엔진 | 데스크톱 | 모바일 | 검증 상태 | 비고 |
| :--- | :---: | :---: | :---: | :--- |
| **Chromium** (Chrome, Edge, Brave) | ✅ | ✅ | **완전 검증** | H.264 네이티브 재생, 완전한 PWA 오프라인, WASM SIMD 가속 지원. |
| **Gecko** (Firefox) | ✅ | ✅ | **지원** | 이미지 압축, 추출, 다운로드 완벽 지원. 일부 재생 미지원 환경 정적 프리뷰 폴백. |
| **WebKit** (Safari, iOS Safari) | ✅ | ✅ | **지원** | 표준 Web Worker 및 WebAssembly 기반으로 동작하며 `SharedArrayBuffer` 불필요. |

---

## 오픈 소스 라이선스 및 준수 사항

* **애플리케이션 코드**: [MIT License](../../LICENSE)에 따라 배포됩니다.
* **타사 코덱 및 바이너리 라이브러리**:
  * **FFmpeg WebAssembly Core**: [GPL-2.0-or-later](../../packages/app/public/licenses/FFmpeg-GPL-2.0.txt) 라이선스 적용.
  * **libheif**: [LGPL-3.0](../../packages/app/public/licenses/libheif-LGPL-3.0.txt) 라이선스 적용.
  * **MotionFlow**: 추출 알고리즘 로직은 [MIT License](../../packages/app/public/licenses/MotionFlow-MIT.txt)에 따라 통합.
* 자세한 타사 라이선스 고지는 [NOTICE.txt](../../packages/app/public/licenses/NOTICE.txt)에서 확인할 수 있습니다.
