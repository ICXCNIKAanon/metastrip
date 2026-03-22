// MetaStrip JPEG Stripper — content script version
// Strips EXIF, IPTC, XMP, and comments from JPEG files
// Zero quality loss — binary surgery only

window.__metastrip = window.__metastrip || {};

// ---------------------------------------------------------------------------
// Marker constants
// ---------------------------------------------------------------------------

var _JPEG_MARKER_SOI = 0xffd8;
var _JPEG_MARKER_EOI = 0xffd9;
var _JPEG_MARKER_SOS = 0xffda;
var _JPEG_MARKER_APP0 = 0xffe0;
var _JPEG_MARKER_APP1 = 0xffe1;
var _JPEG_MARKER_APP2 = 0xffe2;
var _JPEG_MARKER_APP13 = 0xffed;
var _JPEG_MARKER_COM = 0xfffe;
var _JPEG_RST_MIN = 0xffd0;
var _JPEG_RST_MAX = 0xffd7;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the buffer begins with the JPEG SOI marker (0xFF 0xD8).
 */
window.__metastrip.isJpeg = function(buffer) {
  if (buffer.byteLength < 2) return false;
  var view = new Uint8Array(buffer);
  return view[0] === 0xff && view[1] === 0xd8;
};

/**
 * Strips metadata markers from a JPEG binary buffer.
 *
 * Markers removed: APP1 (EXIF/XMP), APP3-APP12, APP13 (IPTC), APP14-APP15, COM
 * Markers preserved: SOI, APP0 (JFIF), APP2 (ICC), DQT, DHT, SOF*, SOS, EOI, RST*
 *
 * @param {ArrayBuffer} buffer - Raw JPEG bytes
 * @returns {ArrayBuffer} Stripped JPEG bytes (zero quality loss)
 */
window.__metastrip.stripJpeg = function(buffer) {
  if (!window.__metastrip.isJpeg(buffer)) {
    throw new Error('Input is not a valid JPEG: missing SOI marker (0xFFD8)');
  }

  var src = new Uint8Array(buffer);
  var len = src.byteLength;

  if (len < 4) {
    throw new Error('Input is too short to be a valid JPEG');
  }

  // Collect byte ranges to keep as [start, end) pairs
  var chunks = [];

  // SOI is always kept (bytes 0-1)
  chunks.push([0, 2]);

  var offset = 2;

  while (offset < len) {
    // Every marker must start with 0xFF
    if (src[offset] !== 0xff) {
      throw new Error(
        'Invalid JPEG structure: expected 0xFF at offset ' + offset +
        ', got 0x' + src[offset].toString(16).toUpperCase()
      );
    }

    // Skip padding bytes (0xFF 0xFF... is valid filler before a marker)
    while (offset < len && src[offset] === 0xff) {
      offset++;
    }

    if (offset >= len) {
      throw new Error('Unexpected end of JPEG data while reading marker byte');
    }

    var markerByte = src[offset];
    offset++;

    var marker = (0xff00 | markerByte) >>> 0;

    // --- Standalone markers (no length field) ---
    if (
      marker === _JPEG_MARKER_SOI ||
      marker === _JPEG_MARKER_EOI ||
      (marker >= _JPEG_RST_MIN && marker <= _JPEG_RST_MAX)
    ) {
      if (marker === _JPEG_MARKER_EOI) {
        chunks.push([offset - 2, offset]);
        break;
      }
      chunks.push([offset - 2, offset]);
      continue;
    }

    // --- Markers with a length field ---
    if (offset + 1 >= len) {
      throw new Error(
        'Unexpected end of JPEG data reading length for marker 0x' +
        marker.toString(16).toUpperCase() + ' at offset ' + (offset - 1)
      );
    }

    var segmentLength = (src[offset] << 8) | src[offset + 1];
    if (segmentLength < 2) {
      throw new Error(
        'Invalid segment length ' + segmentLength + ' for marker 0x' +
        marker.toString(16).toUpperCase() + ' at offset ' + (offset - 1)
      );
    }

    var segmentEnd = offset + segmentLength;
    if (segmentEnd > len) {
      throw new Error(
        'Segment for marker 0x' + marker.toString(16).toUpperCase() +
        ' at offset ' + (offset - 1) + ' claims length ' + segmentLength +
        ' but only ' + (len - offset) + ' bytes remain'
      );
    }

    var blockStart = offset - 2;
    var blockEnd = segmentEnd;

    offset = segmentEnd;

    // --- SOS: copy everything from here (including scan data) verbatim ---
    if (marker === _JPEG_MARKER_SOS) {
      chunks.push([blockStart, len]);
      break;
    }

    // --- Decide whether to keep this marker ---
    var keep = _jpegShouldKeep(marker);

    if (keep) {
      chunks.push([blockStart, blockEnd]);
    }
  }

  // Assemble output buffer
  var totalSize = 0;
  for (var i = 0; i < chunks.length; i++) {
    totalSize += chunks[i][1] - chunks[i][0];
  }

  var out = new Uint8Array(totalSize);
  var outOffset = 0;
  for (var i = 0; i < chunks.length; i++) {
    out.set(src.subarray(chunks[i][0], chunks[i][1]), outOffset);
    outOffset += chunks[i][1] - chunks[i][0];
  }

  return out.buffer;
};

/**
 * Returns true if the given marker should be preserved.
 */
function _jpegShouldKeep(marker) {
  // Always keep APP0 (JFIF/JFXX)
  if (marker === _JPEG_MARKER_APP0) return true;

  // APP2 (ICC) — always keep
  if (marker === _JPEG_MARKER_APP2) return true;

  // Strip APP1 (EXIF/XMP), APP13 (IPTC), COM (comments)
  if (marker === _JPEG_MARKER_APP1) return false;
  if (marker === _JPEG_MARKER_APP13) return false;
  if (marker === _JPEG_MARKER_COM) return false;

  // Strip other APP markers (APP3-APP12, APP14-APP15) that may contain metadata
  var appMin = 0xffe0;
  var appMax = 0xffef;
  if (marker >= appMin && marker <= appMax) {
    return false;
  }

  // All other markers (DQT, DHT, SOF0-SOFn, DRI, DNL, etc.) are kept
  return true;
}
