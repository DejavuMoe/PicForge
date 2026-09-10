# README screenshots

These are browser screenshots of PicForge, not interface mockups. Each of the five READMEs uses three captures in its own language: `compression-*.jpg`, `android-*.jpg` and `ios-*.jpg`.

- **Application:** 0.16.0, source revision `6735b8d6d27ea5a1bc3b20ceae7800f2ab83af71`.
- **Capture:** 2026-09-10, local production preview, Chromium 152.0.7977.82 on Linux, Playwright 1.58.2.
- **Viewport:** 1440 × 900, device scale 1, light theme. Direct Playwright JPEG screenshots at quality 92; no compositing, retouching or changes to application state outside the UI.
- **Source image:** the committed [dune sample](../../../packages/app/src/assets/dune-sample.jpg), 1200 × 800. It was generated with OpenAI ImageGen; its prompt and preparation are recorded in the [design brief](../../design/editorial-redesign.md#asset-provenance-and-final-adaptations). No private media was used.

## Displayed results

| Tool | Input and settings |
| --- | --- |
| Compression | Home page sample imported into the real compressor; default JPEG quality 75, resize off, slider comparison. |
| Android | Sample JPEG followed by an MP4 containing a three-second, 30 fps slow zoom of the same image. Extracted through the Android tool. |
| iOS | A HEIC made from the sample at quality 85, paired by filename with the same three-second clip in a MOV container. Converted through the iOS tool with its default balanced preset, source timing and JPEG quality 85. The fixture has no audio track. |

The media fixtures were made locally with ImageMagick, `heif-enc` and FFmpeg. They illustrate tool operation; they are not camera originals or evidence of device compatibility. Screenshot file sizes are actual results for these fixtures, not performance claims. See the existing [camera validation report](../../SAMPLE_VALIDATION.md) for camera evidence.

## Refreshing the images

1. Build and run the local preview. Use a fresh browser context so existing user queues are untouched.
2. Open the home sample in the compressor. For the media tools, create temporary fixtures from the committed sample and process them through the normal import and batch controls.
3. Wait for completed results and decoded image/video previews. Switch languages using the header picker, keeping the processed queues intact.
4. Capture each tool at the viewport above with the pointer away from controls. Keep raw captures, fixtures and downloaded results in a temporary directory; copy only the selected documentation JPEGs here.
5. Check the screenshots, local Markdown links and rendered READMEs before replacing them. Record the new source revision and environment.

For this capture, all three tools completed and downloaded results without page or console errors. The Android JPG and MP4 reconstructed the input byte for byte; ffprobe confirmed 1200 × 800 JPEG outputs and H.264 MP4 output. A 390 × 844 mobile capture was also inspected. This documents the screenshot session, not a new full browser or release qualification.
