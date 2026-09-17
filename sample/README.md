# Media regression fixtures

These three original files were explicitly approved by the repository owner for
version control on 2026-09-17. They are **test-only inputs**, not application demo
assets or production downloads. Preserve the original filenames and bytes: metadata,
container layout and motion/video pairing are part of the regression inputs.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `android/1450.jpg` | Android Motion Photo original | `8195cbc1d9b465c1d712841ea2439e3d5113cc4e36e06317a3df1ee2879fb801` |
| `ios/IMG_1539.HEIC` | iOS Live Photo still | `0357aa5877281ddd23278ff96254add475db73c64be24d9cf9cd73414ee5569e` |
| `ios/IMG_1539.MOV` | Paired iOS Live Photo video | `6f224eabd9b2ed07f882f3afb27a33cbce016d24505d2c125d948b3110d2c2c4` |

From the repository root, run the existing media acceptance harness:

```bash
PICFORGE_SAMPLE_ANDROID="$PWD/sample/android/1450.jpg" \
PICFORGE_SAMPLE_IOS_HEIC="$PWD/sample/ios/IMG_1539.HEIC" \
PICFORGE_SAMPLE_IOS_MOV="$PWD/sample/ios/IMG_1539.MOV" \
pnpm test:browser
```

The harness needs the installed Playwright browser, ffprobe and the supporting
media tools described in `AGENTS.md`. This command supplies the original fixtures;
it does not imply that every browser or real Safari has already been qualified.

Keep generated images, videos, ZIPs, screenshots and traces in a temporary output
directory. Never overwrite these source fixtures or copy this directory into
`packages/app/public`, service-worker caches or production builds. Additional
personal media needs separate authorization before committing; `sample/local/`
is ignored for private local inputs.
