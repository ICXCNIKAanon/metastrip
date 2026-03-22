# @metastrip/api

REST API for MetaStrip — strip and inspect image metadata programmatically.

## Endpoints

### POST /v1/strip

Upload an image, receive the cleaned version with metadata removed.

```bash
curl -X POST https://api.metastrip.ai/v1/strip \
  -F file=@photo.jpg \
  -o photo.cleaned.jpg
```

Response headers include:
- `X-MetaStrip-Original-Size` — original file size
- `X-MetaStrip-Stripped-Size` — cleaned file size
- `X-MetaStrip-Saved` — bytes saved
- `X-MetaStrip-Categories` — metadata categories removed

### POST /v1/inspect

Upload an image, receive a JSON report of what metadata was found.

```bash
curl -X POST https://api.metastrip.ai/v1/inspect \
  -F file=@photo.jpg
```

## Running Locally

```bash
npm install
npm run dev
# API running on http://localhost:3001
```
