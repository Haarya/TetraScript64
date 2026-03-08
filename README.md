<!-- Banner -->
<p align="center">
  <img src="website/logo.png" alt="TetraScript64 Logo" width="60" />
</p>

<h1 align="center">TetraScript64</h1>

<p align="center">
  A zero-knowledge, client-side encryption vault — built entirely in the browser.<br/>
  Encrypt text, audio, video &amp; personal diary entries. No server. No leaks. No traces.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/build-V6.0.0-white?style=flat-square" alt="Build" />
  <img src="https://img.shields.io/badge/encryption-AES--GCM%20256--bit-white?style=flat-square" alt="Encryption" />
  <img src="https://img.shields.io/badge/backend-none-white?style=flat-square" alt="No Backend" />
  <img src="https://img.shields.io/badge/storage-IndexedDB-white?style=flat-square" alt="Storage" />
  <img src="https://img.shields.io/badge/license-MIT-white?style=flat-square" alt="License" />
</p>

---

## Table of Contents

1. [What Is TetraScript64?](#-what-is-tetrascript64)
2. [Features](#-features)
3. [How It Works](#-how-it-works)
4. [Project Structure](#-project-structure)
5. [Tabs & UI Overview](#-tabs--ui-overview)
6. [Terminal Commands](#-terminal-commands)
7. [File Formats](#-file-formats)
8. [Security Architecture](#-security-architecture)
9. [Running Locally](#-running-locally)
10. [Deploying](#-deploying)
11. [Browser Compatibility](#-browser-compatibility)
12. [Roadmap](#-roadmap)

---

## 🔐 What Is TetraScript64?

**TetraScript64** is a fully offline, zero-knowledge encryption vault that runs 100% inside your web browser. There is no backend, no database, no server — every encrypt, decrypt, stash, and unlock operation happens entirely in-browser using the native **Web Crypto API** (`crypto.subtle`) and stored securely in **IndexedDB**.

Think of it as your personal, air-gapped data safe — accessed through a hacker-aesthetic terminal UI.

> **Zero-knowledge guarantee:** Your data never leaves your browser. Not even a single byte is transmitted to any server.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Text Encryption** | Encrypt any text string with AES-GCM 256-bit. Retrieve it with a generated key. |
| **Audio Encryption** | Encrypt audio files (MP3, WAV, FLAC, AAC, OGG, M4A) with chunked AES-GCM and store in IndexedDB. |
| **Video Encryption** | Stream-encrypt large video files (MP4, WebM, MKV, MOV, AVI) and save as `.ts64vid`. Supports GB-scale files. |
| **Personal Diary** | Create named, AES-GCM encrypted diary vaults with date-indexed entries stored per node. |
| **Terminal Interface** | Interact via a full hacker-style terminal with command history and drag-and-drop support. |
| **Dashboard** | Real-time vault memory usage, stash counts per type, and storage quota display. |
| **Offline Backups** | Export any stash or diary node as a portable encrypted file. Drag-drop to restore anywhere. |
| **Zero Dependencies** | No Node.js, no compilation step, no npm required. Tailwind CSS is loaded via CDN. |
| **Advanced CRT UI** | Multi-panel dark-mode interface with sidebars, scanlines, monospace fonts, and a robust terminal layout. |

---

## ⚙️ How It Works

### Encryption Flow

```
User Input (text / file)
        │
        ▼
generatePassword()  →  TS64-XXXX-XXXX  (your access key)
        │
        ▼
PBKDF2(password, randomSalt, 100,000 iterations, SHA-256)
        │
        ▼
AES-GCM 256-bit encrypt (random IV per block)
        │
        ▼
Stored in IndexedDB  (or streamed to disk for video)
```

### Decryption Flow

```
User provides: TS64-XXXX-XXXX
        │
        ▼
Load encrypted blob from IndexedDB
        │
        ▼
PBKDF2 key derivation (same password + embedded salt)
        │
        ▼
AES-GCM decrypt  →  Original data
```

### Chunked Engine (Audio & Video)

Large files (audio/video) use a **chunked streaming engine** with 8 MB chunks. Each chunk gets its own random IV, making partial-block attacks impossible. Video files are stream-written directly to disk via the **File System Access API** (`showSaveFilePicker`), meaning even a 10 GB video never fully loads into RAM.

---

## 📁 Project Structure

```
TetraScript64/
├── README.md                        ← You are here
│
├── website/                         ← The entire application (3 files)
│   ├── index.html                   ← App shell & layout
│   ├── app.js                       ← All logic, ~3100 lines
│   └── logo.png                     ← Application logo
│
└── docs/                            ← Internal documentation & dev notes
    ├── deployment_guide.md          ← Full deployment instructions (GitHub Pages, Vercel, etc.)
    ├── advanced_encryption.md       ← Zero-knowledge architecture overview
    ├── audio_and_video_encryption.md
    ├── diary_v2_interactive_upgrade.md
    ├── personal_diary_feature.md
    ├── implementation_plan.md
    ├── increasing the storage limits.md
    └── fixing video encryption bugs.md
```

> **Deploy directory:** Only the `website/` folder needs to be served. The `docs/` folder is for development reference only.

---

## 🖥️ Interface Architecture & Modules

The application features a rich, multi-panel design inspired by hacker aesthetics:
- **Header:** Navigation menu, user profile (`ROOT_ADMIN`), and active network indicator.
- **Left Sidebar:** A global Vault Memory utilization gauge and a directory view for active nodes.
- **Center Viewport:** A dynamic workspace with a grid background that renders the active module.
- **Footer:** Persistent action bar containing the `+ CREATE_NODE` button, terminal prompt status, and system telemetry.

The core modules accessed from the header are:

### 📊 Dashboard
Live vault summary — total stash count, memory usage bar, breakdown by type (text / audio / video / diary), and storage quota.

### 🎵 Audio_Enc
Drag-and-drop or file-select interface to encrypt audio files. Encrypted audio is stored in IndexedDB in 8 MB chunks. Decrypt via the Terminal using `unlock <key>` or by dragging a `.ts64` backup.

### 🎬 Video_Enc
Drag-and-drop or file-select interface for video files. Encrypted output is a portable `.ts64vid` binary file saved directly to your disk (no IndexedDB for video). Decrypt by dragging the `.ts64vid` back into the Video tab or using `unlock_video` in Terminal.

### 📔 Diary
A date-indexed personal journal with a retro `NODE_HISTORY.LOG` aesthetic. Each diary is a named vault — created via **+ CREATE_NODE** — with entries automatically indexed by date. Features persistent password caching per session for seamless multi-entry writing, and encrypted export as `.ts64diary` files.

### 💻 Terminal
The command-line heart of TetraScript64. Supports all encryption, decryption, and vault management commands. Drag-and-drop `.ts64`, `.ts64vid`, or `.ts64diary` files directly onto the terminal to restore backups.

### ❓ Help
In-app command reference and feature guide.

---

## 💻 Terminal Commands

| Command | Description |
|---|---|
| `stash <text>` | Encrypt a text string and store it. Returns a `TS64-XXXX-XXXX` access key. |
| `unlock <key>` | Decrypt and display a stashed text entry using its key. |
| `export <key>` | Download an encrypted backup file (`.ts64`) for a given stash key. |
| `stash_audio` | Opens a file picker to encrypt an audio file into IndexedDB. |
| `stash_video` | Opens a file picker to encrypt a video file, streaming it to a `.ts64vid` file. |
| `unlock_video` | Opens a file picker to decrypt a `.ts64vid` file and play or save it. |
| `diary_stash` | Export the currently open diary node to a `.ts64diary` encrypted backup. |
| `diary_unlock` | Import and decrypt a `.ts64diary` backup into the Diary tab. |
| `purge` | ⚠️ Permanently destroy **all** stashes, diary nodes, and metadata from IndexedDB. |
| `clear` | Clear the terminal output. |
| `help` | List all available commands. |

**Key format:** `TS64-XXXX-XXXX` — 4 uppercase alphanumeric characters in each segment.

---

## 📦 File Formats

| Extension | Contents | Created By |
|---|---|---|
| `.ts64` | Encrypted binary blob (TS64 magic header + chunked ciphertext) | `stash`, `stash_audio`, `export` |
| `.ts64vid` | Encrypted video stream (same chunked format, streamed to disk) | `stash_video`, Video_Enc tab |
| `.ts64diary` | Encrypted diary node (chunked, includes all entries) | `diary_stash`, Diary tab |

All three formats share the same binary structure:
```
[4B magic: 0x54 0x53 0x36 0x34 ("TS64")]
[16B random salt]
[8B original file size (little-endian uint64)]
[N × chunk envelopes: [4B index][12B IV][4B ciphertext length][N bytes ciphertext]]
```

---

## 🔒 Security Architecture

| Property | Detail |
|---|---|
| **Algorithm** | AES-GCM 256-bit |
| **Key Derivation** | PBKDF2 with SHA-256, 100,000 iterations |
| **Salt** | 16 bytes, cryptographically random per stash |
| **IV** | 12 bytes, cryptographically random per chunk |
| **Entropy source** | `crypto.getRandomValues()` (CSPRNG) |
| **Key format** | `TS64-[A-Z0-9]{4}-[A-Z0-9]{4}` |
| **Storage** | IndexedDB (browser-local, no cloud sync) |
| **Server contact** | **None.** Zero bytes sent to any server. |
| **Build-time secrets** | None — no API keys, no tokens hardcoded. |

### What TetraScript64 Guarantees

- ✅ Zero-knowledge: no one else can ever see your data
- ✅ All crypto in-browser via native Web Crypto API
- ✅ No analytics, no tracking scripts
- ✅ Data survives browser restarts (IndexedDB is persistent)
- ✅ Portable encrypted backups you can store anywhere safely

### Known Limitations

- ❌ Data is **device-local** — not synced across browsers/devices (use export/import for portability)
- ❌ Losing your `TS64-XXXX-XXXX` key means **permanent** data loss — no recovery
- ❌ Browser storage can be cleared by the user/OS (always export backups for important data)
- ❌ `crypto.subtle` requires **HTTPS or localhost** — will not work on plain HTTP

---

## 🚀 Running Locally

TetraScript64 needs **no build step**. Open a local HTTPS server to satisfy the Web Crypto API requirement.

### Option A — VS Code Live Server *(Recommended)*
1. Install the **Live Server** extension in VS Code
2. Right-click `website/index.html` → **"Open with Live Server"**
3. Navigate to `http://127.0.0.1:5500/website/`

### Option B — Python
```bash
cd website
python -m http.server 8080
# Open http://localhost:8080
```

### Option C — Node.js
```bash
cd website
npx serve .
```

> **Note:** `crypto.subtle` works on `localhost` even without HTTPS. For any other hostname, HTTPS is mandatory.

---

## 🌐 Deploying

TetraScript64 is a **pure static site** — deploy the `website/` folder to any host. No build required.

| Platform | Steps |
|---|---|
| **GitHub Pages** | Settings → Pages → Branch: `main` → Folder: `/website` |
| **Vercel** | Import repo → Root Directory: `website` → No build command |
| **Netlify** | Drag & drop the `website/` folder, or connect Git with base dir `website` |
| **Cloudflare Pages** | Build output directory: `website` |

Full step-by-step instructions for each platform: [`docs/deployment_guide.md`](docs/deployment_guide.md)

**Live URL:** [https://tetrascript64.vercel.app/](https://tetrascript64.vercel.app/)

---

## 🌍 Browser Compatibility

| Browser | Support | Notes |
|---|---|---|
| Chrome / Edge 89+ | ✅ Full | File System Access API (`showSaveFilePicker`) supported |
| Firefox 90+ | ✅ Full | No `showSaveFilePicker` — fallback Blob download used |
| Safari 15.4+ | ✅ Full | No `showSaveFilePicker` — fallback Blob download used |
| Opera / Brave | ✅ Full | Chromium-based, same as Chrome |
| Mobile (iOS/Android) | ⚠️ Partial | Text & diary work; large media encryption may be memory-limited |

> The app gracefully falls back to in-memory Blob downloads when `showSaveFilePicker` is unavailable, so all features remain functional in all browsers — just with slightly different save behavior for video.

---

## 🗺️ Roadmap

- [x] Text encryption via terminal (`stash` / `unlock`)
- [x] Export/import backup files (`.ts64`)
- [x] Audio encryption with chunked IndexedDB storage
- [x] Video encryption with streaming GB-scale support (`.ts64vid`)
- [x] Personal diary with date-indexed encrypted entries
- [x] Dashboard with real-time vault stats
- [x] Drag-and-drop restore for all backup types
- [x] Advanced multi-panel UI overhaul featuring Tailwind CSS
- [x] Session-persistent passwords for Diary vaults
- [ ] Multi-key stash listing (`list` command)
- [ ] Password-hint system (optional, opt-in)
- [ ] Mobile responsive layout polish

---

## 📄 License

MIT License — do whatever you want, just don't blame us if your cat learns your access key.

---

<p align="center">
  Built with 🖤 by <strong>Haarya</strong> &nbsp;·&nbsp;
  <a href="https://haarya.github.io/TetraScript64/">Live Demo</a> &nbsp;·&nbsp;
  <a href="docs/deployment_guide.md">Deployment Guide</a>
</p>
