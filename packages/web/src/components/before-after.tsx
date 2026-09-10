"use client";
import { useState } from "react";
import type { FileAnalysis } from "@/lib/metadata";
import { cleanFileName, uniqueDownloadNames } from "@/lib/file-input";
import MetadataTable from "./metadata-table";
export interface BatchResult {
  analysis: FileAnalysis;
  afterAnalysis: FileAnalysis;
  strippedBuffer: ArrayBuffer;
  strippedSize: number;
  fileName: string;
  injectedSummary?: string;
}
function formatBytes(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), {
    href: url,
    download: fileName,
  });
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export default function BeforeAfter({
  results,
  onReset,
}: {
  results: BatchResult[];
  onReset: () => void;
}) {
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function downloadAll() {
    setZipping(true);
    setError(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const names = uniqueDownloadNames(
        results.map((result) => result.fileName),
      );
      // Fixed ZIP dates prevent archive entry timestamps from revealing file dates.
      results.forEach((result, index) =>
        zip.file(names[index], result.strippedBuffer, {
          date: new Date("1980-01-01T00:00:00Z"),
        }),
      );
      download(
        await zip.generateAsync({ type: "blob", compression: "STORE" }),
        "metastrip-cleaned.zip",
      );
    } catch {
      setError("Could not create the ZIP. Download files individually below.");
    } finally {
      setZipping(false);
    }
  }
  return (
    <div className="space-y-5">
      <div
        role="status"
        className="p-6 text-center rounded-card border border-primary/30 bg-primary/5"
      >
        <h2 className="text-2xl font-bold">
          {results.length === 1
            ? "Your cleaned file is ready"
            : `${results.length} cleaned files are ready`}
        </h2>
        <p className="text-sm text-text-secondary mt-2">
          Processed and inspected again on your device. Your original files are
          unchanged.
        </p>
      </div>
      {results.map((result, index) => (
        <article
          key={index}
          className="p-5 bg-surface border border-border rounded-card space-y-4"
        >
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div className="min-w-0">
              <h3 className="font-semibold break-all">{result.fileName}</h3>
              <p className="text-sm text-text-secondary mt-1">
                {formatBytes(result.analysis.fileSize)} →{" "}
                {formatBytes(result.strippedSize)}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                download(
                  new Blob([result.strippedBuffer], {
                    type: "application/octet-stream",
                  }),
                  cleanFileName(result.fileName),
                )
              }
              className="rounded-button px-4 py-3 bg-primary text-bg font-bold text-sm"
            >
              Download cleaned file
            </button>
          </div>
          {result.afterAnalysis.inspectionNote ? (
            <p className="text-sm text-text-secondary">
              {result.afterAnalysis.inspectionNote}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-input border border-border">
                <p className="text-xs text-text-secondary">
                  Detected risk before
                </p>
                <p className="text-2xl font-bold mt-1">
                  {result.analysis.riskScore}
                  <span className="text-xs font-normal text-text-secondary">
                    {" "}
                    / 100
                  </span>
                </p>
              </div>
              <div className="p-4 rounded-input border border-border">
                <p className="text-xs text-text-secondary">
                  Detected risk after
                </p>
                <p className="text-2xl font-bold mt-1">
                  {result.afterAnalysis.riskScore}
                  <span className="text-xs font-normal text-text-secondary">
                    {" "}
                    / 100
                  </span>
                </p>
              </div>
            </div>
          )}
          {result.injectedSummary && (
            <p className="text-sm text-accent">
              Decoy data added: {result.injectedSummary}. These replacement
              fields appear in the after-inspection.
            </p>
          )}
          {result.afterAnalysis.entries.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-accent">
                Review {result.afterAnalysis.entries.length} fields detected in
                the output
              </summary>
              <div className="mt-4">
                <MetadataTable
                  entries={result.afterAnalysis.entries}
                  byCategory={result.afterAnalysis.byCategory}
                />
              </div>
            </details>
          )}
        </article>
      ))}
      <p className="text-xs text-text-secondary leading-relaxed">
        Removal targets supported metadata, not visible content or every
        possible hidden field. Color and rendering information may remain.
        Review the downloaded file before sharing; some formats have limited
        inspection.{" "}
        <a href="/docs#browser-limits" className="text-accent underline">
          Read format limits.
        </a>
      </p>
      {error && (
        <p role="alert" className="text-sm text-risk-critical">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {results.length > 1 && (
          <button
            type="button"
            disabled={zipping}
            onClick={downloadAll}
            className="px-5 py-3 rounded-button bg-primary text-bg font-bold disabled:opacity-50"
          >
            {zipping
              ? "Creating ZIP…"
              : `Download all as ZIP (${results.length})`}
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className="px-5 py-3 rounded-button border border-border font-semibold"
        >
          Clear files and start again
        </button>
      </div>
    </div>
  );
}
