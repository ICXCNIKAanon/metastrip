/**
 * JPEG fake metadata injection via XMP (APP1) and COM markers.
 *
 * Injects a fake APP1 marker with XMP XML containing decoy GPS coordinates,
 * device info, and timestamps — plus a COM marker with a human-readable
 * comment. Injected after the SOI marker (before the first existing marker).
 *
 * This is a privacy tool: the fake data uses obviously retro devices and
 * famous landmarks so it's clearly decoy data, not deception.
 */

import type { FakeMetadata } from './fake-metadata';

// ---------------------------------------------------------------------------
// XMP namespace identifier (required prefix for APP1 XMP segments)
// ---------------------------------------------------------------------------

const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Injects fake XMP metadata into a clean JPEG buffer.
 *
 * @param buffer  A stripped JPEG (must start with SOI 0xFFD8)
 * @param fake    The fake metadata values to inject
 * @returns       A new ArrayBuffer with the fake metadata inserted
 */
export function injectFakeMetadataJpeg(
  buffer: ArrayBuffer,
  fake: FakeMetadata,
): ArrayBuffer {
  const src = new Uint8Array(buffer);

  if (src.length < 2 || src[0] !== 0xff || src[1] !== 0xd8) {
    throw new Error('Not a valid JPEG: missing SOI marker');
  }

  // Build the COM marker payload
  const comPayload = buildComPayload(fake);
  const comSegment = buildMarkerSegment(0xfe, comPayload);

  // Build the APP1/XMP marker payload
  const xmpPayload = buildXmpPayload(fake);
  const app1Segment = buildMarkerSegment(0xe1, xmpPayload);

  // Assemble: SOI + COM + APP1/XMP + rest of file after SOI
  const restOfFile = src.subarray(2); // everything after SOI
  const totalSize = 2 + comSegment.length + app1Segment.length + restOfFile.length;

  // Bounds check: guard against integer overflow or unreasonable sizes
  const MAX_OUTPUT_SIZE = 100 * 1024 * 1024; // 100 MB
  if (!Number.isSafeInteger(totalSize) || totalSize < 0 || totalSize > MAX_OUTPUT_SIZE) {
    throw new Error(`Output size ${totalSize} exceeds safe bounds for JPEG injection`);
  }

  const out = new Uint8Array(totalSize);
  let offset = 0;

  // SOI
  out[0] = 0xff;
  out[1] = 0xd8;
  offset = 2;

  // COM segment
  out.set(comSegment, offset);
  offset += comSegment.length;

  // APP1/XMP segment
  out.set(app1Segment, offset);
  offset += app1Segment.length;

  // Rest of file
  out.set(restOfFile, offset);

  return out.buffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a JPEG marker segment: 0xFF + markerByte + 2-byte length + payload.
 * Length includes the 2 length bytes but not the 0xFF+marker prefix.
 */
function buildMarkerSegment(markerByte: number, payload: Uint8Array): Uint8Array {
  const length = 2 + payload.length; // length field includes itself
  const segment = new Uint8Array(2 + length);
  segment[0] = 0xff;
  segment[1] = markerByte;
  segment[2] = (length >> 8) & 0xff;
  segment[3] = length & 0xff;
  segment.set(payload, 4);
  return segment;
}

/**
 * Builds a COM marker payload string with fake device/software info.
 */
function buildComPayload(fake: FakeMetadata): Uint8Array {
  const text = `Shot on ${fake.device.make} ${fake.device.model} | ${fake.dateTime}`;
  return new TextEncoder().encode(text);
}

/**
 * Converts a decimal degree to XMP DMS format: "D,M.mmmmS" with direction.
 * E.g. 48.8584 -> "48,51.504N" for latitude.
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
 * Builds the XMP XML payload with the XMP namespace identifier prefix.
 */
function buildXmpPayload(fake: FakeMetadata): Uint8Array {
  const latXmp = decimalToDmsXmp(fake.gps.lat, true);
  const lonXmp = decimalToDmsXmp(fake.gps.lon, false);

  // Format date for XMP (ISO 8601): "YYYY-MM-DDTHH:MM:SS"
  // Input is "YYYY:MM:DD HH:MM:SS" (EXIF format)
  const dateIso = fake.dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');

  const xmpXml = `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
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

  // The APP1 XMP payload starts with the namespace identifier string
  const nsBytes = new TextEncoder().encode(XMP_NS);
  const xmlBytes = new TextEncoder().encode(xmpXml);

  const payload = new Uint8Array(nsBytes.length + xmlBytes.length);
  payload.set(nsBytes, 0);
  payload.set(xmlBytes, nsBytes.length);

  return payload;
}
