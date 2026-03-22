/**
 * WebP fake metadata injection via XMP chunk in the RIFF container.
 *
 * Injects an "XMP " chunk containing fake XMP XML with decoy GPS coordinates,
 * device info, and timestamps. Appended to the end of the RIFF container and
 * the RIFF file size header is updated accordingly.
 *
 * If a VP8X chunk is present, its XMP flag (bit 5) is set.
 *
 * This is a privacy tool: the fake data uses obviously retro devices and
 * famous landmarks so it's clearly decoy data, not deception.
 */

import type { FakeMetadata } from './fake-metadata';

// ---------------------------------------------------------------------------
// FourCC helpers
// ---------------------------------------------------------------------------

function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>> 0
  );
}

const CC_VP8X = fourCC('VP8X');
const FLAG_XMP_BIT = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Injects fake XMP metadata into a clean WebP buffer.
 *
 * @param buffer  A stripped WebP (must start with RIFF...WEBP)
 * @param fake    The fake metadata values to inject
 * @returns       A new ArrayBuffer with the fake XMP chunk appended
 */
export function injectFakeMetadataWebp(
  buffer: ArrayBuffer,
  fake: FakeMetadata,
): ArrayBuffer {
  const src = new Uint8Array(buffer);

  // Validate WebP header
  const view = new DataView(buffer);
  if (src.length < 12) {
    throw new Error('Not a valid WebP: too short');
  }

  const riffMagic = view.getUint32(0, true);
  const webpMagic = view.getUint32(8, true);
  if (riffMagic !== fourCC('RIFF') || webpMagic !== fourCC('WEBP')) {
    throw new Error('Not a valid WebP: missing RIFF/WEBP header');
  }

  // Build the XMP chunk data
  const xmpXml = buildXmpXml(fake);
  const xmpBytes = new TextEncoder().encode(xmpXml);

  // Build "XMP " RIFF chunk: FourCC(4) + size(4) + data + optional pad byte
  const xmpChunkDataSize = xmpBytes.length;
  const paddedSize = xmpChunkDataSize + (xmpChunkDataSize & 1); // pad to even
  const xmpChunk = new Uint8Array(8 + paddedSize);
  const xmpView = new DataView(xmpChunk.buffer);

  // "XMP " FourCC
  xmpChunk[0] = 0x58; // X
  xmpChunk[1] = 0x4d; // M
  xmpChunk[2] = 0x50; // P
  xmpChunk[3] = 0x20; // space
  // Size (LE)
  xmpView.setUint32(4, xmpChunkDataSize, true);
  // Data
  xmpChunk.set(xmpBytes, 8);
  // Pad byte is already 0x00 from Uint8Array initialization

  // Assemble: original file + XMP chunk
  const totalSize = src.length + xmpChunk.length;

  // Bounds check: guard against integer overflow or unreasonable sizes
  const MAX_OUTPUT_SIZE = 100 * 1024 * 1024; // 100 MB
  if (!Number.isSafeInteger(totalSize) || totalSize < 0 || totalSize > MAX_OUTPUT_SIZE) {
    throw new Error(`Output size ${totalSize} exceeds safe bounds for WebP injection`);
  }
  const out = new Uint8Array(totalSize);
  out.set(src, 0);
  out.set(xmpChunk, src.length);

  // Update RIFF file size header (bytes 4-7, LE) = total - 8
  const outView = new DataView(out.buffer);
  outView.setUint32(4, totalSize - 8, true);

  // Update VP8X flags if present: set XMP bit (bit 5)
  const vp8xDataOffset = findVp8xDataOffset(out);
  if (vp8xDataOffset !== -1) {
    out[vp8xDataOffset] = out[vp8xDataOffset] | (1 << FLAG_XMP_BIT);
  }

  return out.buffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Finds the byte offset of the VP8X chunk's data (the flags byte) in the file.
 * Returns -1 if no VP8X chunk is found.
 */
function findVp8xDataOffset(data: Uint8Array): number {
  if (data.length < 12) return -1;

  let offset = 12; // after RIFF header
  const view = new DataView(data.buffer);

  while (offset + 8 <= data.length) {
    const cc = view.getUint32(offset, true);
    const chunkSize = view.getUint32(offset + 4, true);

    if (cc === CC_VP8X) {
      // VP8X data starts at offset + 8
      return offset + 8;
    }

    const paddedChunkSize = chunkSize + (chunkSize & 1);
    offset += 8 + paddedChunkSize;
  }

  return -1;
}

/**
 * Converts a decimal degree to XMP DMS format.
 */
function decimalToDmsXmp(decimal: number, isLat: boolean): string {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const direction = isLat
    ? (decimal >= 0 ? 'N' : 'S')
    : (decimal >= 0 ? 'E' : 'W');
  return `${degrees},${minutes.toFixed(4)}${direction}`;
}

/**
 * Builds the XMP XML string with fake metadata.
 */
function buildXmpXml(fake: FakeMetadata): string {
  const latXmp = decimalToDmsXmp(fake.gps.lat, true);
  const lonXmp = decimalToDmsXmp(fake.gps.lon, false);
  const dateIso = fake.dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');

  return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:exif="http://ns.adobe.com/exif/1.0/"
      xmlns:tiff="http://ns.adobe.com/tiff/1.0/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      exif:GPSLatitude="${latXmp}"
      exif:GPSLongitude="${lonXmp}"
      tiff:Make="${fake.device.make}"
      tiff:Model="${fake.device.model}"
      xmp:CreateDate="${dateIso}"
    />
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
