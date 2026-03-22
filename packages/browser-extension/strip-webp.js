// MetaStrip WebP Stripper — content script version
// Strips EXIF and XMP metadata chunks from WebP files
// Zero quality loss — binary surgery only

window.__metastrip = window.__metastrip || {};

// ---------------------------------------------------------------------------
// FourCC constants (as little-endian uint32 for fast comparison)
// ---------------------------------------------------------------------------

function _webpFourCC(s) {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

var _WEBP_CC_RIFF = _webpFourCC('RIFF');
var _WEBP_CC_WEBP = _webpFourCC('WEBP');

// Chunks to REMOVE
var _WEBP_CC_EXIF = _webpFourCC('EXIF');
var _WEBP_CC_XMP  = _webpFourCC('XMP ');

// Chunks to reference
var _WEBP_CC_VP8X = _webpFourCC('VP8X');
var _WEBP_CC_ICCP = _webpFourCC('ICCP');

// VP8X flags bit positions
var _WEBP_FLAG_EXIF_BIT = 4;
var _WEBP_FLAG_XMP_BIT  = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the buffer is a valid WebP file
 * (starts with "RIFF" + 4-byte size + "WEBP").
 */
window.__metastrip.isWebp = function(buffer) {
  if (buffer.byteLength < 12) return false;
  var view = new DataView(buffer);
  return (
    view.getUint32(0, true) === _WEBP_CC_RIFF &&
    view.getUint32(8, true) === _WEBP_CC_WEBP
  );
};

/**
 * Strips metadata chunks from a WebP binary buffer.
 *
 * Chunks removed: EXIF, XMP
 * Chunks preserved: VP8, VP8L, VP8X (flags patched), ALPH, ANIM, ANMF, ICCP
 *
 * After stripping, the VP8X flags byte is updated to clear EXIF (bit 4)
 * and XMP (bit 5), and the RIFF file size header is recalculated.
 *
 * @param {ArrayBuffer} buffer - Raw WebP bytes
 * @returns {ArrayBuffer} Stripped WebP bytes (zero quality loss)
 */
window.__metastrip.stripWebp = function(buffer) {
  if (!window.__metastrip.isWebp(buffer)) {
    throw new Error('Input is not a valid WebP: missing RIFF/WEBP header');
  }

  var src = new Uint8Array(buffer);
  var len = src.byteLength;

  // Collect byte ranges to keep as [start, end) pairs
  var chunks = [];
  chunks.push([0, 12]); // Always keep the 12-byte RIFF header

  // Track VP8X chunk position in source for identification
  var vp8xOutputOffset = -1;

  var offset = 12;

  while (offset < len) {
    // Each chunk needs at least 8 bytes: 4 FourCC + 4 size
    if (offset + 8 > len) {
      break;
    }

    var view = new DataView(buffer);
    var cc = view.getUint32(offset, true);
    var dataSize = view.getUint32(offset + 4, true);

    // Padded chunk size: if dataSize is odd, one padding byte follows
    var paddedDataSize = dataSize + (dataSize & 1);
    var chunkEnd = offset + 8 + paddedDataSize;

    if (chunkEnd > len) {
      // Chunk claims more bytes than remain — keep what's there
      chunks.push([offset, len]);
      break;
    }

    var keep = _webpShouldKeep(cc);

    if (keep) {
      chunks.push([offset, chunkEnd]);
    }

    offset = chunkEnd;
  }

  // Assemble output buffer
  var totalSize = 0;
  for (var i = 0; i < chunks.length; i++) {
    totalSize += chunks[i][1] - chunks[i][0];
  }

  var out = new Uint8Array(totalSize);
  var outOffset = 0;

  for (var i = 0; i < chunks.length; i++) {
    var start = chunks[i][0];
    var end = chunks[i][1];

    // Remember where VP8X lands in the output
    if (vp8xOutputOffset === -1 && start >= 12) {
      var srcView = new DataView(buffer);
      var srcCC = srcView.getUint32(start, true);
      if (srcCC === _WEBP_CC_VP8X) {
        vp8xOutputOffset = outOffset + 8;
      }
    }

    out.set(src.subarray(start, end), outOffset);
    outOffset += end - start;
  }

  // Update RIFF file size header: bytes 4-7 (LE) = total file size - 8
  var outView = new DataView(out.buffer);
  outView.setUint32(4, totalSize - 8, true);

  // Update VP8X flags: clear EXIF (bit 4) and XMP (bit 5)
  if (vp8xOutputOffset !== -1 && vp8xOutputOffset < out.byteLength) {
    var flagsByte = out[vp8xOutputOffset];
    var updated = flagsByte & ~((1 << _WEBP_FLAG_EXIF_BIT) | (1 << _WEBP_FLAG_XMP_BIT));
    out[vp8xOutputOffset] = updated;
  }

  return out.buffer;
};

/**
 * Returns true if the given chunk should be preserved.
 */
function _webpShouldKeep(cc) {
  // Strip EXIF and XMP metadata chunks
  if (cc === _WEBP_CC_EXIF) return false;
  if (cc === _WEBP_CC_XMP) return false;

  // All other chunks (VP8, VP8L, VP8X, ALPH, ANIM, ANMF, ICCP) are preserved
  return true;
}
