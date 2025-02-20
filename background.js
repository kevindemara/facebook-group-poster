// background.js

let postingState = {};
let currentTabId = null;

// NEW: track the extension popup window so we don't open multiples
let extensionWindowId = null;

// On extension load
initState();

// When the user clicks the extension icon
chrome.action.onClicked.addListener(() => {
  // If we already have the popup window, focus it
  if (extensionWindowId !== null) {
    chrome.windows.get(extensionWindowId, { populate: false }, (win) => {
      if (chrome.runtime.lastError || !win) {
        // The window ID is invalid, create a new one
        createExtensionWindow();
      } else {
        // Focus the existing window
        chrome.windows.update(extensionWindowId, { focused: true });
      }
    });
  } else {
    // No extension window yet, create one
    createExtensionWindow();
  }
});

// If user manually closes the popup window, reset extensionWindowId
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === extensionWindowId) {
    extensionWindowId = null;
  }
});

function createExtensionWindow() {
  // "popup/popup.html" => referencing your existing folder structure
  chrome.windows.create({
    url: "popup/popup.html",
    type: "popup",
    focused: true,
    width: 1000,
    height: 750
  }, (win) => {
    extensionWindowId = win.id;
  });
}

// Now your existing code:
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start_posting") {
    handleStartPosting(request);
  } else if (request.action === "stop_posting") {
    handleStopPosting();
  } else if (request.action === "get_progress") {
    sendResponse(getProgressInfo());
  }
});

/**
 * initState: load from storage
 */
async function initState() {
  const { postingState: storedState } = await chrome.storage.local.get("postingState");
  if (storedState) {
    postingState = storedState;
    console.log("[BG] Loaded state on init:", postingState);
  } else {
    console.log("[BG] No existing postingState on init.");
    postingState = {
      groups: [],
      messages: [],
      logs: [],
      isPosting: false,
      currentIndex: 0,
      messageIndex: 0,
      delayOptions: {}
    };
  }
}

/**
 * handleStartPosting
 */
async function handleStartPosting(request) {
  await loadState();

  // Overwrite with new data from popup
  postingState.groups = request.groups || [];
  postingState.messages = request.messages || [];
  postingState.delayOptions = request.delayOptions || {};
  postingState.currentIndex = 0;
  postingState.messageIndex = 0;
  postingState.isPosting = false;

  // Clear logs for a fresh session
  postingState.logs = [];

  if (!postingState.messages.length) {
    console.log("[BG] No messages. Aborting start.");
    return;
  }
  if (!postingState.groups.length) {
    console.log("[BG] No groups found. Aborting start.");
    return;
  }

  postingState.isPosting = true;
  await saveState();

  console.log("[BG] Starting posting with multiple messages...");
  processNextGroup();
}

/**
 * handleStopPosting
 */
async function handleStopPosting() {
  await loadState();
  postingState.isPosting = false;
  await saveState();

  console.log("[BG] Stopped posting by user request.");
  if (currentTabId) {
    await closeTabSafely(currentTabId);
    currentTabId = null;
  }
}

/**
 * processNextGroup: main loop
 */
