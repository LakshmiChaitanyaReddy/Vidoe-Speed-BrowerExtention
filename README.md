# Zoomie — Video Speed Control

A Chrome extension that lets you change the playback speed of any video and remembers your speed for each site, so you don't have to set it every time a page loads.

## Features

- **Per-site memory** — the speed is saved by site (e.g. `youtube.com`) and re-applied automatically, including for videos that load later (next video, infinite feeds, embedded players).
- **Any speed you want** — type a custom value from 0.07× to 16×, or use the slider and presets (0.5×–3×).
- **On-video bar** — a small `− 1.5 +` control appears on the video; the number is editable.
- **Keyboard shortcuts** — `Shift+>` faster, `Shift+<` slower, `Shift+?` reset to 1× (ignored while typing in a text field).
- **"Remember for this site" toggle** — turn it off to apply a speed to the current page only, without saving it.
- **Saved sites list** — view and delete saved speeds, or reset everything.
- **YouTube sync** — changes go through YouTube's player so its own speed indicator in the settings menu stays correct.
- Fights sites that reset the speed on load; a speed you pick in a site's own menu is picked up and remembered.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Refresh any tabs that were already open.

Requires Chrome 111 or newer (uses a content script that runs in the page's own context).

## Usage

| Action | How |
| --- | --- |
| Set speed | Click the toolbar icon and use the slider, a preset chip, or the custom box |
| Quick adjust | Hover the video and use the bar, or use the keyboard shortcuts |
| Stop remembering for a site | Switch off **Remember for this site** in the popup |
| See / delete saved speeds | **Saved sites** in the popup |
| Clear everything | **Reset all** in the popup |

## Project layout

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3) |
| `content.js` | Finds videos, applies and stores the speed, on-video bar, shortcuts |
| `content.css` | Styling for the on-video bar |
| `page.js` | Runs in the page's JS world to talk to YouTube's player API |
| `popup.html` / `popup.css` / `popup.js` | Toolbar popup UI |
| `icons/` | Extension icons |

## Notes and limitations

- The on-video bar only shows when the video's container is positioned in CSS; otherwise use the popup or shortcuts.
- Services with their own speed handling (e.g. Netflix, Disney+) may not behave perfectly.
- Speeds are stored locally in `chrome.storage.local`; nothing is sent anywhere.
