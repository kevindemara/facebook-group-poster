// content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "post_message") {
    postMessage(request.message)
      .then(() => sendResponse({ status: "success" }))
      .catch(err => sendResponse({ status: "error", message: err.toString() }));
    return true; // Keep message channel open for async
  }
});

/**
 * Main function to post a message. 
 * Same approach that “works” for single-line, 
 * but we replace line breaks in the message with <br>, 
 * then do one-shot insertHTML to preserve multiline.
 */
async function postMessage(message) {
  try {
    // 1. Random initial delay
    await randomDelay(1000, 3000);

    // 2. Find the "Write something..." or "Create post" or "What's on your mind?"
    const postTrigger = await waitForElementMultiple([
      '//div[@role="button"][.//span[contains(text(),"Write something")]]',
      '//div[@role="button"][.//span[contains(text(),"Create post")]]',
      '//div[@role="button"][.//span[contains(text(),"What\'s on your mind")]]'
    ], 20000);
    if (!postTrigger) {
      throw new Error("Could not find the post trigger button on the page.");
    }
    moveCursor(postTrigger);
    await randomDelay(500, 1500);
    postTrigger.click();

    // 3. Wait for post modal
    await Promise.all([
      waitForElement('//div[@role="dialog"]', 20000),
      randomDelay(2000, 5000)
    ]);

    // 4. Find the editor
    const editor = await waitForElement(
      '//div[@contenteditable="true"][@aria-label and (contains(@aria-label, "post") or contains(@aria-label,"Write something") or contains(@aria-label,"on your mind"))]',
      20000
    );
    if (!editor) {
      throw new Error("Could not find the text editor for the post.");
    }
    editor.focus();
    await randomDelay(200, 800);

    // 5. Single-shot insertion with <br> for line breaks
    //    This preserves multiline in one go, avoiding scrambled lines
    const multilineHTML = message.replace(/\r?\n/g, "<br>");
    document.execCommand("insertHTML", false, multilineHTML);

    // optional small delay to seem natural
    await randomDelay(300, 700);

    // 6. Blur/focus noise
    await randomDelay(1000, 2500);
    window.dispatchEvent(new Event("blur"));
    await randomDelay(500, 1500);
    window.dispatchEvent(new Event("focus"));

    // 7. Find and click "Post" button
    const postButton = await waitForElementMultiple([
      '//div[@role="button"][.//span[text()="Post"] and not(@aria-disabled)]',
      '//div[@aria-label="Post"][not(@aria-disabled)]'
    ], 15000);
    if (!postButton) {
      throw new Error("Post button not found or disabled.");
    }
    moveCursor(postButton);
    await randomDelay(300, 900);
    postButton.click();

    console.log("[Content] Successfully clicked Post with multiline HTML insertion.");
    return true;

  } catch (err) {
    console.error("[Content] postMessage error:", err);
    throw err;
  }
}

/*******************************************************
 * Utility Functions
 *******************************************************/

/**
 * Try multiple XPaths, return the first that exists, else null after timeout
 */
async function waitForElementMultiple(xpathList, timeout = 15000, root = document) {
  const startTime = Date.now();
  return new Promise(resolve => {
    const check = () => {
      try {
        for (const xp of xpathList) {
          const result = document.evaluate(
            xp,
            root,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          if (result.singleNodeValue) {
            return resolve(result.singleNodeValue);
          }
        }
        if (Date.now() - startTime < timeout) {
          setTimeout(check, 500);
        } else {
          resolve(null);
        }
      } catch (err) {
        console.error("[Content] waitForElementMultiple error:", err);
        resolve(null);
      }
    };
    check();
  });
}

/**
 * Wait for a single XPath
 */
async function waitForElement(xpath, timeout = 15000, root = document) {
  const startTime = Date.now();
  return new Promise(resolve => {
    const check = () => {
      try {
        const result = document.evaluate(
          xpath,
          root,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        if (result.singleNodeValue) {
          resolve(result.singleNodeValue);
        } else if (Date.now() - startTime < timeout) {
          setTimeout(check, 500);
        } else {
          resolve(null);
        }
      } catch (err) {
        console.error("[Content] waitForElement error:", err);
        resolve(null);
      }
    };
    check();
  });
}

/**
 * Move cursor in increments for a "human-like" effect
 */
function moveCursor(element) {
  const rect = element.getBoundingClientRect();
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    setTimeout(() => {
      window.dispatchEvent(new MouseEvent("mousemove", {
        clientX: rect.left + (rect.width * i / steps),
        clientY: rect.top + (rect.height * i / steps)
      }));
    }, i * 50);
  }
}

/**
 * randomDelay(min, max): sleeps a random ms time between [min, max].
 */
async function randomDelay(min, max) {
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(res => setTimeout(res, duration));
}
