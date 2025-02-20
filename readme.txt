================================================================================
Facebook Group Poster with Persistence
================================================================================

This Chrome extension automates posting messages (including multiline) to
multiple Facebook groups, with added persistence, logging, and progress tracking.

--------------------------------------------------------------------------------
INSTALLATION & SETUP
--------------------------------------------------------------------------------
1) Load the extension in Chrome:
   - Open chrome://extensions
   - Enable "Developer Mode" (top-right corner)
   - Click "Load Unpacked"
   - Select the folder containing this extension's manifest.json and code

2) Permissions:
   - The extension requests access to "tabs," "scripting," "activeTab," and
     "*://*.facebook.com/*" to open Facebook group tabs and insert the content script

--------------------------------------------------------------------------------
USAGE
--------------------------------------------------------------------------------
1) Click the extension icon in Chrome’s toolbar. This opens a dedicated popup
   window for managing posts.

2) In the popup:
   - Enter one or more messages in the "Messages" section (add or remove each).
   - Paste your list of Facebook group URLs in "Group URLs (one per line)."
   - Set your desired delay options (fixed base delay or random range).
   - Click "Start Posting" to begin. "Stop Posting" halts at any time.

3) The extension:
   - Opens each group in a new tab (focusing it).
   - Inserts your message (including line breaks) via a "paste-like" approach.
   - Clicks "Post," logs success or error, then closes that tab.
   - Respects your set delays between posts.
   - If only one tab is open, creates an about:blank tab to avoid closing Chrome.

4) Progress & Logs:
   - The popup displays current progress (e.g., "Posting group 2/7"), next group URL,
     and a progress bar.
   - A logs panel shows each group’s success or error with timestamps.

--------------------------------------------------------------------------------
NOTES & LIMITATIONS
--------------------------------------------------------------------------------
1) Facebook’s anti-automation detection may block or error out if it detects
   scripted behavior. The code is provided for demonstration only, so use with
   caution.
2) Because the extension runs content scripts inside group pages, it is subject
   to Facebook’s terms and detection logic.
3) Data (messages, group links) is saved in chrome.storage.local so it persists
   between sessions.

--------------------------------------------------------------------------------
FOLDER STRUCTURE
--------------------------------------------------------------------------------
- manifest.json     => Chrome extension manifest
- background.js     => Service worker logic for tab creation, logging, progress
- content.js        => Insert messages into Facebook group pages
- popup/
  |-- popup.html    => UI for user input, progress display, logs
  |-- popup.js      => Front-end logic for storing data, start/stop, logs

--------------------------------------------------------------------------------
SUPPORT & CONTACT
--------------------------------------------------------------------------------
- This is purely a learning project. No official support or warranty.
- Use at your own discretion. 

--------------------------------------------------------------------------------
DISCLAMER / LEGAL
--------------------------------------------------------------------------------
- This project is NOT affiliated, associated, authorized, or endorsed by
  Facebook or Meta in any way.
- The code is intended for educational and demonstration purposes ONLY.
- Use this code or extension at your own risk. You assume any liability for
  violations of terms or policies.
- Always comply with the platform’s Terms of Service when using automation tools.