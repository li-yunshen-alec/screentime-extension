let port = chrome.runtime.connect({ name: "popup" }); // Establish connection with background

// Function to update the UI
function updateSiteUsage(siteUsage) {
  const siteList = document.getElementById("site-list");
  siteList.innerHTML = ""; // Clear previous list

  // Populate with site usage data
  for (const [site, time] of Object.entries(siteUsage)) {
    const li = document.createElement("li");
    li.textContent = `${site}: ${time.toFixed(2)} seconds`;
    siteList.appendChild(li);
  }
}

// Listen for real-time updates from the background
port.onMessage.addListener((message) => {
  if (message.siteUsage) {
    updateSiteUsage(message.siteUsage);
  }
});


// popup.js

// Update toggle buttons based on stored settings.
chrome.storage.sync.get(["imagesSetting", "videosBlocking"], (result) => {
  const imgSetting = result.imagesSetting || "block"; // default to 'block'
  const vidSetting = result.videosBlocking || false;    // false means videos allowed
  const toggleImages = document.getElementById("toggleImages");
  const toggleVideos = document.getElementById("toggleVideos");
  
  if (imgSetting === "allow") {
    toggleImages.classList.remove("blocking");
    toggleImages.classList.add("allowed");
    toggleImages.textContent = "Images Allowed";
  } else {
    toggleImages.classList.remove("allowed");
    toggleImages.classList.add("blocking");
    toggleImages.textContent = "Images Blocked";
  }
  
  if (vidSetting) {
    toggleVideos.classList.remove("allowed");
    toggleVideos.classList.add("blocking");
    toggleVideos.textContent = "Videos Blocked";
  } else {
    toggleVideos.classList.remove("blocking");
    toggleVideos.classList.add("allowed");
    toggleVideos.textContent = "Videos Allowed";
  }
});

// Toggle images setting functionality.
document.getElementById("toggleImages").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "toggleImagesSetting" }, (response) => {
    if (response && response.status === "done") {
      window.close();
    } else {
      console.error("Error toggling images setting:", chrome.runtime.lastError);
    }
  });
});

// Toggle videos setting functionality.
document.getElementById("toggleVideos").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "toggleVideosSetting" }, (response) => {
    if (response && response.status === "done") {
      window.close();
    } else {
      console.error("Error toggling videos setting:", chrome.runtime.lastError);
    }
  });
});
