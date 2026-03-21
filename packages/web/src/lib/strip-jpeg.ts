/**
 * JPEG binary metadata stripper.
 *
 * Removes EXIF (APP1), IPTC (APP13), XMP (also APP1), and comment (COM)
 * markers from a JPEG file by operating directly on the binary structure.
 * Image scan data is NEVER decoded or re-encoded — zero quality loss.
 *
 * JPEG structure:
 *   SOI (0xFFD8) → marker segments → SOS (0xFFDA) → scan data → EOI (0xFFD9)
 *
 * Marker segment layout (for markers with a payload):
 *   [0xFF][marker byte][length high][length low][...payload...]
 *   The length field is 2 bytes and INCLUDES the 2 length bytes themselves,
 *   but does NOT include the 2-byte marker prefix.
 *
 * Standalone markers (no length, no payload):
 *   SOI 0xFFD8, EOI 0xFFD9, RST0-RST7 (0xFFD0-0xFFD7)
 */

// ---------------------------------------------------------------------------
// Marker constants
// ---------------------------------------------------------------------------

const MARKER_SOI = 0xffd8; // Start of Image
const MARKER_EOI = 0xffd9; // End of Image
const MARKER_SOS = 0xffda; // Start of Scan — everything after is raw image data
const MARKER_APP0 = 0xffe0; // JFIF / JFXX — always keep
const MARKER_APP1 = 0xffe1; // EXIF / XMP — strip
const MARKER_APP2 = 0xffe2; // ICC color profile — keep by default
const MARKER_APP13 = 0xffed; // IPTC — strip
const MARKER_COM = 0xfffe; // Comment — strip

// RST markers: 0xFFD0 – 0xFFD7 (standalone, no length)
const RST_MIN = 0xffd0;
const RST_MAX = 0xffd7;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StripJpegOptions {
  /** When false, removes APP2 ICC profile data. Defaults to true. */
  preserveIcc?: boolean;
}

/**
 * Returns true if the buffer begins with the JPEG SOI marker (0xFF 0xD8).
 */
export function isJpeg(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;
  const view = new DataView(buffer);
  return view.getUint8(0) === 0xff && view.getUint8(1) === 0xd8;
}

/**
 * Strips metadata markers from a JPEG binary buffer.
 *
 * Markers removed by default:
 *   APP1 (0xFFE1) — EXIF, XMP
 *   APP3-APP12, APP14-APP15 — other APP markers that may contain metadata
 *   APP13 (0xFFED) — IPTC
 *   COM  (0xFFFE) — JPEG comments
 *
 * Markers always preserved:
 *   SOI  (0xFFD8) — required
 *   APP0 (0xFFE0) — JFIF/JFXX thumbnail data
 *   APP2 (0xFFE2) — ICC color profile (unless preserveIcc: false)
 *   DQT, DHT, SOF*, SOS, EOI, RST* — image coding markers
 *
 * @throws {Error} if the buffer is not a valid JPEG.
 */
