"use client";
import { useRef, useState } from "react";
import { FILE_ACCEPT, validateFiles } from "@/lib/file-input";
export default function DropZone({
  onFilesSelected,
}: {
  onFilesSelected: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function select(files: File[]) {
    const problem = validateFiles(files);
    setError(problem);
    if (!problem && files.length) onFilesSelected(files);
  }
  return (
    <div>
      <input
        ref={input}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose files to inspect"
        onChange={(event) => {
          select(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          select(Array.from(event.dataTransfer.files));
        }}
        aria-describedby="file-limits"
        className={`w-full border-2 border-dashed rounded-card px-6 py-10 md:py-14 text-center transition-colors ${dragging ? "border-primary bg-primary/10" : "border-primary/40 bg-surface hover:border-primary hover:bg-primary/5"}`}
      >
        <svg
          className="mx-auto mb-5 h-10 w-10 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M12 3v12m-4-8 4-4 4 4M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
        </svg>
        <span className="block text-xl font-semibold">
          {dragging
            ? "Drop files to inspect"
            : "Choose files or drop them here"}
        </span>
        <span className="block text-sm text-text-secondary mt-3">
          Images, documents, audio &amp; video
        </span>
        <span className="inline-block mt-6 px-5 py-2.5 rounded-button bg-primary text-bg font-bold text-sm">
          Choose files
        </span>
      </button>
      <p
        id="file-limits"
        className="mt-4 text-center text-xs text-text-secondary"
      >
        Up to 50 files · 500 MB per batch · No uploads · No signup
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-risk-critical">
          {error}
        </p>
      )}
    </div>
  );
}
