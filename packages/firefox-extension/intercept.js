// MetaStrip — Network-level upload interception
// Injected into the MAIN page world (not isolated content script world)
// Overrides fetch() and XMLHttpRequest.send() to strip metadata from
// image files in FormData before they leave the browser.

(function() {
  'use strict';

  // Import strippers from the content script world via a shared flag
  // The content scripts set window.__metastrip — but in MV3 content scripts
  // run in an isolated world. This script runs in the MAIN world so it needs
  // its own copies of the strippers. They're injected inline below.

  // We communicate with the content script via custom events
  var METASTRIP_ENABLED = true;

  window.addEventListener('metastrip-toggle', function(e) {
    METASTRIP_ENABLED = e.detail.enabled;
  });

  // Supported MIME types
  var SUPPORTED = ['image/jpeg', 'image/png', 'image/webp'];

  // ========================================================================
  // Minimal inline strippers (JPEG / PNG / WebP)
  // These are stripped-down versions that just remove metadata segments
  // without the full feature set of the content script versions.
  // ========================================================================

  function isJpeg(b) { return b.byteLength >= 2 && b[0] === 0xff && b[1] === 0xd8; }
  function isPng(b) { return b.byteLength >= 8 && b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47; }
  function isWebp(b) { return b.byteLength >= 12 && b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46 && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50; }

  function stripJpegBuf(buf) {
    var bytes = new Uint8Array(buf);
    var view = new DataView(buf);
    if (!isJpeg(bytes)) return buf;

    var segments = [];
    segments.push(bytes.slice(0, 2)); // SOI

    var offset = 2;
    while (offset < buf.byteLength - 1) {
      if (bytes[offset] !== 0xff) break;
      var marker = view.getUint16(offset);

      if (marker === 0xffda) { segments.push(bytes.slice(offset)); break; }
      if (marker === 0xffd9) { segments.push(bytes.slice(offset, offset + 2)); break; }
      if ((marker >= 0xffd0 && marker <= 0xffd7) || marker === 0xff01) {
        segments.push(bytes.slice(offset, offset + 2)); offset += 2; continue;
      }

      if (offset + 4 > buf.byteLength) break;
      var segLen = view.getUint16(offset + 2);
      var segEnd = offset + 2 + segLen;
      if (segEnd > buf.byteLength) break;

      // Keep APP0 (JFIF) and APP2 (ICC), remove APP1,APP3-APP15,COM
      var keep = (marker === 0xffe0 || marker === 0xffe2 ||
                  (marker >= 0xffc0 && marker <= 0xffcf && marker !== 0xffc8) ||
                  marker === 0xffdb || marker === 0xffdd);

      if (!keep) { offset = segEnd; continue; }
      segments.push(bytes.slice(offset, segEnd));
      offset = segEnd;
    }

    var total = 0;
    for (var i = 0; i < segments.length; i++) total += segments[i].length;
    var result = new Uint8Array(total);
    var w = 0;
    for (var i = 0; i < segments.length; i++) { result.set(segments[i], w); w += segments[i].length; }
    return result.buffer;
  }

  function stripPngBuf(buf) {
    var bytes = new Uint8Array(buf);
    if (!isPng(bytes)) return buf;
    var META_CHUNKS = { tEXt:1, iTXt:1, zTXt:1, eXIf:1 };
    var chunks = [bytes.slice(0, 8)];
    var offset = 8;
    while (offset < buf.byteLength) {
      if (offset + 8 > buf.byteLength) break;
      var dv = new DataView(buf, offset);
      var dataLen = dv.getUint32(0);
      var type = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
      var totalLen = 4 + 4 + dataLen + 4;
      if (offset + totalLen > buf.byteLength) { chunks.push(bytes.slice(offset)); break; }
      if (!META_CHUNKS[type]) { chunks.push(bytes.slice(offset, offset + totalLen)); }
      if (type === 'IEND') break;
      offset += totalLen;
    }
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var result = new Uint8Array(total);
    var w = 0;
    for (var i = 0; i < chunks.length; i++) { result.set(chunks[i], w); w += chunks[i].length; }
    return result.buffer;
  }

  function stripWebpBuf(buf) {
    var bytes = new Uint8Array(buf);
    var view = new DataView(buf);
    if (!isWebp(bytes)) return buf;
    var REMOVE = { EXIF:1, 'XMP ':1 };
    var chunks = [bytes.slice(0, 12)];
    var offset = 12;
    while (offset < buf.byteLength) {
      if (offset + 8 > buf.byteLength) break;
      var fourcc = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
      var size = view.getUint32(offset + 4, true);
      var padded = size + (size % 2);
      var totalSize = 8 + padded;
      if (!REMOVE[fourcc]) { chunks.push(bytes.slice(offset, offset + totalSize)); }
      offset += totalSize;
    }
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var result = new Uint8Array(total);
    var w = 0;
    for (var i = 0; i < chunks.length; i++) { result.set(chunks[i], w); w += chunks[i].length; }
    // Update RIFF size
    new DataView(result.buffer).setUint32(4, total - 8, true);
    return result.buffer;
  }

  function stripBuf(buf) {
    var bytes = new Uint8Array(buf);
    if (isJpeg(bytes)) return stripJpegBuf(buf);
    if (isPng(bytes)) return stripPngBuf(buf);
    if (isWebp(bytes)) return stripWebpBuf(buf);
    return buf;
  }

  function buffersEqual(a, b) {
    if (a.byteLength !== b.byteLength) return false;
    var x = new Uint8Array(a), y = new Uint8Array(b);
    for (var i = 0; i < x.length; i++) { if (x[i] !== y[i]) return false; }
    return true;
  }

  // ========================================================================
  // Override fetch()
  // ========================================================================

  var originalFetch = window.fetch;

  window.fetch = function(input, init) {
    if (!METASTRIP_ENABLED || !init || !init.body) {
      return originalFetch.apply(this, arguments);
    }

    var body = init.body;
    if (!(body instanceof FormData)) {
      return originalFetch.apply(this, arguments);
    }

    // Check if FormData contains image files
    var hasImages = false;
    var entries = [];
    // FormData.entries() might not be available in all contexts
    try {
      var iter = body.entries();
      var entry;
      while (!(entry = iter.next()).done) {
        entries.push(entry.value);
        if (entry.value[1] instanceof File && SUPPORTED.indexOf(entry.value[1].type) !== -1) {
          hasImages = true;
        }
      }
      if (!hasImages) {
        return originalFetch.apply(this, arguments);
      }
    } catch(e) {
      return originalFetch.apply(this, arguments);
    }

    // Process all image files in the FormData
    var promises = entries.map(function(pair) {
      var key = pair[0], value = pair[1];
      if (!(value instanceof File) || SUPPORTED.indexOf(value.type) === -1) {
        return Promise.resolve([key, value]);
      }
      return value.arrayBuffer().then(function(buf) {
        var stripped = stripBuf(buf);
        if (buffersEqual(buf, stripped)) return [key, value]; // No change
        // Dispatch notification event to content script
        window.dispatchEvent(new CustomEvent('metastrip-stripped', { detail: { name: value.name } }));
        return [key, new File([stripped], value.name, { type: value.type, lastModified: value.lastModified })];
      }).catch(function() {
        return [key, value];
      });
    });

    return Promise.all(promises).then(function(newEntries) {
      var newForm = new FormData();
      for (var i = 0; i < newEntries.length; i++) {
        var k = newEntries[i][0], v = newEntries[i][1];
        if (v instanceof File) {
          newForm.append(k, v, v.name);
        } else {
          newForm.append(k, v);
        }
      }
      var newInit = {};
      for (var prop in init) { newInit[prop] = init[prop]; }
      newInit.body = newForm;
      return originalFetch.call(this, input, newInit);
    }.bind(this));
  };

  // ========================================================================
  // Override XMLHttpRequest.send()
  // ========================================================================

  var originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.send = function(body) {
    var xhr = this;

    if (!METASTRIP_ENABLED || !(body instanceof FormData)) {
      return originalXHRSend.call(xhr, body);
    }

    var hasImages = false;
    var entries = [];
    try {
      var iter = body.entries();
      var entry;
      while (!(entry = iter.next()).done) {
        entries.push(entry.value);
        if (entry.value[1] instanceof File && SUPPORTED.indexOf(entry.value[1].type) !== -1) {
          hasImages = true;
        }
      }
      if (!hasImages) {
        return originalXHRSend.call(xhr, body);
      }
    } catch(e) {
      return originalXHRSend.call(xhr, body);
    }

    var promises = entries.map(function(pair) {
      var key = pair[0], value = pair[1];
      if (!(value instanceof File) || SUPPORTED.indexOf(value.type) === -1) {
        return Promise.resolve([key, value]);
      }
      return value.arrayBuffer().then(function(buf) {
        var stripped = stripBuf(buf);
        if (buffersEqual(buf, stripped)) return [key, value];
        window.dispatchEvent(new CustomEvent('metastrip-stripped', { detail: { name: value.name } }));
        return [key, new File([stripped], value.name, { type: value.type, lastModified: value.lastModified })];
      }).catch(function() {
        return [key, value];
      });
    });

    Promise.all(promises).then(function(newEntries) {
      var newForm = new FormData();
      for (var i = 0; i < newEntries.length; i++) {
        var k = newEntries[i][0], v = newEntries[i][1];
        if (v instanceof File) {
          newForm.append(k, v, v.name);
        } else {
          newForm.append(k, v);
        }
      }
      originalXHRSend.call(xhr, newForm);
    }).catch(function() {
      originalXHRSend.call(xhr, body);
    });
  };

  console.log('MetaStrip: Network interception active');
})();