export function stripJpeg(
  buffer: ArrayBuffer,
  options: StripJpegOptions = {}
): ArrayBuffer {
  const { preserveIcc = true } = options;

  if (!isJpeg(buffer)) {
    throw new Error('Input is not a valid JPEG: missing SOI marker (0xFFD8)');
  }

  const src = new Uint8Array(buffer);
  const len = src.byteLength;

  if (len < 4) {
    throw new Error('Input is too short to be a valid JPEG');
  }

  // Collect byte ranges to keep. We work with [start, end) pairs.
  const chunks: Array<[number, number]> = [];

  // SOI is always kept (bytes 0-1).
  chunks.push([0, 2]);

  let offset = 2; // Start parsing after SOI

  while (offset < len) {
    // Every marker must start with 0xFF.
    if (src[offset] !== 0xff) {
      throw new Error(
        `Invalid JPEG structure: expected 0xFF at offset ${offset}, got 0x${src[offset].toString(16).padStart(2, '0').toUpperCase()}`
      );
    }

    // Skip padding bytes (0xFF 0xFF ... is valid as filler before a marker).
    while (offset < len && src[offset] === 0xff) {
      offset++;
    }

    if (offset >= len) {
      throw new Error('Unexpected end of JPEG data while reading marker byte');
    }

    const markerByte = src[offset];
    offset++;

    const marker = (0xff00 | markerByte) >>> 0;

    // --- Standalone markers (no length field) ---
    if (
      marker === MARKER_SOI ||
      marker === MARKER_EOI ||
      (marker >= RST_MIN && marker <= RST_MAX)
    ) {
      // These are two bytes total: 0xFF + marker byte.
      // RST markers appear inside scan data, which we copy verbatim, so we
      // should never encounter them here during the header-parsing phase.
      // EOI: we are done — stop parsing (do not include EOI here; it will be
      // appended after scan data, or the scan data copy includes it).
      if (marker === MARKER_EOI) {
        // No scan data encountered yet but we hit EOI — keep it.
        chunks.push([offset - 2, offset]);
        break;
      }
      // RST / SOI in header phase — keep and continue (unusual but safe).
      chunks.push([offset - 2, offset]);
      continue;
    }

    // --- Markers with a length field ---
    if (offset + 1 >= len) {
      throw new Error(
        `Unexpected end of JPEG data reading length for marker 0x${marker.toString(16).toUpperCase()} at offset ${offset - 1}`
      );
    }

    const segmentLength = (src[offset] << 8) | src[offset + 1];
    if (segmentLength < 2) {
      throw new Error(
        `Invalid segment length ${segmentLength} for marker 0x${marker.toString(16).toUpperCase()} at offset ${offset - 1}`
      );
    }

    // segmentLength includes the 2 length bytes but not the 0xFF+marker prefix.
    const segmentEnd = offset + segmentLength; // exclusive
    if (segmentEnd > len) {
      throw new Error(
        `Segment for marker 0x${marker.toString(16).toUpperCase()} at offset ${offset - 1} claims length ${segmentLength} but only ${len - offset} bytes remain`
      );
    }

    // The full marker block (including 0xFF+marker prefix) is [offset-2, segmentEnd).
    const blockStart = offset - 2;
    const blockEnd = segmentEnd;

    // Advance past the segment.
    offset = segmentEnd;

    // --- SOS: copy everything from here (including scan data) verbatim ---
    if (marker === MARKER_SOS) {
      // Include SOS segment + all remaining bytes up to and including EOI.
      chunks.push([blockStart, len]);
      break;
    }

    // --- Decide whether to keep this marker ---
    const keep = shouldKeepMarker(marker, preserveIcc);

    if (keep) {
      chunks.push([blockStart, blockEnd]);
    }
    // else: skip this marker (metadata stripped)
  }

  // Assemble output buffer.
  const totalSize = chunks.reduce((acc, [s, e]) => acc + (e - s), 0);
  const out = new Uint8Array(totalSize);
  let outOffset = 0;
  for (const [start, end] of chunks) {
    out.set(src.subarray(start, end), outOffset);
    outOffset += end - start;
  }

  return out.buffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given marker should be preserved in the output.
 */
function shouldKeepMarker(marker: number, preserveIcc: boolean): boolean {
  // Always keep APP0 (JFIF/JFXX).
  if (marker === MARKER_APP0) return true;

  // APP2 (ICC) — kept unless caller opts out.
  if (marker === MARKER_APP2) return preserveIcc;

  // Strip APP1 (EXIF/XMP), APP13 (IPTC), COM (comments).
  if (marker === MARKER_APP1) return false;
  if (marker === MARKER_APP13) return false;
  if (marker === MARKER_COM) return false;

  // Strip other APP markers (APP3-APP12, APP14-APP15) that may contain metadata.
  const appMin = 0xffe0;
  const appMax = 0xffef;
  if (marker >= appMin && marker <= appMax) {
    // APP0 and APP2 already handled above; strip everything else in the range.
    return false;
  }

  // All other markers (DQT, DHT, SOF0-SOFn, DRI, DNL, etc.) are kept.
  return true;
}
