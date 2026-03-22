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

  // ---------------------------------------------------------------------------
  // Watch for dynamically created file inputs (Gmail, Slack, etc.)
  // ---------------------------------------------------------------------------

  var observer = new MutationObserver(function(mutations) {
    if (!enabled) return;
    for (var m = 0; m < mutations.length; m++) {
      var nodes = mutations[m].addedNodes;
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        if (node.nodeType !== 1) continue;
        // Check the node itself
        if (node.tagName === 'INPUT' && node.type === 'file') {
          attachFileListener(node);
        }
        // Check children
        if (node.querySelectorAll) {
          var inputs = node.querySelectorAll('input[type="file"]');
          for (var i = 0; i < inputs.length; i++) {
            attachFileListener(inputs[i]);
          }
        }
      }
    }
  });

  var attachedInputs = new WeakSet();

  function attachFileListener(input) {
    if (attachedInputs.has(input)) return;
    attachedInputs.add(input);

    input.addEventListener('change', function() {
      if (!enabled || !input.files || input.files.length === 0) return;

      var files = Array.from(input.files);
      var promises = files.map(function(f) { return processFile(f); });

      Promise.all(promises).then(function(processed) {
        var anyStripped = false;
        for (var i = 0; i < processed.length; i++) {
          if (processed[i] !== files[i]) { anyStripped = true; break; }
        }
        if (anyStripped) {
          var dt = new DataTransfer();
          for (var i = 0; i < processed.length; i++) { dt.items.add(processed[i]); }
          try { input.files = dt.files; } catch(e) { /* some inputs are read-only */ }
        }
      }).catch(function() {});
    });
  }

  // Start observing after DOM is ready
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Also attach to any existing file inputs on page load
  document.addEventListener('DOMContentLoaded', function() {
    var existing = document.querySelectorAll('input[type="file"]');
    for (var i = 0; i < existing.length; i++) {
      attachFileListener(existing[i]);
    }
  });

  // ---------------------------------------------------------------------------
  // Drag-and-drop interception (alert mode — DataTransfer.files is read-only)
  // ---------------------------------------------------------------------------

  document.addEventListener('drop', function(event) {
    if (!enabled) return;
    var dt = event.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;

    var supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    for (var i = 0; i < dt.files.length; i++) {
      (function(file) {
        if (supportedTypes.indexOf(file.type) === -1) return;
        file.arrayBuffer().then(function(buf) {
          var format = detectFormat(buf);
          if (!format) return;
          var stripped;
          try { stripped = stripBuffer(buf, format); } catch(e) { return; }
          if (stripped.byteLength === buf.byteLength) {
            var a = new Uint8Array(stripped), b = new Uint8Array(buf), same = true;
            for (var j = 0; j < a.length; j++) { if (a[j] !== b[j]) { same = false; break; } }
            if (same) return;
          }
          showNotification('\u26A0\uFE0F ' + (file.name || 'dropped image') + ' contains metadata — drag-drop cannot be auto-stripped. Visit metastrip.ai to clean it first.');
        }).catch(function() {});
      })(dt.files[i]);
    }
  }, true);

  // ---------------------------------------------------------------------------
  // Paste interception (alert mode — clipboard data is read-only)
  // ---------------------------------------------------------------------------

  document.addEventListener('paste', function(event) {
    if (!enabled) return;
    var items = event.clipboardData ? event.clipboardData.items : [];
    var supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    for (var i = 0; i < items.length; i++) {
      if (supportedTypes.indexOf(items[i].type) === -1) continue;
      (function(item) {
        var file = item.getAsFile();
        if (!file) return;
        file.arrayBuffer().then(function(buf) {
          var format = detectFormat(buf);
          if (!format) return;
          var stripped;
          try { stripped = stripBuffer(buf, format); } catch(e) { return; }
          if (stripped.byteLength === buf.byteLength) {
            var a = new Uint8Array(stripped), b = new Uint8Array(buf), same = true;
            for (var j = 0; j < a.length; j++) { if (a[j] !== b[j]) { same = false; break; } }
            if (same) return;
          }
          showNotification('\u26A0\uFE0F Pasted image contains metadata — paste cannot be auto-stripped. Visit metastrip.ai to clean it first.');
        }).catch(function() {});
      })(items[i]);
    }
  }, true);

  // ---------------------------------------------------------------------------
  // Scan all images on page
  // ---------------------------------------------------------------------------

  function showScanPanel(results) {
    var existing = document.getElementById('metastrip-scan-panel');
    if (existing) existing.remove();

    var total = results.length;
    var withMeta = results.filter(function(r) { return r.entries && r.entries.length > 0; }).length;

    var overlay = document.createElement('div');
    overlay.id = 'metastrip-scan-panel';
    overlay.style.cssText = 'position:fixed;top:0;right:0;width:400px;height:100vh;background:#09090b;border-left:1px solid #1e1e2e;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,0.5);';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #1e1e2e;display:flex;justify-content:space-between;align-items:center;';

    var titleWrap = document.createElement('div');
    var title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:700;color:#fff;';
    title.textContent = 'MetaStrip — Page Scan';
    var subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:11px;color:#6b7280;margin-top:2px;';
    subtitle.textContent = 'Scanned ' + total + ' image' + (total !== 1 ? 's' : '') + ' \u00B7 ' + withMeta + ' contain metadata';
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'background:none;border:none;color:#6b7280;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px;';
    closeBtn.onmouseover = function() { closeBtn.style.color = '#fff'; };
    closeBtn.onmouseout = function() { closeBtn.style.color = '#6b7280'; };
    closeBtn.onclick = function() { overlay.remove(); };
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Summary banner
    var banner = document.createElement('div');
    var bannerColor = withMeta > 0 ? '#f97316' : '#22c55e';
    var bannerBg = withMeta > 0 ? 'rgba(249,115,22,0.08)' : 'rgba(34,197,94,0.08)';
    banner.style.cssText = 'margin:16px 20px;padding:14px 16px;border-radius:12px;background:' + bannerBg + ';border:1px solid ' + bannerColor + '33;text-align:center;';
    var bannerNum = document.createElement('div');
    bannerNum.style.cssText = 'font-size:32px;font-weight:800;color:' + bannerColor + ';';
    bannerNum.textContent = withMeta + ' / ' + total;
    var bannerLabel = document.createElement('div');
    bannerLabel.style.cssText = 'font-size:12px;color:' + bannerColor + ';margin-top:2px;font-weight:600;';
    bannerLabel.textContent = withMeta > 0 ? 'images contain metadata' : 'All images are clean';
    banner.appendChild(bannerNum);
    banner.appendChild(bannerLabel);
    overlay.appendChild(banner);

    // Image results list
    var list = document.createElement('div');
    list.style.cssText = 'padding:0 20px 20px;';

    if (results.length === 0) {
      var emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'padding:40px 0;text-align:center;color:#6b7280;font-size:13px;';
      emptyMsg.textContent = 'No images found on this page.';
      list.appendChild(emptyMsg);
    }

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var card = document.createElement('div');
      var hasData = r.entries && r.entries.length > 0;
      card.style.cssText = 'margin-bottom:12px;padding:12px;border-radius:10px;background:#111113;border:1px solid ' + (hasData ? '#f9731622' : '#1e1e2e') + ';';

      // Image preview + name
      var cardTop = document.createElement('div');
      cardTop.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:' + (hasData ? '8px' : '0') + ';';

      if (r.src) {
        var thumb = document.createElement('img');
        thumb.src = r.src;
        thumb.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;';
        thumb.onerror = function() { this.style.display = 'none'; };
        cardTop.appendChild(thumb);
      }

      var nameWrap = document.createElement('div');
      nameWrap.style.cssText = 'min-width:0;';
      var nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-size:11px;color:#e0e0e8;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      nameEl.textContent = r.src ? r.src.split('/').pop().split('?')[0].slice(0, 40) || r.src.slice(0, 40) : '(unknown)';
      nameEl.title = r.src || '';
      var statusEl = document.createElement('div');
      statusEl.style.cssText = 'font-size:10px;margin-top:2px;color:' + (r.error ? '#6b7280' : hasData ? '#f97316' : '#22c55e') + ';';
      statusEl.textContent = r.error ? 'Could not fetch (CORS)' : hasData ? r.entries.length + ' metadata entr' + (r.entries.length !== 1 ? 'ies' : 'y') + ' \u00B7 ' + (r.format || '') : 'Clean \u00B7 ' + (r.format || '');
      nameWrap.appendChild(nameEl);
      nameWrap.appendChild(statusEl);
      cardTop.appendChild(nameWrap);
      card.appendChild(cardTop);

      // Entry rows (top 5)
      if (hasData) {
        var RISK_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#06b6d4', none: '#22c55e' };
        var shown = r.entries.slice(0, 5);
        for (var j = 0; j < shown.length; j++) {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-top:1px solid #1e1e2e;gap:8px;';
          var k = document.createElement('span');
          k.style.cssText = 'color:#6b7280;flex-shrink:0;';
          k.textContent = shown[j].key;
          var v = document.createElement('span');
          v.style.cssText = 'color:' + (RISK_COLORS[shown[j].risk] || '#e0e0e8') + ';text-align:right;font-family:monospace;word-break:break-all;max-width:200px;overflow:hidden;text-overflow:ellipsis;';
          v.textContent = shown[j].value.length > 50 ? shown[j].value.slice(0, 47) + '...' : shown[j].value;
          v.title = shown[j].value;
          row.appendChild(k);
          row.appendChild(v);
          card.appendChild(row);
        }
        if (r.entries.length > 5) {
          var more = document.createElement('div');
          more.style.cssText = 'font-size:10px;color:#6b7280;margin-top:4px;padding-top:3px;border-top:1px solid #1e1e2e;';
          more.textContent = '+ ' + (r.entries.length - 5) + ' more entries';
          card.appendChild(more);
        }
      }

      list.appendChild(card);
    }

    overlay.appendChild(list);

    // Footer
    var footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 20px;border-top:1px solid #1e1e2e;text-align:center;';
    var footerLink = document.createElement('a');
    footerLink.href = 'https://metastrip.ai';
    footerLink.target = '_blank';
    footerLink.rel = 'noopener';
    footerLink.style.cssText = 'font-size:11px;color:#10b981;text-decoration:none;';
    footerLink.textContent = 'metastrip.ai';
    footer.appendChild(footerLink);
    overlay.appendChild(footer);

    document.body.appendChild(overlay);

    function onEsc(ev) {
      if (ev.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    }
    document.addEventListener('keydown', onEsc);
  }

  function scanPageImages() {
    var imgs = Array.from(document.querySelectorAll('img'));
    var supportedExts = /\.(jpe?g|png|webp)(\?.*)?$/i;

    // Show loading toast
    var loadingDiv = document.createElement('div');
    loadingDiv.textContent = 'MetaStrip: Scanning ' + imgs.length + ' image' + (imgs.length !== 1 ? 's' : '') + '...';
    loadingDiv.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'background:#09090b',
      'color:#10b981', 'padding:12px 20px', 'border-radius:10px',
      'font-family:system-ui,sans-serif', 'font-size:14px',
      'z-index:2147483646', 'border:1px solid #10b981',
      'box-shadow:0 4px 20px rgba(0,0,0,0.5)', 'pointer-events:none'
    ].join(';');
    document.body.appendChild(loadingDiv);

    var scanTargets = imgs.filter(function(img) {
      var src = img.src || img.currentSrc;
      return src && (src.startsWith('http') || src.startsWith('//'));
    }).slice(0, 30); // cap at 30 to avoid flooding

    var promises = scanTargets.map(function(img) {
      var src = img.src || img.currentSrc;
      return fetch(src)
        .then(function(res) { return res.arrayBuffer(); })
        .then(function(buf) {
          var result = window.__metastrip.readMetadata(buf);
          if (result) {
            return { src: src, format: result.format, entries: result.entries };
          }
          return { src: src, format: null, entries: [] };
        })
        .catch(function() {
          return { src: src, error: true, entries: [] };
        });
    });

    Promise.all(promises).then(function(results) {
      if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
      showScanPanel(results);
    });
  }

  // Listen for scanPage message from background script
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    var _origListener = null;
    // Extend existing onMessage listener or add a new one
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
      if (msg.action === 'scanPage') {
        scanPageImages();
      }
    });
  }

  console.log('MetaStrip: Extension active');
})();
