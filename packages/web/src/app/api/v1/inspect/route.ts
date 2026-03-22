import { NextRequest, NextResponse } from 'next/server';
import { detectFormat } from '@/lib/stripper';
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

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum 50MB.' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const fileName = file.name;
    const format = detectFormat(buffer, fileName);

    if (!format) {
      return NextResponse.json(
        { error: 'Unsupported format.' },
        { status: 400 }
      );
    }

    // Strip to calculate what would be removed
    const result = await stripMetadata(buffer, fileName);
    const hasMetadata = buffer.byteLength !== result.buffer.byteLength;

    return NextResponse.json({
      file: {
        name: fileName,
        type: file.type,
        size: buffer.byteLength,
        format,
      },
      metadata: {
        found: hasMetadata,
        bytesRemovable: buffer.byteLength - result.buffer.byteLength,
      },
      strippedSize: result.buffer.byteLength,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Inspection failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
