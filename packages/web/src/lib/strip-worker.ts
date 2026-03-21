/// <reference lib="webworker" />
import { stripMetadata } from './stripper';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const result = stripMetadata(event.data.buffer);
    ctx.postMessage(
      { success: true, ...result },
      { transfer: [result.buffer] }
    );
  } catch (err) {
    ctx.postMessage({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
