# MetaStrip Firefox Extension

Auto-strip metadata from images before uploading. Right-click any image to inspect its metadata.

## Install from Source

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Navigate to `packages/firefox-extension` and select `manifest.json`

## Features

- Auto-strip metadata on standard file uploads
- Right-click → **Inspect Metadata** on any image (with dark map for GPS)
- Right-click page → **Scan All Images on Page**
- Drag & paste metadata alerts
- Network-level interception (fetch/XHR)
- Toggle on/off via popup

## Limitations

Gmail, Slack, and Discord use custom upload handlers. For these apps, strip files first at metastrip.ai.
