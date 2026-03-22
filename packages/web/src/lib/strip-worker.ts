/// <reference lib="webworker" />
import { stripMetadata } from './stripper';
import { getRandomFakeMetadata, formatFakeMetadataSummary } from './fake-metadata';
import { injectFakeMetadataJpeg } from './inject-jpeg';
import { injectFakeMetadataPng } from './inject-png';
import { injectFakeMetadataWebp } from './inject-webp';
import type { FakeMetadata } from './fake-metadata';
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
      // GIF and SVG do not support fake metadata injection — return as-is.
      return buffer;
  }
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; inject?: boolean }>) => {
  try {
    const result = stripMetadata(event.data.buffer);

    if (event.data.inject) {
      const fake = getRandomFakeMetadata();
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
