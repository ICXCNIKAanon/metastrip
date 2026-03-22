import { NextRequest, NextResponse } from 'next/server';
import { stripMetadata } from '@/lib/stripper';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided. Send a file with the key "file".' },
        { status: 400 }
      );
    }

    // Size limit: 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum 50MB.' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const fileName = file.name;

    const result = await stripMetadata(buffer, fileName);

    const originalSize = buffer.byteLength;
    const strippedSize = result.buffer.byteLength;

    return new NextResponse(result.buffer, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName.replace(/\.(\w+)$/, '.cleaned.$1')}"`,
        'X-MetaStrip-Format': result.format,
        'X-MetaStrip-Original-Size': String(originalSize),
        'X-MetaStrip-Stripped-Size': String(strippedSize),
        'X-MetaStrip-Saved': String(originalSize - strippedSize),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Processing failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
