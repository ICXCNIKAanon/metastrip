/// <reference lib="webworker" />
import { stripMetadata } from './stripper';
import { getRandomFakeMetadata, formatFakeMetadataSummary, customToFakeMetadata } from './fake-metadata';
import { injectFakeMetadataJpeg } from './inject-jpeg';
import { injectFakeMetadataPng } from './inject-png';
import { injectFakeMetadataWebp } from './inject-webp';
import type { FakeMetadata, CustomMetadata } from './fake-metadata';
import type { SupportedFormat } from './stripper';

function injectByFormat(
  buffer: ArrayBuffer,
  format: SupportedFormat,
  fake: FakeMetadata,
): ArrayBuffer {
  switch (format) {
    case 'jpeg':
      return injectFakeMetadataJpeg(buffer, fake);
    case 'png':
      return injectFakeMetadataPng(buffer, fake);
    case 'webp':
      return injectFakeMetadataWebp(buffer, fake);
    case 'gif':
    case 'svg':
    case 'pdf':
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'mp4':
    case 'mov':
    case 'heic':
    case 'avif':
      // Office, PDF, audio, video, and binary formats do not support fake metadata injection — return as-is.
      return buffer;
  }
}

interface WorkerMessage {
  buffer: ArrayBuffer;
  inject?: boolean;
  injectMode?: 'off' | 'random' | 'custom';
  customMetadata?: CustomMetadata | null;
  fileName?: string;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  try {
    const { inject, injectMode, customMetadata } = event.data;
    const result = await stripMetadata(event.data.buffer, event.data.fileName);

    if (inject) {
      let fake: FakeMetadata;

      if (injectMode === 'custom' && customMetadata) {
        fake = customToFakeMetadata(customMetadata);
      } else {
        fake = getRandomFakeMetadata();
      }

      const injected = injectByFormat(result.buffer, result.format, fake);
      ctx.postMessage(
        {
          success: true,
          ...result,
          buffer: injected,
          strippedSize: injected.byteLength,
          injectedSummary: formatFakeMetadataSummary(fake),
        },
        { transfer: [injected] },
      );
    } else {
      ctx.postMessage(
        { success: true, ...result },
        { transfer: [result.buffer] },
      );
    }
  } catch (err) {
    ctx.postMessage({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
