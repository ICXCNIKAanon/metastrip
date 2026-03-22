# MetaStrip Chrome Extension

Chrome browser extension that automatically strips metadata from images before they're uploaded to any website.

## What it does

When you select an image to upload on any webpage, MetaStrip intercepts the file input and strips GPS coordinates, device info, EXIF, IPTC, XMP, and other hidden metadata from JPEG, PNG, and WebP images. Zero quality loss — binary surgery only, no re-encoding.

A small toast notification confirms: "MetaStrip: Stripped metadata from photo.jpg"

## Install (development)

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `packages/browser-extension/` directory

## Supported formats

- **JPEG** — EXIF, IPTC, XMP, comments stripped. APP0 (JFIF) and ICC profiles preserved.
- **PNG** — tEXt, iTXt, zTXt, eXIf chunks stripped. All critical and rendering chunks preserved.
- **WebP** — EXIF and XMP chunks stripped. VP8X flags patched. Image data untouched.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 extension config |
| `content.js` | Content script — intercepts file inputs |
| `background.js` | Service worker — lifecycle and badge |
| `strip-jpeg.js` | JPEG metadata stripper (standalone) |
| `strip-png.js` | PNG metadata stripper (standalone) |
| `strip-webp.js` | WebP metadata stripper (standalone) |
| `popup.html/js/css` | Extension popup UI with toggle |

## Architecture

All strippers are plain JavaScript (no modules, no imports) that attach to `window.__metastrip`. The content script listens for `change` events on `input[type=file]` elements, processes each selected file through the appropriate stripper, and replaces the input's `files` with stripped versions via `DataTransfer`.
