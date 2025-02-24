import { io } from "https://cdn.jsdelivr.net/npm/socket.io-client@4.7.1/+esm";

// Global variables
let siteUsage = {};           // Time spent per site tracking
let activeTabId = null;       // Active tab ID
let activeDomain = null;      // Active domain
let startTime = null;         // Start time for active tab tracking
let popupPort = null;         // Reference to the connected popup port
let browserFocused = true;    // Browser focus state
let blockedDomains = [];      // Domains to block (for redirection)
let whitelistedDomains = [];  // Domains that bypass redirection

// Flags for blocking
// For images we use chrome.contentSettings (via mediaBlockingEnabled)
let mediaBlockingEnabled = false;
// For videos we use CSS injection via chrome.scripting
let videosBlockingEnabled = false;

const redirectPage = chrome.runtime.getURL("redirect.html");

// ----------------------------
// Load stored settings on startup
// ----------------------------
chrome.storage.local.get(["blockedDomains"], (data) => {
  blockedDomains = data.blockedDomains || [];
  console.log("Loaded blocked domains:", blockedDomains);
});
chrome.storage.local.get(["whitelistedDomains"], (data) => {
  whitelistedDomains = data.whitelistedDomains || [];
  console.log("Loaded whitelisted domains:", whitelistedDomains);
});
chrome.storage.local.get(["mediaBlocking"], (data) => {
  mediaBlockingEnabled = data.mediaBlocking || false;
  console.log("Media (images) blocking enabled:", mediaBlockingEnabled);
});
chrome.storage.sync.get(["videosBlocking"], (data) => {
  videosBlockingEnabled = data.videosBlocking || false;
  console.log("Videos blocking enabled:", videosBlockingEnabled);
});

// ----------------------------
// Helper Functions
// ----------------------------
function isValidUrl(url) {
  return /^https?:\/\//.test(url);
}

function getDomain(url) {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return null;
  }
}
function normalizeDomain(domain) {
  if (!domain) return null;
  return domain.replace(/^(https?:\/\/)?(www\.)?/i, "");
}
function isWhitelisted(url) {
  console.log("Checking whitelist for", url);
  const domain = getDomain(url);
  if (!domain) return false;
  const normalized = normalizeDomain(domain);
  return whitelistedDomains.some((w) => {
    return normalized === normalizeDomain(w) ||
           normalized.startsWith(normalizeDomain(w));
  });
}

// ----------------------------
// Tracking Functions
// ----------------------------
function saveUsageData(domain, timeSpent) {
  if (!domain || timeSpent <= 0) return;
  siteUsage[domain] = (siteUsage[domain] || 0) + timeSpent;
  chrome.storage.local.set({ siteUsage });
}
function trackTime() {
  if (!browserFocused || !activeTabId || !startTime || !activeDomain) return;
  const now = Date.now();
  const timeSpent = (now - startTime) / 1000;
  saveUsageData(activeDomain, timeSpent);
  startTime = now;
}
function handleTabChange(newTabId, newUrl) {
  trackTime();
  const newDomain = getDomain(newUrl);
  if (newDomain && !isWhitelisted(newUrl) && blockedDomains.includes(newDomain)) {
    chrome.tabs.update(newTabId, { url: redirectPage });
  }
  if (newDomain !== activeDomain) {
    activeTabId = newTabId;
    activeDomain = newDomain;
    startTime = browserFocused ? Date.now() : null;
  }
  // Apply video blocking on this tab.
  applyVideoBlockingForTab({ id: newTabId, url: newUrl });
}

// ----------------------------
// Images Blocking Functions (using chrome.contentSettings)
// ----------------------------
async function getImageSettingForPattern(pattern) {
  return new Promise((resolve, reject) => {
    chrome.contentSettings.images.get({ primaryUrl: pattern }, (details) => {
      if (chrome.runtime.lastError) {
        console.error(`Error getting current setting for ${pattern}:`, chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError);
      } else if (details) {
        resolve(details.setting);
      } else {
        console.error(`No details found for ${pattern}`);
        reject(new Error("No details found"));
      }
    });
  });
}

