// MetaStrip Content Script
// Intercepts file uploads and strips metadata before upload

(function() {
  'use strict';

  var enabled = true;

  // Load settings from storage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['enabled'], function(result) {
      enabled = result.enabled !== false;
    });

    chrome.storage.onChanged.addListener(function(changes) {
      if (changes.enabled) {
        enabled = changes.enabled.newValue;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Format detection
  // ---------------------------------------------------------------------------

  function detectFormat(arrayBuffer) {
    if (window.__metastrip.isJpeg(arrayBuffer)) return 'jpeg';
    if (window.__metastrip.isPng(arrayBuffer)) return 'png';
    if (window.__metastrip.isWebp(arrayBuffer)) return 'webp';
    return null;
  }

  // ---------------------------------------------------------------------------
  // Strip buffer by format
  // ---------------------------------------------------------------------------

  function stripBuffer(arrayBuffer, format) {
    switch (format) {
      case 'jpeg': return window.__metastrip.stripJpeg(arrayBuffer);
      case 'png':  return window.__metastrip.stripPng(arrayBuffer);
      case 'webp': return window.__metastrip.stripWebp(arrayBuffer);
      default:     return arrayBuffer;
    }
  }

  // ---------------------------------------------------------------------------
  // Process a single file
  // ---------------------------------------------------------------------------

  function processFile(file) {
    if (!enabled) return Promise.resolve(file);

    var supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (supportedTypes.indexOf(file.type) === -1) return Promise.resolve(file);

    return file.arrayBuffer().then(function(arrayBuffer) {
      var format = detectFormat(arrayBuffer);
      if (!format) return file;

      var stripped;
      try {
        stripped = stripBuffer(arrayBuffer, format);
      } catch (err) {
        console.warn('MetaStrip: Failed to strip', file.name, err);
        return file;
      }

      // Check if anything changed
      if (stripped.byteLength === arrayBuffer.byteLength) {
        var a = new Uint8Array(stripped);
        var b = new Uint8Array(arrayBuffer);
        var same = true;
        for (var i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) { same = false; break; }
        }
        if (same) return file; // Already clean
      }

      // Show notification
      showNotification(file.name);

      // Create new File with stripped data
      return new File([stripped], file.name, {
        type: file.type,
        lastModified: file.lastModified
      });
    }).catch(function(err) {
      console.warn('MetaStrip: Failed to process', file.name, err);
      return file;
    });
  }

  // ---------------------------------------------------------------------------
  // Toast notification
  // ---------------------------------------------------------------------------

  function showNotification(fileName) {
    var div = document.createElement('div');
    div.textContent = 'MetaStrip: Stripped metadata from ' + fileName;
    div.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'background:#09090b',
      'color:#10b981',
      'padding:12px 20px',
      'border-radius:10px',
      'font-family:system-ui,sans-serif',
      'font-size:14px',
      'z-index:2147483647',
      'border:1px solid #10b981',
      'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
      'transition:opacity 0.3s',
      'pointer-events:none'
    ].join(';');

    document.body.appendChild(div);

    setTimeout(function() {
      div.style.opacity = '0';
      setTimeout(function() {
        if (div.parentNode) div.parentNode.removeChild(div);
      }, 300);
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Intercept file input changes
  // ---------------------------------------------------------------------------

  document.addEventListener('change', function(event) {
    var input = event.target;
    if (!enabled) return;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    if (!input.files || input.files.length === 0) return;

    var files = Array.from(input.files);
    var promises = files.map(function(f) { return processFile(f); });

    Promise.all(promises).then(function(processed) {
      var anyStripped = false;
      for (var i = 0; i < processed.length; i++) {
        if (processed[i] !== files[i]) {
          anyStripped = true;
          break;
        }
      }

      if (anyStripped) {
        var dt = new DataTransfer();
        for (var i = 0; i < processed.length; i++) {
          dt.items.add(processed[i]);
        }
        input.files = dt.files;
      }
    }).catch(function(err) {
      console.warn('MetaStrip: Error processing files', err);
    });
  }, true);

  console.log('MetaStrip: Extension active');
})();
