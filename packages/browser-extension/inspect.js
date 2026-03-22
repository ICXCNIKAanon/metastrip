// MetaStrip — Image Metadata Inspector
// Reads EXIF/metadata from JPEG, PNG, WebP images and displays in an overlay panel
// Plain JavaScript, no dependencies

window.__metastrip = window.__metastrip || {};

(function() {
  'use strict';

  // ============================================================
  // JPEG EXIF Reader
  // ============================================================

  function readJpegMetadata(buf) {
    var view = new DataView(buf);
    var entries = [];
    if (view.getUint16(0) !== 0xffd8) return entries;

    var offset = 2;
    while (offset < buf.byteLength - 1) {
      if (view.getUint8(offset) !== 0xff) break;
      var marker = view.getUint16(offset);

      if (marker === 0xffda || marker === 0xffd9) break; // SOS or EOI

      // Standalone markers
      if ((marker >= 0xffd0 && marker <= 0xffd7) || marker === 0xff01) {
        offset += 2;
        continue;
      }

      if (offset + 4 > buf.byteLength) break;
      var segLen = view.getUint16(offset + 2);
      var segEnd = offset + 2 + segLen;
      if (segEnd > buf.byteLength) break;

      var segData = new Uint8Array(buf, offset + 4, segLen - 2);

      if (marker === 0xffe1) { // APP1 — EXIF or XMP
        var header = String.fromCharCode.apply(null, segData.slice(0, 6));
        if (header.indexOf('Exif') === 0) {
          entries = entries.concat(parseExif(buf, offset + 4 + 6, segLen - 8));
        } else {
          var xmpStr = String.fromCharCode.apply(null, segData.slice(0, 50));
          if (xmpStr.indexOf('http://ns.adobe.com/xap') >= 0) {
            entries.push({ key: 'XMP Data', value: 'Present (' + segData.length + ' bytes)', category: 'xmp', risk: 'low' });
          }
        }
      } else if (marker === 0xffe0) { // APP0 — JFIF
        entries.push({ key: 'Format', value: 'JFIF', category: 'other', risk: 'none' });
      } else if (marker === 0xffe2) { // APP2 — ICC
        entries.push({ key: 'ICC Profile', value: 'Present (' + segData.length + ' bytes)', category: 'icc', risk: 'none' });
      } else if (marker === 0xffed) { // APP13 — IPTC
        entries.push({ key: 'IPTC Data', value: 'Present (' + segData.length + ' bytes)', category: 'iptc', risk: 'medium' });
      } else if (marker === 0xfffe) { // COM
        var comment = '';
        for (var ci = 0; ci < Math.min(segData.length, 200); ci++) {
          if (segData[ci] >= 32 && segData[ci] < 127) comment += String.fromCharCode(segData[ci]);
        }
        if (comment.length > 0) {
          entries.push({ key: 'Comment', value: comment, category: 'software', risk: 'low' });
        }
      }

      offset = segEnd;
    }

    return entries;
  }

  function parseExif(buf, tiffOffset, tiffLen) {
    var entries = [];
    if (tiffLen < 8) return entries;

    var view = new DataView(buf);
    var le = view.getUint16(tiffOffset) === 0x4949; // II = little-endian

    function getU16(o) { return view.getUint16(o, le); }
    function getU32(o) { return view.getUint32(o, le); }
    function getS32(o) { return view.getInt32(o, le); }

    function getRational(o) {
      var num = getU32(o);
      var den = getU32(o + 4);
      return den === 0 ? 0 : num / den;
    }

    function getString(o, len) {
      var s = '';
      for (var i = 0; i < len; i++) {
        var c = view.getUint8(o + i);
        if (c === 0) break;
        if (c >= 32 && c < 127) s += String.fromCharCode(c);
      }
      return s;
    }

    // Known EXIF tags
    var TAG_NAMES = {
      0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation',
      0x011a: 'XResolution', 0x011b: 'YResolution',
      0x0131: 'Software', 0x0132: 'DateTime',
      0x013b: 'Artist', 0x8298: 'Copyright',
      0x8769: 'ExifIFD', 0x8825: 'GPSIFD',
      0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
      0x920a: 'FocalLength', 0xa405: 'FocalLengthIn35mm',
      0xa001: 'ColorSpace', 0xa002: 'ExifImageWidth', 0xa003: 'ExifImageHeight',
      0xa430: 'OwnerName', 0xa431: 'BodySerialNumber', 0xa432: 'LensInfo',
      0xa433: 'LensMake', 0xa434: 'LensModel', 0xa435: 'LensSerialNumber',
    };

    var GPS_TAGS = {
      0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
      0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude',
      0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude',
      0x0007: 'GPSTimeStamp', 0x001d: 'GPSDateStamp',
    };

    function categorize(name) {
      if (name.indexOf('GPS') === 0) return 'gps';
      if (name === 'Make' || name === 'Model' || name.indexOf('Serial') >= 0 || name.indexOf('Lens') >= 0 || name === 'OwnerName') return 'device';
      if (name.indexOf('Date') >= 0 || name.indexOf('Time') >= 0) return 'timestamps';
      if (name === 'Software') return 'software';
      if (name === 'Artist' || name === 'Copyright') return 'author';
      return 'other';
    }

    function riskOf(cat) {
      if (cat === 'gps') return 'critical';
      if (cat === 'device') return 'high';
      if (cat === 'timestamps' || cat === 'author') return 'medium';
      return 'low';
    }

    function readIFD(ifdOffset, tags, isGps) {
      if (ifdOffset + 2 > tiffOffset + tiffLen) return;
      var count;
      try { count = getU16(tiffOffset + ifdOffset); } catch(e) { return; }
      if (count > 200) return; // sanity

      for (var i = 0; i < count; i++) {
        var entryOffset = tiffOffset + ifdOffset + 2 + i * 12;
        if (entryOffset + 12 > tiffOffset + tiffLen) break;

        var tag = getU16(entryOffset);
        var type = getU16(entryOffset + 2);
        var cnt = getU32(entryOffset + 4);
        var valOffset = entryOffset + 8;

        // If data > 4 bytes, valOffset is a pointer
        var dataSize = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] || 1;
        if (cnt * dataSize > 4) {
          valOffset = tiffOffset + getU32(entryOffset + 8);
        }

        var name = tags[tag];
        if (!name) continue;

        // Sub-IFDs
        if (name === 'ExifIFD') {
          readIFD(getU32(entryOffset + 8), TAG_NAMES, false);
          continue;
        }
        if (name === 'GPSIFD') {
          readIFD(getU32(entryOffset + 8), GPS_TAGS, true);
          continue;
        }

        var value = '';
        try {
          if (type === 2) { // ASCII
            value = getString(valOffset, cnt);
          } else if (type === 3) { // SHORT
            value = String(getU16(valOffset));
          } else if (type === 4) { // LONG
            value = String(getU32(valOffset));
          } else if (type === 5) { // RATIONAL
            if (name === 'GPSLatitude' || name === 'GPSLongitude') {
              var d = getRational(valOffset);
              var m = getRational(valOffset + 8);
              var s = getRational(valOffset + 16);
              value = (d + m / 60 + s / 3600).toFixed(6);
            } else {
              value = getRational(valOffset).toFixed(4);
            }
          } else if (type === 10) { // SRATIONAL
            var sn = getS32(valOffset);
            var sd = getS32(valOffset + 4);
            value = sd === 0 ? '0' : (sn / sd).toFixed(4);
          } else {
            value = '(' + cnt + ' bytes)';
          }
        } catch(e) {
          value = '(unreadable)';
        }

        if (value.length > 0) {
          var cat = categorize(name);
          entries.push({ key: name, value: value, category: cat, risk: riskOf(cat) });
        }
      }
    }

    // Read IFD0
    var ifd0Offset = getU32(tiffOffset + 4);
    readIFD(ifd0Offset, TAG_NAMES, false);

    return entries;
  }

  // ============================================================
  // PNG Metadata Reader
  // ============================================================

  function readPngMetadata(buf) {
    var entries = [];
    var bytes = new Uint8Array(buf);
    if (bytes.length < 8) return entries;

    var offset = 8; // skip signature
    while (offset < buf.byteLength) {
      if (offset + 8 > buf.byteLength) break;
      var view = new DataView(buf, offset);
      var dataLen = view.getUint32(0);
      var chunkType = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
      var totalLen = 4 + 4 + dataLen + 4;

      if (chunkType === 'tEXt' || chunkType === 'iTXt' || chunkType === 'zTXt') {
        var textData = new Uint8Array(buf, offset + 8, Math.min(dataLen, 500));
        var text = '';
        for (var i = 0; i < textData.length; i++) {
          var c = textData[i];
          if (c === 0) { text += ': '; continue; }
          if (c >= 32 && c < 127) text += String.fromCharCode(c);
        }
        entries.push({ key: chunkType + ' Chunk', value: text.slice(0, 200), category: 'other', risk: 'low' });
      } else if (chunkType === 'eXIf') {
        entries.push({ key: 'EXIF Data', value: 'Present (' + dataLen + ' bytes)', category: 'other', risk: 'medium' });
      } else if (chunkType === 'iCCP') {
        entries.push({ key: 'ICC Profile', value: 'Present', category: 'icc', risk: 'none' });
      }

      if (chunkType === 'IEND') break;
      offset += totalLen;
    }
    return entries;
  }

  // ============================================================
  // WebP Metadata Reader
  // ============================================================

  function readWebpMetadata(buf) {
    var entries = [];
    var bytes = new Uint8Array(buf);
    if (bytes.length < 12) return entries;

    var offset = 12;
    while (offset < buf.byteLength) {
      if (offset + 8 > buf.byteLength) break;
      var fourcc = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
      var view = new DataView(buf, offset + 4, 4);
      var size = view.getUint32(0, true);
      var padded = size + (size % 2);

      if (fourcc === 'EXIF') {
        entries.push({ key: 'EXIF Data', value: 'Present (' + size + ' bytes)', category: 'other', risk: 'medium' });
      } else if (fourcc === 'XMP ') {
        entries.push({ key: 'XMP Data', value: 'Present (' + size + ' bytes)', category: 'xmp', risk: 'low' });
      } else if (fourcc === 'ICCP') {
        entries.push({ key: 'ICC Profile', value: 'Present', category: 'icc', risk: 'none' });
      }

      offset += 8 + padded;
    }
    return entries;
  }

  // ============================================================
  // Public API
  // ============================================================

  window.__metastrip.readMetadata = function(arrayBuffer) {
    if (window.__metastrip.isJpeg(arrayBuffer)) return { format: 'JPEG', entries: readJpegMetadata(arrayBuffer) };
    if (window.__metastrip.isPng(arrayBuffer)) return { format: 'PNG', entries: readPngMetadata(arrayBuffer) };
    if (window.__metastrip.isWebp(arrayBuffer)) return { format: 'WebP', entries: readWebpMetadata(arrayBuffer) };
    return null;
  };

})();