async function processNextGroup() {
  await loadState();

  if (!postingState.isPosting) {
    console.log("[BG] isPosting = false, halting.");
    return;
  }

  if (postingState.currentIndex >= postingState.groups.length) {
    console.log("[BG] All groups processed, done.");
    postingState.isPosting = false;
    await saveState();
    return;
  }

  // Check how many tabs are open in the current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  if (tabs.length === 1) {
    // There's only one tab in this window, so let's see if there's already
    // an about:blank tab. If not, create one.
    const blankTab = await findExistingBlankTab();
    if (!blankTab) {
      console.log("[BG] Only 1 tab in current window and no blank tab found; creating about:blank...");
      await chrome.tabs.create({ url: "about:blank", active: false });
    } else {
      console.log("[BG] Only 1 tab in current window, but found existing blank tab (ID: " + blankTab.id + "). No new tab created.");
    }
  }

  const currentGroup = postingState.groups[postingState.currentIndex];
  console.log(`[BG] Processing group ${postingState.currentIndex + 1}/${postingState.groups.length}: ${currentGroup.url}`);

  let tab;
  try {
    // open the group tab
    tab = await chrome.tabs.create({
      url: currentGroup.url,
      active: true
    });
    currentTabId = tab.id;

    await waitForTabComplete(currentTabId);

    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ["content.js"]
    });

    // small wait
    await delay(4000);

    // attempt to post
    await sendMessageWithRetry(currentTabId, 0);

    // logs: success
    postingState.logs.push({
      groupIndex: postingState.currentIndex,
      groupUrl: currentGroup.url,
      success: true,
      time: Date.now()
    });

    postingState.currentIndex++;
    await saveState();

    const nextDelay = getDelayTime();
    console.log(`[BG] Next delay (ms): ${nextDelay}`);

    // random 2-5s before closing
    await randomDelay(2000, 5000);

    await closeTabSafely(currentTabId);
    currentTabId = null;

    setTimeout(processNextGroup, nextDelay);

  } catch (err) {
    console.error("[BG] Error processing group:", err);

    // logs: error
    postingState.logs.push({
      groupIndex: postingState.currentIndex,
      groupUrl: currentGroup.url,
      success: false,
      error: err.toString(),
      time: Date.now()
    });

    postingState.currentIndex++;
    await saveState();

    if (currentTabId) {
      await closeTabSafely(currentTabId);
      currentTabId = null;
    }

    const failDelay = getDelayTime() + 5000;
    console.log(`[BG] Retry after error in ${failDelay}ms.`);
    setTimeout(processNextGroup, failDelay);
  }
}


/**
 * sendMessageWithRetry
 */
async function sendMessageWithRetry(tabId, attempt) {
  try {
    await loadState();

    const msgs = postingState.messages || [];
    const msgIndex = postingState.messageIndex || 0;
    if (!msgs.length) throw new Error("No messages in postingState");

    const messageToPost = msgs[msgIndex];

    // talk to content.js
    await chrome.tabs.sendMessage(tabId, {
      action: "post_message",
      message: messageToPost
    });

    console.log(`[BG] Post success on try #${attempt + 1}, messageIndex ${msgIndex}`);

    // rotate
    postingState.messageIndex = (msgIndex + 1) % msgs.length;
    await saveState();

  } catch (err) {
    if (attempt < 2) {
      console.log(`[BG] Retry #${attempt + 1} after error: ${err}`);
      await delay(3000);
      return sendMessageWithRetry(tabId, attempt + 1);
    } else {
      throw err;
    }
  }
}

/**
 * getProgressInfo
 */
function getProgressInfo() {
  const total = postingState.groups.length || 0;
  const index = postingState.currentIndex || 0;

  let nextGroupUrl = null;
  if (index < total) {
    const nextGroup = postingState.groups[index];
    if (nextGroup) nextGroupUrl = nextGroup.url;
  }

  return {
    isPosting: postingState.isPosting,
    currentIndex: index,
    totalGroups: total,
    logs: postingState.logs || [],
    nextGroupUrl
  };
}

/*******************************************************
 * Utility
 *******************************************************/
function waitForTabComplete(tabId) {
  return new Promise(resolve => {
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function getDelayTime() {
  const { delayOptions } = postingState;
  if (!delayOptions) return 15000;

  if (delayOptions.useRandomDelay) {
    const { minDelay, maxDelay } = delayOptions;
    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  }
  return delayOptions.baseDelay || 15000;
}

function randomDelay(min, max) {
  const dur = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(dur);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadState() {
  const { postingState: s } = await chrome.storage.local.get("postingState");
  if (s) postingState = s;
}

async function saveState() {
  await chrome.storage.local.set({ postingState });
}

async function closeTabSafely(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    console.log(`[BG] Tab ${tabId} closed successfully.`);
  } catch (e) {
    console.warn(`[BG] Failed to close tab ${tabId}:`, e);
  }
}

/**
 * findExistingBlankTab: checks if there's an open about:blank tab
 * in the current window, returning it if found, or null otherwise
 */
async function findExistingBlankTab() {
  const tabsInWindow = await chrome.tabs.query({ currentWindow: true });
  for (const t of tabsInWindow) {
    // Some browsers might show "about:blank" or "about:blank#..." etc
    if (t.url && t.url.startsWith("about:blank")) {
      return t;
    }
  }
  return null;
}

