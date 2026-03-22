// MetaStrip Popup Logic

var toggle = document.getElementById('toggle');
var status = document.getElementById('status');

// Load current state
chrome.storage.sync.get(['enabled'], function(result) {
  var on = result.enabled !== false;
  toggle.checked = on;
  updateStatus(on);
});

// Handle toggle changes
toggle.addEventListener('change', function() {
  var on = toggle.checked;
  chrome.storage.sync.set({ enabled: on });
  updateStatus(on);
});

function updateStatus(on) {
  // Clear existing children safely (no innerHTML)
  while (status.firstChild) {
    status.removeChild(status.firstChild);
  }

  var dot = document.createElement('span');
  dot.className = on ? 'dot active' : 'dot';

  var label = document.createElement('span');
  label.textContent = on ? 'Active — protecting uploads' : 'Paused';

  status.appendChild(dot);
  status.appendChild(label);
}
