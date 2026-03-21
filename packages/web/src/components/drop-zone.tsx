'use client';

import { useState, useRef, useCallback } from 'react';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_ATTR = ACCEPTED_TYPES.join(',');

interface DropZoneProps {
  onFileSelected: (file: File, buffer: ArrayBuffer) => void;
}

export default function DropZone({ onFileSelected }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`Unsupported file type "${file.type}". Please upload a JPEG, PNG, or WebP image.`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 100 MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result;
        if (buffer instanceof ArrayBuffer) {
          onFileSelected(file, buffer);
        }
      };
      reader.onerror = () => {
        setError('Failed to read the file. Please try again.');
      };
      reader.readAsArrayBuffer(file);
    },
    [onFileSelected],
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
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so the same file can be re-selected after clearing
      e.target.value = '';
    },
    [processFile],
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const hasError = Boolean(error);

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
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_ATTR}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Drop target */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop image here or click to browse"
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
            🛡️
          </span>

          {/* Primary message */}
          <div>
            <p
              className={`text-lg font-semibold mb-1 ${isDragging ? 'text-primary' : 'text-text-primary'}`}
            >
              {isDragging ? 'Drop your file here' : 'Drop image here or click to browse'}
            </p>
            {!isDragging && (
              <p className="text-sm text-text-secondary">
                JPEG · PNG · WebP
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
        <span>🔒 Client-side</span>
        <span aria-hidden="true" className="text-border">·</span>
        <span>⚡ Instant</span>
        <span aria-hidden="true" className="text-border">·</span>
        <span>🆓 Free</span>
      </div>
    </div>
  );
}
