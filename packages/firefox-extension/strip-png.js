// MetaStrip PNG Stripper — content script version
// Strips tEXt, iTXt, zTXt, and eXIf chunks from PNG files
// Zero quality loss — binary surgery only

window.__metastrip = window.__metastrip || {};

// ---------------------------------------------------------------------------
// PNG signature
// ---------------------------------------------------------------------------

var _PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// ---------------------------------------------------------------------------
// Chunk type constants (as big-endian uint32 for fast comparison)
// ---------------------------------------------------------------------------

function _pngTypeCode(s) {
  return (
    ((s.charCodeAt(0) << 24) |
      (s.charCodeAt(1) << 16) |
      (s.charCodeAt(2) << 8) |
      s.charCodeAt(3)) >>>
    0
  );
}

// Chunks to REMOVE (metadata)
var _PNG_TYPE_tEXt = _pngTypeCode('tEXt');
var _PNG_TYPE_iTXt = _pngTypeCode('iTXt');
var _PNG_TYPE_zTXt = _pngTypeCode('zTXt');
var _PNG_TYPE_eXIf = _pngTypeCode('eXIf');

// Chunks to conditionally preserve
var _PNG_TYPE_iCCP = _pngTypeCode('iCCP');

// Sentinel: stop after IEND
var _PNG_TYPE_IEND = _pngTypeCode('IEND');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the buffer begins with the 8-byte PNG signature.
 */
window.__metastrip.isPng = function(buffer) {
  if (buffer.byteLength < 8) return false;
  var view = new Uint8Array(buffer);
  for (var i = 0; i < 8; i++) {
    if (view[i] !== _PNG_SIGNATURE[i]) return false;
  }
  return true;
};

/**
 * Strips metadata chunks from a PNG binary buffer.
 *
 * Chunks removed: tEXt, iTXt, zTXt, eXIf
 * Chunks preserved: IHDR, PLTE, IDAT, IEND, iCCP, sRGB, gAMA, cHRM, pHYs,
 *                   sBIT, tRNS, bKGD, hIST, sPLT, acTL, fcTL, fdAT
 *
 * @param {ArrayBuffer} buffer - Raw PNG bytes
 * @returns {ArrayBuffer} Stripped PNG bytes (zero quality loss)
 */
window.__metastrip.stripPng = function(buffer) {
  if (!window.__metastrip.isPng(buffer)) {
    throw new Error('Input is not a valid PNG: missing PNG signature');
  }

  var src = new Uint8Array(buffer);
  var len = src.byteLength;

  // Collect byte ranges to keep as [start, end) pairs
  var chunks = [];

  // Always keep the 8-byte signature
  chunks.push([0, 8]);

  var offset = 8;

  while (offset < len) {
    // Each chunk needs at least 12 bytes: 4 length + 4 type + 0 data + 4 CRC
    if (offset + 12 > len) {
      throw new Error(
        'Unexpected end of PNG data at offset ' + offset +
        ': not enough bytes for a complete chunk'
      );
    }

    // Read 4-byte length (big-endian)
    var dataLength =
      ((src[offset] << 24) |
        (src[offset + 1] << 16) |
        (src[offset + 2] << 8) |
        src[offset + 3]) >>>
      0;

    // Read 4-byte chunk type
    var chunkType =
      ((src[offset + 4] << 24) |
        (src[offset + 5] << 16) |
        (src[offset + 6] << 8) |
        src[offset + 7]) >>>
      0;

    // Total chunk size: 4 (length) + 4 (type) + dataLength + 4 (CRC)
    var chunkSize = 12 + dataLength;
    var chunkEnd = offset + chunkSize;

    if (chunkEnd > len) {
      throw new Error(
        'PNG chunk at offset ' + offset + ' claims data length ' + dataLength +
        ' but only ' + (len - offset - 12) + ' bytes of data remain'
      );
    }

    var keep = _pngShouldKeep(chunkType);

    if (keep) {
      chunks.push([offset, chunkEnd]);
    }

    offset = chunkEnd;

    // Stop after IEND
    if (chunkType === _PNG_TYPE_IEND) {
      break;
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
 * Returns true if the given chunk type should be preserved.
 */
function _pngShouldKeep(chunkType) {
  // Strip metadata chunks
  if (chunkType === _PNG_TYPE_tEXt) return false;
  if (chunkType === _PNG_TYPE_iTXt) return false;
  if (chunkType === _PNG_TYPE_zTXt) return false;
  if (chunkType === _PNG_TYPE_eXIf) return false;

  // ICC color profile — always keep
  // (iCCP is kept by default in the extension)

  // All other chunks are preserved
  return true;
}
