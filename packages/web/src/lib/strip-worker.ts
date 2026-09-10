/// <reference lib="webworker" />
import { stripMetadata } from "./stripper";
import { analyzeBuffer } from "./metadata";
import {
  getRandomFakeMetadata,
  formatFakeMetadataSummary,
  customToFakeMetadata,
} from "./fake-metadata";
import { injectFakeMetadataJpeg } from "./inject-jpeg";
import { injectFakeMetadataPng } from "./inject-png";
import { injectFakeMetadataWebp } from "./inject-webp";
import type { CustomMetadata } from "./fake-metadata";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = async (
  event: MessageEvent<{
    operation: "inspect" | "strip";
    buffer: ArrayBuffer;
    fileName: string;
    injectMode?: "off" | "random" | "custom";
    customMetadata?: CustomMetadata | null;
  }>,
) => {
  try {
    const { buffer, fileName, operation, injectMode, customMetadata } =
      event.data;
    if (operation === "inspect") {
      ctx.postMessage({
        success: true,
        analysis: await analyzeBuffer(buffer, fileName),
      });
      return;
    }
    const result = await stripMetadata(buffer, fileName);
    let injectedSummary: string | undefined;
    if (injectMode && injectMode !== "off") {
      const injectors = {
        jpeg: injectFakeMetadataJpeg,
        png: injectFakeMetadataPng,
        webp: injectFakeMetadataWebp,
      };
      const injector = injectors[result.format as keyof typeof injectors];
      if (injector) {
        const fake =
          injectMode === "custom" && customMetadata
            ? customToFakeMetadata(customMetadata)
            : getRandomFakeMetadata();
        result.buffer = injector(result.buffer, fake);
        result.strippedSize = result.buffer.byteLength;
        injectedSummary = formatFakeMetadataSummary(fake);
      }
    }
    // Inspect the actual output: never assume that every detected tag was removed.
    const analysis = await analyzeBuffer(result.buffer, fileName);
    ctx.postMessage(
      { success: true, ...result, analysis, injectedSummary },
      { transfer: [result.buffer] },
    );
  } catch (error) {
    ctx.postMessage({
      success: false,
      error:
        error instanceof Error ? error.message : "Could not process this file.",
    });
  }
};