async function getCurrentImagesSetting() {
  const patterns = ["http://*/*", "https://*/*"];
  try {
    const results = await Promise.all(patterns.map(getImageSettingForPattern));
    return results[0]; // assume both patterns share the same setting
  } catch (err) {
    console.error("Error getting current images setting:", err);
    return null;
  }
}

async function setImagesSetting(setting) {
  return new Promise((resolve, reject) => {
    chrome.contentSettings.images.set(
      {
        primaryPattern: "<all_urls>",
        setting: setting,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Error setting images setting:", chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else {
          console.log(`Images are now ${setting === "allow" ? "allowed" : "blocked"}.`);
          chrome.storage.sync.set({ imagesSetting: setting }, () => {
            refreshCurrentTab();
            resolve();
          });
        }
      }
    );
  });
}

async function toggleImagesSetting() {
  try {
    const currentSetting = await getCurrentImagesSetting();
    const newSetting = currentSetting === "allow" ? "block" : "allow";
    await setImagesSetting(newSetting);
  } catch (error) {
    console.error("toggleImagesSetting error:", error.message);
    throw error;
  }
}

function refreshCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.reload(tabs[0].id);
    }
  });
}

// ----------------------------
// Video Blocking Functions (using chrome.scripting)
// ----------------------------
function applyVideoBlockingForTab(tab) {
  if (!tab.url || !isValidUrl(tab.url)) return;
  if (videosBlockingEnabled) {
    chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      css: "video { opacity: 0 !important; }"
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Failed to insert CSS for video blocking:", chrome.runtime.lastError);
      }
    });
  } else {
    chrome.scripting.removeCSS({
      target: { tabId: tab.id },
      css: "video { opacity: 0 !important; }"
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Failed to remove CSS for video blocking:", chrome.runtime.lastError);
      }
    });
  }
}

async function toggleVideosSetting() {
  videosBlockingEnabled = !videosBlockingEnabled;
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ videosBlocking: videosBlockingEnabled }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving videos blocking setting:", chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError);
      } else {
        console.log(`Videos are now ${videosBlockingEnabled ? "blocked" : "allowed"}.`);
        // Refresh active tab to update video blocking CSS.
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) applyVideoBlockingForTab(tabs[0]);
        });
        resolve();
      }
    });
  });
}

// ----------------------------
// Event Listeners: Tab events, focus, etc.
// ----------------------------
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab && tab.url) {
      console.log("Tab activated:", tabId, tab.url);
      handleTabChange(tabId, tab.url);
    }
  });
});
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  const { tabId, url, frameId } = details;
  if (frameId !== 0 || !url || !isValidUrl(url)) return;
  console.log("Navigation change:", tabId, url);
  handleTabChange(tabId, url);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && isValidUrl(changeInfo.url)) {
    console.log("Tab updated:", tabId, changeInfo.url);
    handleTabChange(tabId, changeInfo.url);
  } else if (changeInfo.status === "complete" && tab.url) {
    // Reapply video blocking when loading is complete.
    applyVideoBlockingForTab(tab);
  }
});
function checkBrowserFocus() {
  chrome.windows.getLastFocused((win) => {
    const focused = win.focused;
    if (focused !== browserFocused) {
      browserFocused = focused;
      if (!browserFocused) {
        trackTime();
        startTime = null;
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) handleTabChange(tabs[0].id, tabs[0].url);
        });
      }
    }
  });
}
setInterval(checkBrowserFocus, 500);

