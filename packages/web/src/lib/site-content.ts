export const HOME_DESCRIPTION =
  "Inspect and remove metadata from images, documents, audio and video in your browser. Free, no signup, no file uploads. Batch cleaning and ZIP downloads.";
export const FAQ_ITEMS = [
  {
    question: "What is MetaStrip?",
    answer:
      "MetaStrip is a free browser tool for inspecting and removing supported metadata from images, documents, audio and video. File processing runs locally on your device. You can clean a single file or a batch and download the results without an account.",
  },
  {
    question: "Do my files get uploaded?",
    answer:
      "No. The web tool reads, inspects and cleans files in your browser using Web Workers. File contents and extracted metadata are not sent to MetaStrip. Opening an optional external map link shares the displayed coordinates with that map provider. The website uses basic page analytics.",
  },
  {
    question: "Which formats can I clean?",
    answer:
      "The browser tool accepts JPEG, PNG, WebP, GIF, SVG, PDF, DOCX, XLSX, PPTX, EPUB, MP3, WAV, FLAC, M4A, MP4, MOV, AVI and MKV/WebM. Inspection depth and removal coverage vary by format. HEIC/AVIF image-item cleaning is currently unavailable to prevent file corruption. See the format guide for limitations.",
  },
  {
    question: "How do I remove GPS location from a photo?",
    answer:
      "Choose a JPEG, PNG or WebP photo, review the detected metadata, then select Remove supported metadata. Download the cleaned copy and review the after-inspection. Your original file is unchanged. Location may also be visible in the photo itself, which metadata removal does not change.",
  },
  {
    question: "Does cleaning reduce image quality?",
    answer:
      "Image metadata is removed without recompressing the encoded image data. Color profiles are preserved by default for JPEG, PNG and WebP. Removing orientation or other rendering metadata can change how some files display, so check the downloaded copy before sharing.",
  },
  {
    question: "Does a zero risk score mean a file is anonymous?",
    answer:
      "No. The score only reflects fields the inspector detected. It does not analyze visible faces, text, document contents, every embedded object or all possible metadata. Some formats have limited inspection. Metadata cleaning is not content redaction or malware scanning.",
  },
  {
    question: "Can I clean multiple files at once?",
    answer:
      "Yes. Choose up to 50 files with a combined size of up to 500 MB. Files are processed one at a time on your device. Download successful results individually or together in a ZIP; a failed file does not discard the other results.",
  },
];
export const FORMAT_GROUPS = [
  {
    name: "Everyday images",
    formats: "JPEG · PNG · WebP",
    details:
      "EXIF, XMP and supported text fields. Color profiles preserved by default. No image recompression.",
  },
  {
    name: "Other images",
    formats: "GIF · SVG",
    details:
      "Format-specific metadata removal. Detailed inspection is limited. HEIC/AVIF image-item cleaning is unavailable. SVG cleaning is not active-content sanitization.",
  },
  {
    name: "Documents & ebooks",
    formats: "PDF · DOCX · XLSX · PPTX · EPUB",
    details:
      "Supported document properties and metadata. PDF coverage is limited to readable fields; not document redaction.",
  },
  {
    name: "Audio & video",
    formats: "MP3 · WAV · FLAC · M4A · MP4 · MOV · AVI · MKV / WebM",
    details:
      "Supported container tags. Encoded media is not recompressed. Embedded streams and some fields may remain.",
  },
];
