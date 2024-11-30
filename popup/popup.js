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
