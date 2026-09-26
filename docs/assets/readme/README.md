# README screenshots

Each of the five READMEs uses browser captures of the current [darkroom ledger interface](../../UI_DESIGN.md): `compression-*.jpg`, `android-*.jpg` and `ios-*.jpg`. These are application screenshots using generated sample media, not interface mockups or camera compatibility tests.

## Capture contract

- Use a local production preview in a fresh browser context, 1440 × 900 at device scale 1, light theme.
- Capture JPEG directly at quality 92. Do not composite, retouch or change application state outside its UI.
- Use the committed [dune sample](../../../packages/app/src/assets/dune-sample.jpg), 1200 × 800. Its [generation and encoding provenance](../../design/darkroom-ledger.md#sample-assets) identifies it as non-personal media.

| Tool | Input and settings |
| --- | --- |
| Compression | Import the home sample into the real compressor; JPEG quality 75, resize off, split comparison. |
| Android | Append an MP4 (H.264, 1200 × 800, 90 frames, three seconds at 30 fps) with a slow zoom of the same image to its JPEG; extract it through the Android tool. |
| iOS | Encode the sample with `heif-enc -q 85`, pair it by filename with the same clip remuxed into MOV, then convert with the default balanced preset, source timing and JPEG quality 85. The fixture has no audio. |

Create the temporary fixtures locally with ImageMagick, `heif-enc` and FFmpeg. Displayed sizes are actual results for those inputs, not benchmark claims. Keep personal camera media out of screenshots and published assets.

## Refreshing

1. Build and start the local preview; create a fresh browser context.
2. Import and process fixtures through normal file and batch controls.
3. Wait for completed results and decoded photo/video previews. Switch each of the five languages with the header picker while retaining the processed queues.
4. Move the pointer away from controls and capture each tool. Inspect text, media, controls, footer and console errors before selecting images.
5. Keep raw captures, fixtures and downloaded results temporary. Copy only the selected documentation JPEGs here; verify local links and rendered READMEs.

Screenshots illustrate the interface. Use the [validation guide](../../validation.md) for browser, media and release acceptance.
