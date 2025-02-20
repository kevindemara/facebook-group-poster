// popup.js

document.addEventListener("DOMContentLoaded", async () => {
  const { popupData } = await chrome.storage.local.get("popupData");
  if (popupData) {
    restorePopupFields(popupData);
  } else {
    addMessageBox(""); // at least one blank
  }

  document.getElementById("addMessageBtn").addEventListener("click", () => {
    addMessageBox("");
    savePopupData();
  });
  document.getElementById("startBtn").addEventListener("click", onStartPosting);
  document.getElementById("stopBtn").addEventListener("click", onStopPosting);

  document.getElementById("groupList").addEventListener("input", savePopupData);
  document.getElementById("baseDelay").addEventListener("input", savePopupData);
  document.getElementById("useRandomDelay").addEventListener("change", savePopupData);
  document.getElementById("minDelay").addEventListener("input", savePopupData);
  document.getElementById("maxDelay").addEventListener("input", savePopupData);

  // fetch current progress/logs from background
  refreshProgressAndLogs();
});

/*******************************************************
 * Creating & Removing message rows
 *******************************************************/
function createMessageRow(initialText) {
  // A row with <textarea> + [X] button
  const row = document.createElement("div");
  row.className = "message-box-row";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.cols = 50;
  textarea.value = initialText;
  textarea.addEventListener("input", savePopupData);

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-msg-btn";
  removeBtn.textContent = "X";
  removeBtn.title = "Remove this message";
  removeBtn.addEventListener("click", () => {
    row.remove();
    savePopupData();
  });

  row.appendChild(textarea);
  row.appendChild(removeBtn);

  return row;
}

function addMessageBox(initialText) {
  const container = document.getElementById("messagesContainer");
  const row = createMessageRow(initialText);
  container.appendChild(row);
}

/**
 * Gather user input from the new row-based UI
 */
function gatherPopupFields() {
  const container = document.getElementById("messagesContainer");
  const rows = container.querySelectorAll(".message-box-row");
  const messages = [];
  rows.forEach(row => {
    const ta = row.querySelector("textarea");
    if (ta) {
      const val = ta.value.trim();
      if (val) messages.push(val);
    }
  });

  const groupList = document.getElementById("groupList").value.trim();

  const baseDelaySec = parseInt(document.getElementById("baseDelay").value, 10) || 15;
  const useRandomDelay = document.getElementById("useRandomDelay").checked;
  const minDelaySec = parseInt(document.getElementById("minDelay").value, 10) || 10;
  const maxDelaySec = parseInt(document.getElementById("maxDelay").value, 10) || 20;

  const baseDelayMs = baseDelaySec * 1000;
  const minDelayMs = minDelaySec * 1000;
  const maxDelayMs = maxDelaySec * 1000;

  return {
    messages,
    groupList,
    baseDelay: baseDelayMs,
    useRandomDelay,
    minDelay: minDelayMs,
    maxDelay: maxDelayMs
  };
}

async function savePopupData() {
  const data = gatherPopupFields();
  await chrome.storage.local.set({ popupData: data });
}

function restorePopupFields(data) {
  // restore messages
  if (data.messages && data.messages.length > 0) {
    data.messages.forEach(msg => addMessageBox(msg));
  } else {
    addMessageBox("");
  }

  // restore groupList
  document.getElementById("groupList").value = data.groupList || "";

  // convert ms back to seconds
  const baseSec = (data.baseDelay ?? 15000) / 1000;
  const minSec = (data.minDelay ?? 10000) / 1000;
  const maxSec = (data.maxDelay ?? 20000) / 1000;

  document.getElementById("baseDelay").value = baseSec;
  document.getElementById("useRandomDelay").checked = data.useRandomDelay ?? false;
  document.getElementById("minDelay").value = minSec;
  document.getElementById("maxDelay").value = maxSec;
}

/**
 * Start/Stop
 */
async function onStartPosting() {
  const popupData = gatherPopupFields();
  await chrome.storage.local.set({ popupData });

  const groups = popupData.groupList
    .split("\n")
    .map(line => line.trim())
    .filter(line => line)
    .map(url => ({ url, lastPosted: null }));

  const request = {
    action: "start_posting",
    groups,
    messages: popupData.messages,
    delayOptions: {
      baseDelay: popupData.baseDelay,
      useRandomDelay: popupData.useRandomDelay,
      minDelay: popupData.minDelay,
      maxDelay: popupData.maxDelay
    }
  };

  chrome.runtime.sendMessage(request, () => {
    refreshProgressAndLogs();
  });
}

function onStopPosting() {
  chrome.runtime.sendMessage({ action: "stop_posting" }, () => {
    refreshProgressAndLogs();
  });
}

/*******************************************************
 * Refresh progress/logs
 *******************************************************/
function refreshProgressAndLogs() {
  chrome.runtime.sendMessage({ action: "get_progress" }, (response) => {
    if (!response) return;
    updateProgressUI(response);
    updateLogsUI(response.logs);
    setUIDisabled(response.isPosting);
  });
}

function updateProgressUI({ isPosting, currentIndex, totalGroups, nextGroupUrl }) {
  const progressInfoEl = document.getElementById("progressInfo");
  const progressBarEl = document.getElementById("progressBar");
  const nextGroupSpan = document.getElementById("nextGroupSpan");

  if (!totalGroups) {
    progressInfoEl.textContent = "No groups to post.";
    progressBarEl.style.width = "0%";
    nextGroupSpan.textContent = "";
    return;
  }
  if (!isPosting) {
    progressInfoEl.textContent = "Not currently posting.";
    progressBarEl.style.width = "0%";
    nextGroupSpan.textContent = "";
    return;
  }

  const currentDisplay = currentIndex + 1;
  progressInfoEl.textContent = `Currently posting to group ${currentDisplay} of ${totalGroups}.`;

  const pct = Math.floor((currentDisplay / totalGroups) * 100);
  progressBarEl.style.width = pct + "%";

  if (nextGroupUrl) {
    nextGroupSpan.textContent = nextGroupUrl;
  } else {
    nextGroupSpan.textContent = "N/A (No more groups)";
  }
}

function updateLogsUI(logs) {
  const logsPanel = document.getElementById("logsPanel");
  logsPanel.innerHTML = "";
  if (!logs || !logs.length) {
    logsPanel.textContent = "No logs yet.";
    return;
  }
  logs.forEach(log => {
    const div = document.createElement("div");
    div.classList.add("log-entry");
    const dt = new Date(log.time).toLocaleTimeString();
    if (log.success) {
      div.classList.add("success");
      div.textContent = `[${dt}] Group #${log.groupIndex + 1} posted OK: ${log.groupUrl}`;
    } else {
      div.classList.add("error");
      div.textContent = `[${dt}] Group #${log.groupIndex + 1} ERROR: ${log.groupUrl}. ${log.error}`;
    }
    logsPanel.appendChild(div);
  });
}

function setUIDisabled(isPosting) {
  document.getElementById("startBtn").disabled = isPosting;
  document.getElementById("addMessageBtn").disabled = isPosting;
}
