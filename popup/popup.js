// popup.js

let port = chrome.runtime.connect({ name: "popup" });

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

function updateToggleStates() {
  chrome.storage.local.get(["videosBlocking", "mediaBlocking"], (result) => {
    console.log("result:", result);
    console.log("mediaBlocking:", result.mediaBlocking);
    console.log("videosBlocking:", result.videosBlocking);

    const imagesBlocked = result.mediaBlocking || false;
    const videosBlocked = result.videosBlocking || false;
    const toggleImages = document.getElementById("imagesStatus");
    const toggleVideos = document.getElementById("videosStatus");

    // Update images toggle
    if (imagesBlocked) {
      toggleImages.classList.remove("allowed");
      toggleImages.classList.add("blocking");
      toggleImages.textContent = "Blocked";
    } else {
      toggleImages.classList.remove("blocking");
      toggleImages.classList.add("allowed");
      toggleImages.textContent = "Allowed";
    }

    // Update videos toggle
    if (videosBlocked) {
      toggleVideos.classList.remove("allowed");
      toggleVideos.classList.add("blocking");
      toggleVideos.textContent = "Blocked";
    } else {
      toggleVideos.classList.remove("blocking");
      toggleVideos.classList.add("allowed");
      toggleVideos.textContent = "Allowed";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Dark mode toggle functionality
  const darkModeToggle = document.getElementById("darkModeToggle")
  const body = document.body

  // Check for saved theme preference
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

  // Initial updates
  refreshDomainLists();
  updateToggleStates();
})

// Listen for storage updates
chrome.storage.onChanged.addListener((changes) => {
  console.log('changes', changes);
  if (changes.blockedDomains || changes.whitelistedDomains) {
    refreshDomainLists();
  }
  if (changes.mediaBlocking || changes.videosBlocking) {
    updateToggleStates();
  }
});