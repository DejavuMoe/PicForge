#!/usr/bin/env python3
"""Export the committed SVG mark. Requires rsvg-convert, pango-view, Noto Sans and ImageMagick."""

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / 'packages/app/public'
DESIGN = ROOT / 'docs/design'
MASTER = ROOT / 'packages/app/src/assets/logo.svg'
NS = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', NS)
MARK = ET.parse(MASTER).getroot().find(f'{{{NS}}}g')
EXPORTED = []
RED = '#c44832'


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content + '\n', encoding='utf-8')
    EXPORTED.append(path)


def svg(body, width, height, viewbox=None):
    return f'<svg xmlns="{NS}" width="{width}" height="{height}" viewBox="{viewbox or f"0 0 {width} {height}"}">{body}</svg>'


def mark(color=RED):
    element = deepcopy(MARK)
    element.set('fill', color)
    return ET.tostring(element, encoding='unicode')


def placed_mark(x, y, size, color=RED):
    return f'<g transform="translate({x} {y}) scale({size / 64})">{mark(color)}</g>'


def icon(size, scale, radius):
    return svg(
        f'<rect width="64" height="64" rx="{radius}" fill="{RED}"/>'
        f'<g transform="translate(32 32) scale({scale}) translate(-32 -32)">{mark("#fff")}</g>',
        size, size, '0 0 64 64',
    )


def png(source, target, width, height):
    target.parent.mkdir(parents=True, exist_ok=True)
    run('rsvg-convert', '-w', str(width), '-h', str(height), '-o', str(target), input=source.encode())
    run('magick', str(target), '-strip', '-depth', '8', '-define', 'png:exclude-chunks=date,time', str(target))
    EXPORTED.append(target)


def outlined_text(text, size, bold, temp):
    """Pango supplies kerning; committed output contains glyph paths, not font dependencies."""
    source = temp / 'type.svg'
    run('pango-view', '--no-display', '--pixels', '--margin=0', '--background=transparent',
        f'--font=Noto Sans {"Bold" if bold else "Regular"} {size}', f'--text={text}', f'--output={source}')
    root = ET.parse(source).getroot()
    glyphs = {element.get('id'): element for element in root.iter() if element.get('id')}
    paths = []
    for use in root.iter(f'{{{NS}}}use'):
        glyph = glyphs[use.get(f'{{{XLINK}}}href')[1:]]
        paths.append(f'<g transform="translate({use.get("x", "0")} {use.get("y", "0")})">'
                     + ''.join(ET.tostring(p, encoding='unicode') for p in glyph) + '</g>')
    body = ''.join(paths)
    untrimmed = svg(body, root.get('width'), root.get('height'))
    raster = temp / 'type.png'
    run('rsvg-convert', '-o', str(raster), input=untrimmed.encode())
    bounds = run('magick', 'identify', '-format', '%@', str(raster)).stdout.decode()
    width, height, x, y = map(int, re.fullmatch(r'(\d+)x(\d+)\+(\d+)\+(\d+)', bounds).groups())
    return body, (x - 1, y - 1, width + 2, height + 2)


def text_at(text, size, x, y, color, temp, bold=False):
    body, (bx, by, width, height) = outlined_text(text, size, bold, temp)
    return f'<svg x="{x}" y="{y}" width="{width}" height="{height}" viewBox="{bx} {by} {width} {height}" fill="{color}">{body}</svg>'


with TemporaryDirectory(prefix='picforge-brand-') as scratch:
    temp = Path(scratch)
    for filename, color in [('logo.svg', RED), ('logo-black.svg', '#242424'), ('logo-white.svg', '#fff')]:
        write(PUBLIC / 'brand' / filename, svg(f'<title>PicForge</title>{mark(color)}', 512, 512, '0 0 64 64'))
    png(svg(mark(), 512, 512, '0 0 64 64'), PUBLIC / 'brand/logo-512.png', 512, 512)

    wordmark, box = outlined_text('PicForge', 64, True, temp)
    for filename, ink in [('logo-lockup.svg', '#242424'), ('logo-lockup-white.svg', '#f7f5f0')]:
        lockup = svg(f'<title>PicForge</title>{placed_mark(12, 16, 96)}'
                     f'<svg x="132" y="23" width="336" height="82" viewBox="{" ".join(map(str, box))}" fill="{ink}">{wordmark}</svg>', 512, 128)
        write(PUBLIC / 'brand' / filename, lockup)
        if filename == 'logo-lockup.svg':
            png(lockup, PUBLIC / 'brand/logo-lockup.png', 1024, 256)

    favicon = icon(64, 0.98, 14)
    write(PUBLIC / 'favicon.svg', favicon)
    for size in [16, 32, 48]:
        png(favicon, PUBLIC / f'favicon-{size}.png', size, size)
    run('magick', *(str(PUBLIC / f'favicon-{size}.png') for size in [16, 32, 48]), str(PUBLIC / 'favicon.ico'))
    EXPORTED.append(PUBLIC / 'favicon.ico')
    for size in [192, 512]:
        png(icon(size, 0.9, 14), PUBLIC / f'pwa-{size}.png', size, size)
    maskable = icon(512, 0.8, 0)
    write(PUBLIC / 'pwa-icon.svg', maskable)
    png(maskable, PUBLIC / 'pwa-maskable-512.png', 512, 512)
    png(icon(180, 0.9, 0), PUBLIC / 'apple-touch-icon.png', 180, 180)

    for height, dark, source_name, export_name in [
        (630, False, 'social-card.svg', 'og-image.png'),
        (600, True, 'twitter-card.svg', 'twitter-card.png'),
    ]:
        background, ink, muted, rule, accent = (
            ('#202322', '#f7f5ef', '#b1b5b1', '#454946', '#ef6b4a') if dark else
            ('#f5f3ee', '#242624', '#686c67', '#d7d7ce', RED)
        )
        body = f'<title>PicForge — Image tools. On your device.</title><rect width="1200" height="{height}" fill="{background}"/>'
        body += text_at('picforge.de', 17, 1036, 58, muted, temp)
        body += text_at('PicForge', 90, 72, int(height * .24), ink, temp, True)
        body += text_at('Image tools.', 37, 76, int(height * .48), ink, temp)
        body += text_at('On your device.', 37, 76, int(height * .48) + 48, muted, temp)
        body += placed_mark(744, (height - 432) / 2 - 15, 432, accent)
        body += f'<path d="M76 {height-88}H1124" stroke="{rule}"/>'
        for label, x in [('Compress images', 76), ('Extract Motion Photos', 404), ('Convert Live Photos', 794)]:
            body += text_at(label, 19, x, height - 57, ink, temp)
        card = svg(body, 1200, height)
        write(DESIGN / source_name, card)
        png(card, PUBLIC / export_name, 1200, height)
    # Keep the previously published image URL valid as well as the new crisp PNG.
    run('magick', str(PUBLIC / 'og-image.png'), '-background', '#f5f3ee', '-alpha', 'remove', '-strip', '-quality', '92', str(PUBLIC / 'og-image.jpg'))
    EXPORTED.append(PUBLIC / 'og-image.jpg')

manifest = {
    'master': str(MASTER.relative_to(ROOT)),
    'typeface': 'Noto Sans (rendered to outlines; no runtime font download)',
    'exports': [
        {'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size, 'sha256': sha256(path.read_bytes()).hexdigest()}
        for path in sorted(EXPORTED)
    ],
}
(DESIGN / 'brand-assets.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(f'Exported {len(EXPORTED)} brand assets from {MASTER.relative_to(ROOT)}')
