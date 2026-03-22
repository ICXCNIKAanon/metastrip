import { Hono } from 'hono';

const strip = new Hono();

// POST /v1/strip — Upload an image, get back the cleaned version
strip.post('/strip', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided. Send a file with the key "file".' }, 400);
  }

  // Check file type
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(file.type)) {
    return c.json({ error: `Unsupported type: ${file.type}. Supported: JPEG, PNG, WebP.` }, 400);
  }

  // Size limit: 50MB
  if (file.size > 50 * 1024 * 1024) {
    return c.json({ error: 'File too large. Maximum 50MB.' }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detect format and strip
    const { detectFormat } = await import('@metastrip/hooks');
    const format = detectFormat(buffer);

    if (!format) {
      return c.json({ error: 'Could not detect image format from file contents.' }, 400);
    }

    let result: { output: Buffer; categories: string[] };

    if (format === 'jpeg') {
      const { stripJpeg } = await import('@metastrip/hooks');
      result = stripJpeg(buffer);
    } else if (format === 'png') {
      const { stripPng } = await import('@metastrip/hooks');
      result = stripPng(buffer);
    } else {
      const { stripWebp } = await import('@metastrip/hooks');
      result = stripWebp(buffer);
    }

    const saved = buffer.length - result.output.length;

    // Return the cleaned file
    return new Response(new Uint8Array(result.output), {
      headers: {
        'Content-Type': file.type,
        'Content-Disposition': `attachment; filename="${file.name.replace(/\.(\w+)$/, '.cleaned.$1')}"`,
        'X-MetaStrip-Original-Size': String(buffer.length),
        'X-MetaStrip-Stripped-Size': String(result.output.length),
        'X-MetaStrip-Saved': String(saved),
        'X-MetaStrip-Categories': result.categories.join(', '),
      },
    });
  } catch (err) {
    return c.json({ error: `Processing failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

export { strip as stripRoute };
