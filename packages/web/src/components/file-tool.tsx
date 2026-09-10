"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import DropZone from "./drop-zone";
import { createSampleFile } from "@/lib/sample-file";
import ResultsPanel from "./results-panel";
import BeforeAfter, { type BatchResult } from "./before-after";
import type { FileAnalysis } from "@/lib/metadata";
import type { CustomMetadata } from "@/lib/fake-metadata";

type Phase = "idle" | "analyzing" | "results" | "stripping" | "done";
interface WorkerResult {
  success: boolean;
  error?: string;
  analysis: FileAnalysis;
  buffer: ArrayBuffer;
  strippedSize: number;
  injectedSummary?: string;
}
export default function FileTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [analyses, setAnalyses] = useState<FileAnalysis[]>([]);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [injectMode, setInjectMode] = useState<"off" | "random" | "custom">(
    "off",
  );
  const [customMetadata, setCustomMetadata] = useState<CustomMetadata | null>(
    null,
  );
  const active = useRef<{ cancel: () => void } | null>(null);
  const generation = useRef(0);
  const statusRef = useRef<HTMLDivElement>(null);
  const isBusy = phase === "analyzing" || phase === "stripping";
  useEffect(
    () => () => {
      generation.current++;
      active.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (phase === "results" || phase === "done") statusRef.current?.focus();
  }, [phase]);

  const process = useCallback(
    async (
      file: File,
      operation: "inspect" | "strip",
      run: number,
    ): Promise<WorkerResult> => {
      // Read and transfer only the current file. Retain File handles rather than copies of every buffer.
      const buffer = await file.arrayBuffer();
      if (run !== generation.current) throw new Error("Cancelled");
      return new Promise((resolve, reject) => {
        const worker = new Worker(
          new URL("../lib/strip-worker.ts", import.meta.url),
        );
        let timer: ReturnType<typeof setTimeout>;
        const finish = (result?: WorkerResult, error?: string) => {
          clearTimeout(timer);
          worker.terminate();
          active.current = null;
          if (error) reject(new Error(error));
          else resolve(result!);
        };
        active.current = { cancel: () => finish(undefined, "Cancelled") };
        timer = setTimeout(
          () =>
            finish(
              undefined,
              "Processing took too long. Try a smaller file or the local CLI.",
            ),
          120_000,
        );
        worker.onmessage = (event) => {
          const result = event.data as WorkerResult;
          if (result.success) finish(result);
          else finish(undefined, result.error ?? "Could not process the file.");
        };
        worker.onerror = () =>
          finish(
            undefined,
            "The file processor could not run. Reload and try again, or use the local CLI.",
          );
        worker.onmessageerror = () =>
          finish(
            undefined,
            "The file processor returned an unreadable result.",
          );
        try {
          worker.postMessage(
            {
              operation,
              buffer,
              fileName: file.name,
              injectMode,
              customMetadata,
            },
            { transfer: [buffer] },
          );
        } catch {
          finish(
            undefined,
            "Could not start the file processor. Try a smaller file.",
          );
        }
      });
    },
    [injectMode, customMetadata],
  );

  const reset = useCallback(() => {
    generation.current++;
    active.current?.cancel();
    setFiles([]);
    setAnalyses([]);
    setResults([]);
    setErrors([]);
    setProgress("");
    setPhase("idle");
    setInjectMode("off");
    setCustomMetadata(null);
  }, []);

  async function select(selected: File[]) {
    const run = ++generation.current;
    setPhase("analyzing");
    setErrors([]);
    setResults([]);
    const accepted: File[] = [];
    const inspected: FileAnalysis[] = [];
    const failures: string[] = [];
    for (const [index, file] of selected.entries()) {
      if (run !== generation.current) return;
      setProgress(
        `Inspecting ${index + 1} of ${selected.length}: ${file.name}`,
      );
      try {
        const result = await process(file, "inspect", run);
        accepted.push(file);
        inspected.push(result.analysis);
      } catch (error) {
        failures.push(
          `${file.name}: ${error instanceof Error ? error.message : "Could not inspect this file."}`,
        );
      }
    }
    if (run !== generation.current) return;
    setFiles(accepted);
    setAnalyses(inspected);
    setErrors(failures);
    setPhase(accepted.length ? "results" : "idle");
  }

  async function strip() {
    const run = ++generation.current;
    setPhase("stripping");
    setErrors([]);
    const completed: BatchResult[] = [];
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      if (run !== generation.current) return;
      setProgress(
        `Cleaning and checking ${index + 1} of ${files.length}: ${file.name}`,
      );
      try {
        const result = await process(file, "strip", run);
        completed.push({
          analysis: analyses[index],
          afterAnalysis: result.analysis,
          strippedBuffer: result.buffer,
          strippedSize: result.strippedSize,
          fileName: file.name,
          injectedSummary: result.injectedSummary,
        });
      } catch (error) {
        failures.push(
          `${file.name}: ${error instanceof Error ? error.message : "Could not clean this file."}`,
        );
      }
    }
    if (run !== generation.current) return;
    setResults(completed);
    setErrors(failures);
    setPhase(completed.length ? "done" : "results");
  }

  const canInject =
    files.length > 0 &&
    files.every((file) => /\.(jpe?g|png|webp)$/i.test(file.name));
  return (
    <div
      ref={statusRef}
      tabIndex={-1}
      className="scroll-mt-24"
      aria-label="Metadata removal tool"
    >
      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-5 p-4 border border-risk-critical/30 rounded-card text-sm"
        >
          <p className="font-semibold mb-2">
            Some files could not be processed. Your originals are unchanged.
          </p>
          <ul className="list-disc pl-5 text-text-secondary space-y-1">
            {errors.map((error, i) => (
              <li key={i} className="break-words">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}
      {phase === "idle" && (
        <>
          <DropZone onFilesSelected={select} />
          <div className="text-center mt-5">
            <button
              type="button"
              onClick={() => select([createSampleFile()])}
              className="text-sm text-accent underline underline-offset-4"
            >
              Try a sample file
            </button>
            <p className="text-xs text-text-secondary mt-2">
              See how it works with a synthetic photo.
            </p>
          </div>
        </>
      )}
      {isBusy && (
        <div className="text-center rounded-card border border-border bg-surface p-10">
          <div
            className="w-9 h-9 mx-auto mb-4 rounded-full border-2 border-primary/20 border-t-primary animate-spin"
            aria-hidden="true"
          />
          <p role="status" className="font-medium break-words">
            {progress}
          </p>
          <p className="text-sm text-text-secondary mt-3">
            Processing locally. Larger files can take longer.
          </p>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-accent underline mt-6"
          >
            Cancel and clear files
          </button>
        </div>
      )}
      {phase === "results" && (
        <>
          <ResultsPanel
            analyses={analyses}
            onStrip={strip}
            injectMode={injectMode}
            onInjectModeChange={canInject ? setInjectMode : undefined}
            customMetadata={customMetadata}
            onCustomMetadataChange={setCustomMetadata}
          />
          <p className="mt-4 text-xs text-text-secondary">
            The score reflects detected fields, not a guarantee of anonymity.
            Format-specific inspection and removal limits apply.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 text-sm text-accent underline"
          >
            Choose different files
          </button>
        </>
      )}
      {phase === "done" && <BeforeAfter results={results} onReset={reset} />}
    </div>
  );
}
