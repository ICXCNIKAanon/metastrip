// MetaStrip Service Worker (background script)
// Handles extension lifecycle and badge updates

chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    // Set default enabled state
    chrome.storage.sync.set({ enabled: true });
    console.log('MetaStrip: Installed — auto-strip enabled by default');
  }
});

// Listen for storage changes and update badge
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.enabled) {
    var on = changes.enabled.newValue;
    chrome.action.setBadgeText({ text: on ? '' : 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  }
});
