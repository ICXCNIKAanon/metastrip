# MetaStrip — Image Metadata Remover

Strip GPS coordinates, device serial numbers, timestamps, and hidden metadata from images directly in VS Code. Zero quality loss — binary-level surgery, no re-encoding.

## Usage

Right-click any image file (JPEG, PNG, WebP) in the Explorer → **MetaStrip: Strip Metadata**

Right-click any folder → **MetaStrip: Strip All Images in Folder**

## What Gets Removed

- GPS coordinates (latitude, longitude, altitude)
- Device info (camera make/model, serial numbers)
- Timestamps (date taken, modified, digitized)
- Software info (editing software, processing history)
- Author/copyright data
- AI generation metadata

## Zero Quality Loss

MetaStrip operates directly on the file's binary structure, removing only metadata segments without touching image data. Your images are byte-for-byte identical in quality.

## Links

- [Website](https://metastrip.ai)
- [GitHub](https://github.com/ICXCNIKAanon/metastrip)
- [CLI](https://www.npmjs.com/package/@metastrip/cli)
