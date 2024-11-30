let siteUsage = {}; // Store time spent on each site
let activeTabId = null; // Active tab ID
let activeDomain = null; // Active domain
let startTime = null; // Start time of active tab tracking
let popupPort = null; // Reference to the connected popup port

// Utility to extract domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

// Save accumulated time to storage
function saveUsageData(domain, timeSpent) {
  if (!domain || timeSpent <= 0) return; // Skip invalid entries
  siteUsage[domain] = (siteUsage[domain] || 0) + timeSpent;
  chrome.storage.local.set({ siteUsage });
}

// Track active tab time
function trackTime() {
  const now = Date.now();
  if (activeTabId && startTime && activeDomain) {
    const timeSpent = (now - startTime) / 1000; // Time in seconds
    saveUsageData(activeDomain, timeSpent);
    startTime = now; // Reset start time
  }
}

// Handle tab changes
function handleTabChange(newTabId, newUrl) {
  trackTime(); // Save time spent on the previous tab
  activeTabId = newTabId;
  activeDomain = getDomain(newUrl);
  startTime = Date.now(); // Reset the timer
}

// Detect tab activation
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab && tab.url) {
      handleTabChange(tabId, tab.url);
    }
  });
});

// Detect URL changes on tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    handleTabChange(tabId, changeInfo.url);
  }
});

// Detect browser focus change
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser is inactive
    handleTabChange(null, null);
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        handleTabChange(tabs[0].id, tabs[0].url);
      }
    });
  }
});

// Persistent connection for popup real-time updates
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    console.log("Popup connected");
    popupPort = port; // Save reference to the popup port

    // Immediately send the current state when the popup connects
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        handleTabChange(tabs[0].id, tabs[0].url); // Re-track active tab
      }
    });

    // Send real-time updates to the popup
    const interval = setInterval(() => {
      if (!popupPort) {
        clearInterval(interval); // Stop updates if the popup is disconnected
        return;
      }

      trackTime(); // Ensure the latest time is tracked
      chrome.storage.local.get("siteUsage", (data) => {
        try {
          popupPort.postMessage({ siteUsage: data.siteUsage || {} });
        } catch (e) {
          console.error("Failed to send data to popup:", e.message);
          clearInterval(interval); // Stop the interval in case of an error
        }
      });
    }, 1000);

    // Handle popup disconnection
    popupPort.onDisconnect.addListener(() => {
      console.log("Popup disconnected");
      popupPort = null; // Clear the reference to the disconnected popup port
      clearInterval(interval); // Stop periodic updates
    });
  }
});

// Background tracking interval
setInterval(() => {
  if (!popupPort) {
    trackTime(); // Track usage when popup is not open
  }
}, 1000);
