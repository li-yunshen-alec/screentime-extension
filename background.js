import { io } from "https://cdn.jsdelivr.net/npm/socket.io-client@4.7.1/+esm";

let siteUsage = {}; // Store time spent on each site
let activeTabId = null; // Active tab ID
let activeDomain = null; // Active domain
let startTime = null; // Start time of active tab tracking
let popupPort = null; // Reference to the connected popup port
let browserFocused = true; // Track browser focus state
const blockedDomains = []; // List of domains to block
const redirectPage = chrome.runtime.getURL("redirect.html");

// Load blocked domains from local storage on extension startup
chrome.storage.local.get(['blockedDomains'], (data) => {
  blockedDomains = data.blockedDomains || blockedDomains;
  console.log('Loaded blocked domains from storage:', blockedDomains);
});

// Utility to extract domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname; // Normalize by removing 'www.'
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
  if (!browserFocused || !activeTabId || !startTime || !activeDomain) return; // Skip tracking if the browser is not focused

  const now = Date.now();
  const timeSpent = (now - startTime) / 1000; // Time in seconds
  saveUsageData(activeDomain, timeSpent);
  startTime = now; // Reset start time
}

// Handle tab changes or URL updates
function handleTabChange(newTabId, newUrl) {
  trackTime(); // Save time spent on the previous tab

  const newDomain = getDomain(newUrl);
  const normalizedDomain = newDomain ? (newDomain.startsWith("www.") ? newDomain.slice(4) : newDomain) : null;

  if (normalizedDomain !== activeDomain || newTabId !== activeTabId) {
    activeTabId = newTabId;
    activeDomain = normalizedDomain;
    startTime = browserFocused ? Date.now() : null; // Only set start time if the browser is focused

    // Redirect if the normalized domain is blocked
    if (normalizedDomain && blockedDomains.includes(normalizedDomain)) {
      chrome.tabs.update(activeTabId, { url: redirectPage });
    }
  }
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
  if (changeInfo.url) {
    handleTabChange(tabId, changeInfo.url);
  }
});

// Check browser focus state using chrome.windows.get
function checkBrowserFocus() {
  chrome.windows.getLastFocused((window) => {
    const currentlyFocused = window.focused;
    if (currentlyFocused !== browserFocused) {
      browserFocused = currentlyFocused;

      if (!browserFocused) {
        // Browser lost focus
        trackTime(); // Save the current session time
        startTime = null; // Stop the timer
      } else {
        // Browser regained focus
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            handleTabChange(tabs[0].id, tabs[0].url); // Resume tracking the active tab
          }
        });
      }
    }
  });
}

// Start polling for focus state changes
setInterval(checkBrowserFocus, 500); // Check every 500ms

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

let socket;

function connectToDesktopApp() {
  socket = io('http://127.0.0.1:5000', {
    forceNew: true,
    transports: ["websocket"],
  }); // Connect to the Socket.IO server

  socket.on('connect', () => {
    console.log('Socket.IO connection established');
  });

  socket.on('success', (message) => {
    console.log('Server message:', message);
  });

  socket.on('error', (error) => {
    console.error('Error from server:', error);
  });

  socket.on('disconnect', () => {
    console.log('Socket.IO disconnected, retrying...');
    setTimeout(connectToDesktopApp, 5000); // Retry connection
  });

  // Listen for updates to blocked domains
  socket.on('update_blocked_domains', (newDomain) => {
    if (newDomain) {
      console.log('New domain received from server:', newDomain);
      blockedDomains.push(newDomain); // Update the local list of blocked domains
      chrome.storage.local.set({ blockedDomains }); // Persist the list in local storage
    }
  });  
}

connectToDesktopApp();

setInterval(() => {
  chrome.storage.local.get(['siteUsage'], (data) => {
    siteUsage = data.siteUsage || {};
    if (socket && socket.connected) {
      console.log('emitting web usage');
      socket.emit('web_usage', siteUsage);
    } else {
      console.log('no socket', socket, socket.connected);
    }
  });
}, 1000);
