import { Hono } from 'hono';

const inspect = new Hono();

// POST /v1/inspect — Upload an image, get back metadata analysis
inspect.post('/inspect', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided. Send a file with the key "file".' }, 400);
  }

  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(file.type)) {
    return c.json({ error: `Unsupported type: ${file.type}. Supported: JPEG, PNG, WebP.` }, 400);
  }

  if (file.size > 50 * 1024 * 1024) {
    return c.json({ error: 'File too large. Maximum 50MB.' }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { detectFormat } = await import('@metastrip/hooks');
    const format = detectFormat(buffer);

    if (!format) {
      return c.json({ error: 'Could not detect image format.' }, 400);
    }

    // Strip to see what would be removed (compare sizes)
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

    const hasMetadata = buffer.length !== result.output.length;

    return c.json({
      file: {
        name: file.name,
        type: file.type,
        size: buffer.length,
        format,
      },
      metadata: {
        found: hasMetadata,
        categories: result.categories,
        bytesRemovable: buffer.length - result.output.length,
      },
      strippedSize: result.output.length,
    });
  } catch (err) {
    return c.json({ error: `Inspection failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

export { inspect as inspectRoute };
