export const MAX_FILE_SIZE = 500 * 1024 * 1024;
export const MAX_BATCH_SIZE = 500 * 1024 * 1024;
export const MAX_BATCH_FILES = 50;
export const FILE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "svg",
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "mp3",
  "wav",
  "flac",
  "mp4",
  "mov",
  "m4v",
  "m4a",
  "avi",
  "mkv",
  "webm",
  "epub",
];
export const FILE_ACCEPT = FILE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
export function validateFiles(
  files: ReadonlyArray<Pick<File, "name" | "size">>,
): string | null {
  if (!files.length) return null;
  if (files.length > MAX_BATCH_FILES)
    return `Choose up to ${MAX_BATCH_FILES} files at a time.`;
  for (const file of files) {
    if (/\.(heic|heif|avif)$/i.test(file.name)) return 'HEIC/AVIF image-item cleaning is not available in this browser tool yet. Use a format-aware local editor; your original is unchanged.';
    if (
      !FILE_EXTENSIONS.includes(file.name.split(".").pop()?.toLowerCase() ?? "")
    )
      return `“${file.name}” is not a supported file format. See the supported formats below.`;
    if (file.size === 0)
      return `“${file.name}” is empty. Choose a file with content.`;
    if (file.size > MAX_FILE_SIZE)
      return `“${file.name}” exceeds the 500 MB file limit.`;
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_SIZE)
    return "This batch exceeds 500 MB. Choose fewer files to keep processing responsive.";
  return null;
}
export function cleanFileName(name: string): string {
  const safe = name.replace(/[\\/\x00-\x1f]/g, "_");
  const dot = safe.lastIndexOf(".");
  return dot > 0
    ? `${safe.slice(0, dot)}.cleaned${safe.slice(dot)}`
    : `${safe}.cleaned`;
}
export function uniqueDownloadNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = cleanFileName(name);
    let candidate = base;
    let count = 2;
    const dot = base.lastIndexOf(".");
    while (used.has(candidate.toLowerCase())) {
      candidate =
        dot > 0
          ? `${base.slice(0, dot)}-${count++}${base.slice(dot)}`
          : `${base}-${count++}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
