// MetaStrip Service Worker (background script)
// Handles extension lifecycle, badge updates, and context menu

// Create context menu on install
chrome.runtime.onInstalled.addListener(function(details) {
  // Set default enabled state
  if (details.reason === 'install') {
    chrome.storage.sync.set({ enabled: true });
    console.log('MetaStrip: Installed — auto-strip enabled by default');
  }

  // Create right-click context menu for images
  chrome.contextMenus.create({
    id: 'metastrip-inspect',
    title: 'MetaStrip: Inspect Metadata',
    contexts: ['image']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === 'metastrip-inspect' && info.srcUrl) {
    // Send message to content script to inspect the image
    chrome.tabs.sendMessage(tab.id, {
      action: 'inspectImage',
      src: info.srcUrl
    });
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