// ----------------------------
// Popup connection (for real-time updates)
// ----------------------------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    console.log("Popup connected");
    popupPort = port;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) handleTabChange(tabs[0].id, tabs[0].url);
    });
    const interval = setInterval(() => {
      if (!popupPort) { clearInterval(interval); return; }
      trackTime();
      chrome.storage.local.get("siteUsage", (data) => {
        try {
          popupPort.postMessage({ siteUsage: data.siteUsage || {} });
        } catch (e) {
          console.error("Popup messaging error:", e.message);
          clearInterval(interval);
        }
      });
    }, 1000);
    popupPort.onDisconnect.addListener(() => {
      console.log("Popup disconnected");
      popupPort = null;
      clearInterval(interval);
    });
  }
});
setInterval(() => { if (!popupPort) trackTime(); }, 1000);

// ----------------------------
// Socket.IO Integration
// ----------------------------
let socket;
function connectToDesktopApp() {
  socket = io("http://127.0.0.1:5000", {
    forceNew: true,
    transports: ["websocket"]
  });
  socket.on("connect", () => { console.log("Socket.IO connected"); });
  socket.on("success", (msg) => { console.log("Server message:", msg); });
  socket.on("error", (err) => { console.error("Socket error:", err); });
  socket.on("disconnect", () => { 
    console.log("Socket disconnected, retrying...");
    setTimeout(connectToDesktopApp, 5000);
  });
  socket.on("website_blacklist_updated", (data) => {
    console.log("Blacklist updated:", data.websites);
    if (data && data.websites) {
      blockedDomains = data.websites;
      chrome.storage.local.set({ blockedDomains });
    }
  });
  socket.on("website_whitelist_updated", (data) => {
    console.log("Whitelist updated:", data.websites);
    if (data && data.websites) {
      whitelistedDomains = data.websites;
      chrome.storage.local.set({ whitelistedDomains });
      // Optionally, refresh rules if needed.
    }
  });
  socket.on("media_blocking_updated", (data) => {
    console.log("Media blocking update (images) received:", data);
    if (data && typeof data.enabled === "boolean") {
      mediaBlockingEnabled = data.enabled;
      chrome.storage.local.set({ mediaBlocking: mediaBlockingEnabled });
      // Immediately update images using contentSettings:
      const setting = mediaBlockingEnabled ? "block" : "allow";
      setImagesSetting(setting).catch(err => console.error(err));
    }
  });
  socket.on("videos_blocking_updated", (data) => {
    console.log("Videos blocking update received:", data);
    if (data && typeof data.enabled === "boolean") {
      videosBlockingEnabled = data.enabled;
      chrome.storage.sync.set({ videosBlocking: videosBlockingEnabled });
      // Refresh active tab to update video blocking.
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) applyVideoBlockingForTab(tabs[0]);
      });
    }
  });
}
connectToDesktopApp();

// ----------------------------
// Periodically emit web usage
// ----------------------------
setInterval(() => {
  chrome.storage.local.get(["siteUsage"], (data) => {
    siteUsage = data.siteUsage || {};
    if (socket && socket.connected) {
      console.log("Emitting web usage");
      socket.emit("web_usage", siteUsage);
    } else {
      console.log("Socket not connected", socket, socket && socket.connected);
    }
  });
}, 1000);

// ----------------------------
// Message Listener for Toggle Requests
// ----------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background:", request);
  if (request.action === "toggleImagesSetting") {
    console.log("Toggling images setting");
    toggleImagesSetting()
      .then(() => sendResponse({ status: "done" }))
      .catch(() => sendResponse({ status: "error" }));
  } else if (request.action === "toggleVideosSetting") {
    console.log("Toggling videos setting");
    toggleVideosSetting()
      .then(() => sendResponse({ status: "done" }))
      .catch(() => sendResponse({ status: "error" }));
  } else if (request.action === "getMediaBlockingState") {
    sendResponse({ 
      imagesEnabled: mediaBlockingEnabled, 
      videosEnabled: videosBlockingEnabled 
    });
  } else {
    console.log("Unknown action received:", request.action);
  }
  return true;
});
