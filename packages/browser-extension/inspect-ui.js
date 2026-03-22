// MetaStrip — Metadata Inspector UI
// Shows a dark overlay panel with metadata details when user right-clicks an image

window.__metastrip = window.__metastrip || {};

(function() {
  'use strict';

  var CATEGORY_ICONS = {
    gps: '\u{1F4CD}', device: '\u{1F4F1}', timestamps: '\u{1F550}',
    software: '\u{1F4BB}', author: '\u{1F464}', ai: '\u{1F916}',
    icc: '\u{1F3A8}', xmp: '\u{1F4CB}', iptc: '\u{1F4F0}', other: '\u{1F4CE}'
  };

  var RISK_COLORS = {
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#06b6d4', none: '#22c55e'
  };

  var RISK_BG = {
    critical: 'rgba(239,68,68,0.1)', high: 'rgba(249,115,22,0.1)',
    medium: 'rgba(234,179,8,0.1)', low: 'rgba(6,180,212,0.05)', none: 'rgba(34,197,94,0.05)'
  };

  function calculateRiskScore(entries) {
    var score = 0;
    var hasGps = false;
    var hasSerial = false;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].category === 'gps') hasGps = true;
      if (entries[i].key.indexOf('Serial') >= 0) hasSerial = true;
    }
    if (hasGps) score += 40;
    if (hasSerial) score += 25;
    if (entries.some(function(e) { return e.category === 'device'; })) score += 15;
    if (entries.some(function(e) { return e.category === 'author'; })) score += 10;
    if (entries.some(function(e) { return e.category === 'timestamps'; })) score += 5;
    return Math.min(100, score);
  }

  function showInspectPanel(result, imageSrc) {
    // Remove existing panel
    var existing = document.getElementById('metastrip-inspect-panel');
    if (existing) existing.remove();

    var entries = result.entries;
    var score = calculateRiskScore(entries);
    var scoreColor = score >= 60 ? '#ef4444' : score >= 40 ? '#f97316' : score >= 20 ? '#eab308' : score > 0 ? '#06b6d4' : '#22c55e';
    var scoreLabel = score >= 60 ? 'CRITICAL' : score >= 40 ? 'HIGH' : score >= 20 ? 'MEDIUM' : score > 0 ? 'LOW' : 'CLEAN';

    // Build panel HTML using DOM methods (no innerHTML for security)
    var overlay = document.createElement('div');
    overlay.id = 'metastrip-inspect-panel';
    overlay.style.cssText = 'position:fixed;top:0;right:0;width:380px;height:100vh;background:#09090b;border-left:1px solid #1e1e2e;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,0.5);transition:transform 0.2s;';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #1e1e2e;display:flex;justify-content:space-between;align-items:center;';

    var titleWrap = document.createElement('div');
    var title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:700;color:#fff;';
    title.textContent = 'MetaStrip Inspector';
    var subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:11px;color:#6b7280;margin-top:2px;';
    subtitle.textContent = result.format + ' \u00B7 ' + entries.length + ' entries';
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

    // Risk score
    var scoreBox = document.createElement('div');
    scoreBox.style.cssText = 'margin:16px 20px;padding:16px;border-radius:12px;text-align:center;background:' + (score >= 60 ? 'rgba(239,68,68,0.08)' : score > 0 ? 'rgba(234,179,8,0.08)' : 'rgba(34,197,94,0.08)') + ';border:1px solid ' + scoreColor + '33;';

    var scoreNum = document.createElement('div');
    scoreNum.style.cssText = 'font-size:36px;font-weight:800;color:' + scoreColor + ';';
    scoreNum.textContent = String(score);

    var scoreLbl = document.createElement('div');
    scoreLbl.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:' + scoreColor + ';margin-top:2px;';
    scoreLbl.textContent = 'Privacy Risk \u00B7 ' + scoreLabel;

    scoreBox.appendChild(scoreNum);
    scoreBox.appendChild(scoreLbl);
    overlay.appendChild(scoreBox);

    // GPS callout if present
    var gpsEntries = entries.filter(function(e) { return e.category === 'gps'; });
    var lat = null, lon = null, latRef = null, lonRef = null;
    for (var g = 0; g < gpsEntries.length; g++) {
      if (gpsEntries[g].key === 'GPSLatitude') lat = parseFloat(gpsEntries[g].value);
      if (gpsEntries[g].key === 'GPSLongitude') lon = parseFloat(gpsEntries[g].value);
      if (gpsEntries[g].key === 'GPSLatitudeRef') latRef = gpsEntries[g].value;
      if (gpsEntries[g].key === 'GPSLongitudeRef') lonRef = gpsEntries[g].value;
    }
    if (lat && lon) {
      if (latRef && latRef.indexOf('S') >= 0) lat = -lat;
      if (lonRef && lonRef.indexOf('W') >= 0) lon = -lon;

      var gpsBox = document.createElement('div');
      gpsBox.style.cssText = 'margin:0 20px 16px;padding:12px;border-radius:10px;background:rgba(239,68,68,0.06);border-left:3px solid #ef4444;';

      var gpsTitle = document.createElement('div');
      gpsTitle.style.cssText = 'font-size:13px;font-weight:700;color:#ef4444;margin-bottom:4px;';
      gpsTitle.textContent = '\u{1F4CD} GPS Location Found';

      var gpsCoords = document.createElement('div');
      gpsCoords.style.cssText = 'font-size:12px;font-family:monospace;color:#fca5a5;';
      gpsCoords.textContent = lat.toFixed(6) + ', ' + lon.toFixed(6);

      var gpsLink = document.createElement('a');
      gpsLink.href = 'https://www.google.com/maps?q=' + lat + ',' + lon;
      gpsLink.target = '_blank';
      gpsLink.rel = 'noopener';
      gpsLink.style.cssText = 'font-size:11px;color:#60a5fa;text-decoration:none;display:block;margin-top:4px;';
      gpsLink.textContent = 'View on Google Maps \u2192';

      gpsBox.appendChild(gpsTitle);
      gpsBox.appendChild(gpsCoords);
      gpsBox.appendChild(gpsLink);
      overlay.appendChild(gpsBox);
    }

    // Entries grouped by category
    var groups = {};
    for (var ei = 0; ei < entries.length; ei++) {
      var e = entries[ei];
      if (!groups[e.category]) groups[e.category] = [];
      groups[e.category].push(e);
    }

    var catOrder = ['gps', 'device', 'author', 'timestamps', 'software', 'icc', 'xmp', 'iptc', 'other'];
    var listContainer = document.createElement('div');
    listContainer.style.cssText = 'padding:0 20px 20px;';

    for (var ci = 0; ci < catOrder.length; ci++) {
      var cat = catOrder[ci];
      if (!groups[cat] || groups[cat].length === 0) continue;

      var catHeader = document.createElement('div');
      catHeader.style.cssText = 'font-size:12px;font-weight:600;color:#8892b0;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;';
      catHeader.textContent = (CATEGORY_ICONS[cat] || '') + ' ' + cat + ' (' + groups[cat].length + ')';
      listContainer.appendChild(catHeader);

      for (var j = 0; j < groups[cat].length; j++) {
        var entry = groups[cat][j];
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid #1e1e2e;font-size:12px;gap:12px;';

        var keyEl = document.createElement('span');
        keyEl.style.cssText = 'color:#6b7280;flex-shrink:0;';
        keyEl.textContent = entry.key;

        var valEl = document.createElement('span');
        valEl.style.cssText = 'color:' + (RISK_COLORS[entry.risk] || '#e0e0e8') + ';text-align:right;font-family:monospace;font-size:11px;word-break:break-all;max-width:200px;overflow:hidden;text-overflow:ellipsis;';
        valEl.textContent = entry.value.length > 60 ? entry.value.slice(0, 57) + '...' : entry.value;
        valEl.title = entry.value;

        row.appendChild(keyEl);
        row.appendChild(valEl);
        listContainer.appendChild(row);
      }
    }

    overlay.appendChild(listContainer);

    // No metadata case
    if (entries.length === 0) {
      var cleanMsg = document.createElement('div');
      cleanMsg.style.cssText = 'padding:40px 20px;text-align:center;';

      var cleanIcon = document.createElement('div');
      cleanIcon.style.cssText = 'font-size:32px;margin-bottom:8px;';
      cleanIcon.textContent = '\u{1F6E1}\uFE0F';

      var cleanText = document.createElement('div');
      cleanText.style.cssText = 'font-size:14px;color:#22c55e;font-weight:600;';
      cleanText.textContent = 'No metadata found';

      var cleanSub = document.createElement('div');
      cleanSub.style.cssText = 'font-size:12px;color:#6b7280;margin-top:4px;';
      cleanSub.textContent = 'This image is clean.';

      cleanMsg.appendChild(cleanIcon);
      cleanMsg.appendChild(cleanText);
      cleanMsg.appendChild(cleanSub);
      overlay.appendChild(cleanMsg);
    }

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

    // Close on Escape
    function onEsc(ev) {
      if (ev.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', onEsc);
      }
    }
    document.addEventListener('keydown', onEsc);
  }

  // ============================================================
  // Listen for inspect messages from background script
  // ============================================================

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
      if (msg.action !== 'inspectImage') return;

      // msg.src is the image URL — fetch it and read metadata
      fetch(msg.src)
        .then(function(res) { return res.arrayBuffer(); })
        .then(function(buf) {
          var result = window.__metastrip.readMetadata(buf);
          if (result) {
            showInspectPanel(result, msg.src);
          } else {
            showInspectPanel({ format: 'Unknown', entries: [] }, msg.src);
          }
        })
        .catch(function(err) {
          console.warn('MetaStrip: Could not fetch image for inspection', err);
          // Try to show panel with error state
          showInspectPanel({ format: 'Error', entries: [{ key: 'Error', value: 'Could not fetch image (CORS restriction)', category: 'other', risk: 'none' }] }, msg.src);
        });
    });
  }

})();
