'use client';

import { useState, useRef, useCallback } from 'react';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB (videos can be large)
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Audio formats
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  // Video formats
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  // HEIC/HEIF image formats
  'image/heic',
  'image/heif',
  // AVIF image format
  'image/avif',
  // M4A/AAC audio
  'audio/mp4',
  'audio/x-m4a',
  // AVI video
  'video/x-msvideo',
  'video/avi',
  // MKV/WebM video
  'video/x-matroska',
  'video/webm',
  // EPUB ebook
  'application/epub+zip',
];
// Some browsers report Office files with application/zip or application/octet-stream,
// and audio/video files with application/octet-stream, so we accept by extension as a fallback.
const ACCEPTED_EXTENSIONS = ['.docx', '.xlsx', '.pptx', '.pdf', '.mp3', '.wav', '.flac', '.mp4', '.mov', '.m4v', '.m4a', '.aac', '.heic', '.heif', '.avif', '.avi', '.mkv', '.webm', '.epub'];
const ACCEPTED_ATTR = [...ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(',');

interface DropZoneProps {
  onFilesSelected: (files: Array<{ file: File; buffer: ArrayBuffer }>) => void;
}

export default function DropZone({ onFilesSelected }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingCount, setProcessingCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      setError(null);

      const files = Array.from(fileList);
      if (files.length === 0) return;

      // Validate all files first
      for (const file of files) {
        const lower = file.name.toLowerCase();
        const hasAcceptedExt = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
        if (!ACCEPTED_TYPES.includes(file.type) && !hasAcceptedExt) {
          setError(`Unsupported file type "${file.type}" on "${file.name}". Please upload JPEG, PNG, WebP, GIF, SVG, PDF, DOCX, XLSX, PPTX, MP3, WAV, FLAC, MP4, MOV, M4A, AVI, MKV, WebM, HEIC, HEIF, AVIF, or EPUB files.`);
          return;
        }
        if (file.size > MAX_FILE_SIZE) {
          setError(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 500 MB per file.`);
          return;
        }
      }

      setProcessingCount(files.length);

      // Read all files as ArrayBuffers
      const results: Array<{ file: File; buffer: ArrayBuffer }> = [];
      let completed = 0;
      let errored = false;

      for (const file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (errored) return;
          const buffer = e.target?.result;
          if (buffer instanceof ArrayBuffer) {
            results.push({ file, buffer });
            completed++;
            if (completed === files.length) {
              setProcessingCount(0);
              onFilesSelected(results);
            }
          }
        };
        reader.onerror = () => {
          if (errored) return;
          errored = true;
          setProcessingCount(0);
          setError(`Failed to read "${file.name}". Please try again.`);
        };
        reader.readAsArrayBuffer(file);
      }
    },
    [onFilesSelected],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) processFiles(files);
    },
    [processFiles],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) processFiles(files);
      // Reset input so the same files can be re-selected after clearing
      e.target.value = '';
    },
    [processFiles],
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const hasError = Boolean(error);
  const isProcessing = processingCount > 0;

  const containerClasses = [
    'border-2 border-dashed rounded-card p-12 bg-surface/50 transition-all duration-200 cursor-pointer select-none',
    hasError
      ? 'border-risk-critical bg-risk-critical/5'
      : isDragging
        ? 'border-primary bg-primary/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
        : 'border-border hover:border-primary/50 hover:bg-primary/5',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="w-full">
      {/* Hidden file input */}
      <label htmlFor="drop-zone-file-input" className="sr-only">
        Select files to strip metadata
      </label>
      <input
        id="drop-zone-file-input"
        ref={inputRef}
        type="file"
        accept={ACCEPTED_ATTR}
        multiple
        onChange={handleInputChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Drop target */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop files here to strip metadata, or press Enter to browse"
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={containerClasses}
      >
        <div className="flex flex-col items-center gap-4 text-center pointer-events-none">
          {/* Shield icon */}
          <span className="text-5xl leading-none select-none" aria-hidden="true">
            {isProcessing ? '' : ''}
          </span>

          {/* Primary message */}
          <div>
            <p
              className={`text-lg font-semibold mb-1 ${isDragging ? 'text-primary' : 'text-text-primary'}`}
            >
              {isProcessing
                ? `Processing ${processingCount} file${processingCount === 1 ? '' : 's'}...`
                : isDragging
                  ? 'Drop your files here'
                  : 'Drop images here or click to browse'}
            </p>
            {!isDragging && !isProcessing && (
              <p className="text-sm text-text-secondary">
                JPEG · PNG · WebP · GIF · SVG · PDF · DOCX · XLSX · PPTX · MP3 · WAV · FLAC · MP4 · MOV · M4A · AVI · MKV · WebM · HEIC · AVIF · EPUB
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-3 text-sm text-risk-critical flex items-center gap-1.5" role="alert">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
          </svg>
          {error}
        </p>
      )}

      {/* Trust indicators */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-text-tertiary">
        <span>Client-side</span>
        <span aria-hidden="true" className="text-border">·</span>
        <span>Instant</span>
        <span aria-hidden="true" className="text-border">·</span>
        <span>Free</span>
      </div>
    </div>
  );
}
