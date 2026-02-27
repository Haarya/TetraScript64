# Audio & Video Encryption: Architecture Plan

This document outlines the brainstorming and architecture plan for expanding TetraScript into a full media vault by supporting audio and video file encryption.

## 1. Audio Encryption (\`stash_audio\`)

Currently, the web-app converts text into bytes and encrypts those bytes. Since audio files are fundamentally binary data, we can apply the same cryptographic approach to them.

### The Flow
- Introduce a new terminal command: \`stash_audio\`.
- Upon execution, the app will either open a hidden file picker or prompt the user to drag-and-drop an \`.mp3\` or \`.wav\` file into the terminal.

### The Processing
- JavaScript utilizes the \`FileReader\` API to read the audio file as an \`ArrayBuffer\` (raw binary data).
- The existing \`AES-GCM\` Web Crypto engine directly encrypts this raw binary buffer.

### The Storage Solution
- **Current Limitation:** \`localStorage\` is used for text but is limited to ~5MB. Audio files typically range from 3MB to 10MB.
- **The Upgrade:** We will migrate the storage engine to **IndexedDB**. 
- IndexedDB is a low-level browser API for client-side storage of significant amounts of structured data, including files/blobs. It can handle hundreds of megabytes on the user's local machine without requiring a backend server.

### The Decryption & Output
- Encrypting the audio outputs a unique password key, exactly like the text stash.
- When running \`unlock [PASSWORD]\`, the system decrypts the binary data.
- The decrypted buffer is converted into an ephemeral audio URL (\`Blob URL\`).
- A retro ASCII-style player is rendered in the terminal to play the decrypted audio locally.

---

## 2. Video Encryption (\`stash_video\`) & Advanced Security

Video files are massive (frequently 50MB to 500MB+), requiring a distinct architectural approach for processing and storage.

### A. Storage Strategy: Local Device Storage (Recommended)
Given the "Hacker OS / True Vault" nature of this project, we prioritize keeping data mathematically secure by ensuring it never leaves the user's local machine.
- **How it works:** The browser instantly encrypts the video in memory and forces the user to download the encrypted payload as a custom file type (e.g., \`classified_footage.ts64vid\`). 
- **Security Benefit:** The file is completely unusable to anyone who opens it. To access the video, the user must drag the encrypted file back into the TetraScript terminal and provide the correct password key. 
- **Pros:** 100% free hosting, infinitely scalable, avoiding upload/download limits, and maximum privacy.

### B. "One More Level of Security" (Double Encryption)
To provide heightened security for video files, we can implement **Layered Encryption**:
- **Layer 1 (Native):** The video is encrypted using military-grade AES-GCM-256 (our existing algorithm).
- **Layer 2 (Additional):** The previously encrypted data is encrypted *again* using a completely different algorithm (e.g., ChaCha20 or a Time-Lock condition where a file cannot physically decrypt until an epoch timestamp has been reached) combined with a secondary password.

### C. Custom Encryption Algorithms & Cryptographic Paradigms
- **The Client-Side Sandbox Rule:** If encryption occurs within the browser (HTML/JS), the code is inherently visible via Developer Tools (F12). We can obfuscate the code, but advanced users can reverse-engineer the logic.
- **The Backend Rule:** Building a custom algorithm where the source code is 100% invisible requires a backend server (e.g., Node.js/Python). The user uploads the video, the server holds the secret custom code, scrambles the video, and sends the scrambled file back.
- **The Cryptography Golden Rule:** In genuine cybersecurity, "rolling your own crypto" is heavily discouraged. Standardized algorithms like AES-256 are mathematically proven against supercomputer attacks over decades. 
- **The Verdict:** Using an established algorithm (AES-256) combined with an ultra-complex key generation mechanism (like Argon2id) provides superior mathematical security compared to a custom, unverified algorithm. We will proceed with hardened AES-256.

---

## 3. Implementation Roadmap

To execute this vision, we will follow these phased steps:

1. **Storage Engine Upgrade:** Migrate the overarching terminal state and stash logic from \`localStorage\` to \`IndexedDB\` to support large Blob and ArrayBuffer storage.
2. **Drag-and-Drop Media Zones:** Update the terminal UI to accept \`.mp3\`, \`.wav\`, and \`.mp4\` file drops organically.
3. **Blob Encrypter Stream:** Adapt the Web Crypto functions to process heavy data streams safely to prevent browser memory crashes during encryption/decryption of large videos.
4. **In-Terminal Renderers:** Build minimal, retro pseudo-terminal audio and video players that spawn inside the console output when a media file is successfully unlocked.
