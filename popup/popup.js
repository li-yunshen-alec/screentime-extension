// popup.js

let port = chrome.runtime.connect({ name: "popup" }); // Establish connection with background

// Domain list management
function updateDomainList(listId, domains) {
  const list = document.getElementById(listId);
  list.innerHTML = domains.map(domain => 
    `<li>${domain}</li>`
  ).join('');
}

function refreshDomainLists() {
  chrome.storage.local.get(
    ["blockedDomains", "whitelistedDomains"],
    ({ blockedDomains = [], whitelistedDomains = [] }) => {
      updateDomainList("blockedList", blockedDomains);
      updateDomainList("whitelistedList", whitelistedDomains);
    }
  );
}

// Initial load
chrome.storage.sync.get(["imagesSetting", "videosBlocking"], (result) => {
  // Existing toggle button code...
  refreshDomainLists();
});

// Listen for storage updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedDomains || changes.whitelistedDomains) {
    refreshDomainLists();
  }
});

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

document.addEventListener("DOMContentLoaded", () => {
  // Dark mode toggle functionality
  const darkModeToggle = document.getElementById("darkModeToggle")
  const body = document.body

  // Check for saved theme preference or respect OS preference
  const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)")
  const savedTheme = localStorage.getItem("theme")

  if (savedTheme === "dark" || (!savedTheme && prefersDarkScheme.matches)) {
    body.classList.add("dark-mode")
    darkModeToggle.checked = true
  }

  darkModeToggle.addEventListener("change", function () {
    if (this.checked) {
      body.classList.add("dark-mode")
      localStorage.setItem("theme", "dark")
    } else {
      body.classList.remove("dark-mode")
      localStorage.setItem("theme", "light")
    }
  })

  const blockedList = document.getElementById("blockedList")
  const whitelistedList = document.getElementById("whitelistedList")
  const blockedEmpty = document.getElementById("blockedEmpty")
  const whitelistedEmpty = document.getElementById("whitelistedEmpty")

  if (blockedSites.length > 0) {
    blockedEmpty.style.display = "none"
    blockedSites.forEach((site) => {
      const li = document.createElement("li")
      li.textContent = site
      const span = document.createElement("span")
      span.textContent = "Blocked"
      span.className = "blocking"
      li.appendChild(span)
      blockedList.appendChild(li)
    })
  }

  if (whitelistedSites.length > 0) {
    whitelistedEmpty.style.display = "none"
    whitelistedSites.forEach((site) => {
      const li = document.createElement("li")
      li.textContent = site
      const span = document.createElement("span")
      span.textContent = "Allowed"
      span.className = "allowed"
      li.appendChild(span)
      whitelistedList.appendChild(li)
    })
  }
})