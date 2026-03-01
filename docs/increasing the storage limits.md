# TetraScript64 — Increasing Storage Limits: Step-by-Step Implementation Plan

> **Scope:** `website/app.js` (1284 lines) — no server, no dependencies added.
> **Goal:** Remove ALL storage ceilings (text, audio, video) — scale everything to multi-GB.
> **Privacy guarantee:** Zero-knowledge, fully local, zero server contact — preserved throughout.

---

## Why Text Also Needs This Treatment

The current `stash` command encodes text → binary blocks → encrypts the whole string as a **single Uint8Array** stored in one IndexedDB value. While a single text stash won't hit GB sizes, the IDB architecture is inconsistent with audio/video. More importantly:

- Future features (e.g. stashing large base64-encoded data, file contents, structured JSON logs) could easily exceed 100 MB
- The vault utilization display is hardcoded to a 50 MB ceiling — it should reflect real quota for all content types
- A **unified stash format** (v2 chunked metadata) across text, audio, and video makes future features (search, tagging, export-all, batch decrypt) far easier to build

---

## Overview of All Changes

| Step | What Changes | Lines Affected |
|------|-------------|----------------|
| 1 | Add `CHUNK_SIZE` constant + `encryptFileChunks()` generator | After line 160 |
| 2 | Add `decryptChunkedData()` helper | After Step 1 |
| 3 | Add `showProgressBar()` + `updateProgress()` helpers | After Step 2 |
| **4** | **Update `stash` (text) command — add v2 metadata wrapper** | Lines 990–1017 |
| **5** | **Update `unlock` — add v2 text detect + decode path** | Lines 1092–1155 |
| 6 | Replace `handleMediaFile()` — audio chunked + video streaming | Lines 329–411 |
| 7 | Replace `stash_audio` terminal command | Lines 1029–1050 |
| 8 | Replace `stash_video` terminal command | Lines 1063–1090 |
| 9 | Update `getVaultSummary()` — remove hardcoded 50 MB | Lines 165–191 |
| 10 | Update all `"50.0 MB"` display strings | Lines 461, 902 |
| 11 | Update `purge` — chunk-key-aware wipe | Lines 1177–1188 |

---

## Step 1 — Add the Chunked Encryption Engine

**Where:** Insert this entire block **after line 160** (after the closing `}` of `decryptData`).

**Why:** The current `encryptData()` calls `crypto.subtle.encrypt()` on the full buffer at once — this requires the entire payload + ciphertext copy in RAM simultaneously. The new generator reads 8 MB at a time, encrypts it, and yields the result before moving to the next chunk — keeping peak RAM at ~16 MB regardless of payload size.

```javascript
// ============================================================
// CHUNKED ENCRYPTION ENGINE (v2 — GB-scale support)
// ============================================================
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB per chunk

// Async generator: yields Uint8Array chunks (header first, then data chunks)
// Header layout  : [4 magic "TS64"][16 salt][8 totalSize LE BigInt]
// Chunk layout   : [4 chunkIndex LE][12 IV][4 ciphertextLen LE][ciphertext]
async function* encryptFileChunks(file, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);

    // --- Emit header (28 bytes) ---
    const header = new Uint8Array(28);
    header.set([0x54, 0x53, 0x36, 0x34], 0); // "TS64" magic
    header.set(salt, 4);
    const hView = new DataView(header.buffer);
    hView.setBigUint64(20, BigInt(file.size), true);
    yield header;

    let offset = 0;
    let chunkIndex = 0;

    while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const ab = await slice.arrayBuffer();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ab);

        const envelope = new Uint8Array(4 + 12 + 4 + ciphertext.byteLength);
        const cv = new DataView(envelope.buffer);
        cv.setUint32(0, chunkIndex, true);           // [0..3]  chunk index
        envelope.set(iv, 4);                          // [4..15] IV
        cv.setUint32(16, ciphertext.byteLength, true);// [16..19] ciphertext length
        envelope.set(new Uint8Array(ciphertext), 20); // [20..]  ciphertext

        yield envelope;
        offset += CHUNK_SIZE;
        chunkIndex++;
    }
}
```

---

## Step 2 — Add the Chunked Decryption Helper

**Where:** Insert directly after the Step 1 block.

**Why:** When unlocking any v2 stash (text, audio, or future types), we need to reassemble N chunk keys from IndexedDB and decrypt each one, then merge the plaintext buffers sequentially.

```javascript
// Decrypt any v2 chunked stash from IndexedDB.
// Returns merged ArrayBuffer of plaintext, or null if not a v2 stash.
async function decryptChunkedData(id, password) {
    const meta = await dbGet('TS64_STASH_' + id);
    if (!meta || typeof meta !== 'object' || meta.v !== 2) return null;

    const headerRaw = await dbGet('TS64_STASH_' + id + '_header');
    if (!headerRaw) return null;

    const hdrArr = new Uint8Array(headerRaw.buffer || headerRaw);
    const salt = hdrArr.slice(4, 20); // bytes [4..19]
    const key = await deriveKey(password, salt);

    const decryptedParts = [];

    for (let i = 0; i < meta.chunkCount; i++) {
        const envelopeRaw = await dbGet(`TS64_STASH_${id}_chunk_${i}`);
        if (!envelopeRaw) throw new Error(`Chunk ${i} missing from vault`);

        const ev = new Uint8Array(envelopeRaw.buffer || envelopeRaw);
        const iv = ev.slice(4, 16);
        const ctLen = new DataView(ev.buffer, ev.byteOffset + 16, 4).getUint32(0, true);
        const ciphertext = ev.slice(20, 20 + ctLen);

        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        decryptedParts.push(new Uint8Array(plain));
    }

    const totalLen = decryptedParts.reduce((s, p) => s + p.byteLength, 0);
    const merged = new Uint8Array(totalLen);
    let pos = 0;
    for (const part of decryptedParts) { merged.set(part, pos); pos += part.byteLength; }
    return merged.buffer;
}
```

---

## Step 3 — Add Progress Bar UI Helpers

**Where:** Insert directly after Step 2 block.

**Why:** Large text payloads, audio, and video all take time. Without progress feedback the user has no idea if the tab froze. These helpers inject a live progress bar into any result container.

```javascript
// ============================================================
// PROGRESS BAR HELPERS
// ============================================================
function showProgressBar(containerId, label) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div class="p-4 border border-white/20 bg-black/40">
            <div class="text-white font-bold tracking-widest text-xs mb-4 uppercase">${label}</div>
            <div class="w-full bg-white/10 h-1 mb-3 overflow-hidden">
                <div id="enc-progress-bar"
                     class="bg-white h-1 transition-all duration-300 ease-out"
                     style="width:0%"></div>
            </div>
            <div id="enc-progress-text" class="text-zinc-500 text-xs font-mono">INITIALIZING...</div>
        </div>`;
}

function updateProgress(pct, statusText) {
    const bar = document.getElementById('enc-progress-bar');
    const txt = document.getElementById('enc-progress-text');
    if (bar) bar.style.width = Math.min(100, pct).toFixed(1) + '%';
    if (txt) txt.textContent = statusText || `${pct.toFixed(1)}%`;
}
```

---

## Step 4 — Update `stash` (Text) Command — Add v2 Metadata Wrapper

**Where:** Find `} else if (command === 'stash') {` at **line 990**. Replace the entire branch (lines 990–1017).

**Why:** The current `stash` command stores a raw encrypted `Uint8Array` blob under a single IDB key. We add a v2 metadata record so:
1. The `unlock` command can unambiguously identify it as text vs audio
2. The vault summary correctly counts text stashes without double-counting chunks  
3. Future features (batch ops, type-filtered exports) can query by `meta.type`
4. Large text payloads (e.g. base64 dumps, large JSON) can be chunked identically to audio

**Current code (lines 990–1017):**
```javascript
} else if (command === 'stash') {
    if (!args) {
        resWrap.innerHTML = `<span class="text-red-500">Error: Missing input string to stash</span>`;
    } else {
        resWrap.innerHTML = `<div class="text-zinc-500 animate-pulse">Encrypting payload...</div>`;
        outputContainer.appendChild(resWrap);
        const binBlocks = encodeTextToBinaryBlocks(args);
        if (!binBlocks.length) {
            resWrap.innerHTML = `<span class="text-red-500">Error: Could not encode payload.</span>`;
        } else {
            const payload = binBlocks.join(' ');
            const pwd = generatePassword();
            const id = pwd.split('-')[1];
            try {
                const encrypted = await encryptData(payload, pwd);
                await dbSet('TS64_STASH_' + id, encrypted);
                await incrementStat('text');
                resWrap.innerHTML = `
                    <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">STASH SECURED</div>
                    <div class="mb-2 text-zinc-500">Encryption: <span class="text-white">AES-GCM 256-bit</span></div>
                    <div class="mb-2 text-zinc-500">Location: <span class="text-white">IndexedDB Local Vault</span></div>
                    ${keyCardHTML(pwd)}`;
                renderSidebar();
            } catch (err) {
                resWrap.innerHTML = `<span class="text-red-500">Encryption Fault: ${err.message}</span>`;
            }
        }
    }
```

**Replace with:**
```javascript
} else if (command === 'stash') {
    if (!args) {
        resWrap.innerHTML = `<span class="text-red-500">Error: Missing input string to stash</span>`;
    } else {
        resWrap.innerHTML = `<div class="text-zinc-500 animate-pulse">Encrypting payload...</div>`;
        outputContainer.appendChild(resWrap);
        const binBlocks = encodeTextToBinaryBlocks(args);
        if (!binBlocks.length) {
            resWrap.innerHTML = `<span class="text-red-500">Error: Could not encode payload.</span>`;
        } else {
            const payload = binBlocks.join(' ');
            const payloadBytes = new TextEncoder().encode(payload);
            const pwd = generatePassword();
            const id = pwd.split('-')[1];
            try {
                // Derive key + write header (same format as audio/video v2)
                const salt = crypto.getRandomValues(new Uint8Array(16));
                const key = await deriveKey(pwd, salt);
                const hdr = new Uint8Array(28);
                hdr.set([0x54, 0x53, 0x36, 0x34], 0);
                hdr.set(salt, 4);
                new DataView(hdr.buffer).setBigUint64(20, BigInt(payloadBytes.byteLength), true);
                await dbSet('TS64_STASH_' + id + '_header', hdr);

                // Encrypt in chunks (handles arbitrarily large text payloads)
                let offset = 0, chunkIndex = 0;
                while (offset < payloadBytes.byteLength) {
                    const chunk = payloadBytes.slice(offset, offset + CHUNK_SIZE);
                    const iv = crypto.getRandomValues(new Uint8Array(12));
                    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, chunk);
                    const env = new Uint8Array(20 + ct.byteLength);
                    const cv = new DataView(env.buffer);
                    cv.setUint32(0, chunkIndex, true);
                    env.set(iv, 4);
                    cv.setUint32(16, ct.byteLength, true);
                    env.set(new Uint8Array(ct), 20);
                    await dbSet(`TS64_STASH_${id}_chunk_${chunkIndex}`, env);
                    offset += CHUNK_SIZE;
                    chunkIndex++;
                }

                // Write v2 metadata record
                await dbSet('TS64_STASH_' + id, {
                    type: 'text',
                    chunkCount: chunkIndex,
                    totalSize: payloadBytes.byteLength,
                    v: 2
                });
                await incrementStat('text');

                resWrap.innerHTML = `
                    <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">STASH SECURED</div>
                    <div class="mb-2 text-zinc-500">Encryption: <span class="text-white">AES-GCM 256-bit (chunked)</span></div>
                    <div class="mb-2 text-zinc-500">Location: <span class="text-white">IndexedDB Local Vault</span></div>
                    <div class="mb-2 text-zinc-500">Size: <span class="text-white">${payloadBytes.byteLength} bytes (${chunkIndex} chunk${chunkIndex > 1 ? 's' : ''})</span></div>
                    ${keyCardHTML(pwd)}`;
                renderSidebar();
            } catch (err) {
                resWrap.innerHTML = `<span class="text-red-500">Encryption Fault: ${err.message}</span>`;
            }
        }
    }
```

---

## Step 5 — Update `unlock` Command — Full v2-Aware Decode (Text + Audio + Legacy)

**Where:** Inside the `unlock` command handler, replace the block from around **line 1103** (`const id = parts[1];`) through **line 1154** (end of the outer `else` block).

**Why:** The unlock command currently only has two paths: text (binary blocks) and raw media. We now need three clean paths:
1. **v2 text** → chunked decrypt → decode binary blocks → display
2. **v2 audio** → chunked decrypt → blob → `<audio>` player
3. **v1 legacy** → old single-blob decrypt → auto-detect text vs media

**Replace current block with:**
```javascript
const id = parts[1];

// Fetch metadata to determine stash type
const metaCheck = await dbGet('TS64_STASH_' + id);
const isV2 = metaCheck && typeof metaCheck === 'object' && metaCheck.v === 2;

if (isV2 && metaCheck.type === 'text') {
    // =========================================================
    // PATH A: v2 Text Stash — chunked decrypt → binary decode
    // =========================================================
    resWrap.innerHTML = `<div class="text-zinc-500 animate-pulse">Decrypting text payload...</div>`;
    outputContainer.appendChild(resWrap);
    try {
        const plainBuffer = await decryptChunkedData(id, pwd);
        if (!plainBuffer) throw new Error('Decryption failed — wrong key?');
        const textStr = new TextDecoder('utf-8', { fatal: true }).decode(plainBuffer);
        const bins = textStr.trim().split(/\s+/);
        const englishPhrase = decodeBinaryBlocksToText(bins);
        if (!englishPhrase) throw new Error('Binary decode error — payload may be corrupted');
        resWrap.innerHTML = `
            <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">STASH DECRYPTED</div>
            <div class="text-sm text-zinc-500 mb-4">${bins.length} blocks decoded</div>
            <div class="mt-4 p-5 border border-white/20 bg-white/5 text-white font-mono text-base tracking-wide flex gap-3 items-start">
                <span class="shrink-0">></span>
                <span class="whitespace-pre-wrap break-words leading-relaxed">${englishPhrase.replace(/</g, '&lt;')}</span>
            </div>`;
    } catch (err) {
        resWrap.innerHTML = `<span class="text-red-500 p-2 block border border-red-500/50 bg-red-500/10">Access Denied: ${err.message}</span>`;
    }

} else if (isV2 && metaCheck.type === 'audio') {
    // =========================================================
    // PATH B: v2 Audio Stash — chunked decrypt → audio player
    // =========================================================
    resWrap.innerHTML = `
        <div class="p-3 border border-white/20 bg-black/40">
            <div class="text-white font-bold tracking-widest text-xs mb-3">DECRYPTING AUDIO</div>
            <div class="w-full bg-white/10 h-1 mb-2">
                <div id="enc-progress-bar" class="bg-white h-1 transition-all" style="width:0%"></div>
            </div>
            <div id="enc-progress-text" class="text-zinc-500 text-xs font-mono">Reading chunks...</div>
        </div>`;
    outputContainer.appendChild(resWrap);
    try {
        const headerRaw = await dbGet('TS64_STASH_' + id + '_header');
        if (!headerRaw) throw new Error('Header chunk missing');
        const hdrArr = new Uint8Array(headerRaw.buffer || headerRaw);
        const salt = hdrArr.slice(4, 20);
        const key = await deriveKey(pwd, salt);

        const decryptedParts = [];
        for (let ci = 0; ci < metaCheck.chunkCount; ci++) {
            const envRaw = await dbGet(`TS64_STASH_${id}_chunk_${ci}`);
            if (!envRaw) throw new Error(`Chunk ${ci} missing`);
            const ev = new Uint8Array(envRaw.buffer || envRaw);
            const iv = ev.slice(4, 16);
            const ctLen = new DataView(ev.buffer, ev.byteOffset + 16, 4).getUint32(0, true);
            const ct = ev.slice(20, 20 + ctLen);
            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
            decryptedParts.push(new Uint8Array(plain));
            updateProgress(((ci + 1) / metaCheck.chunkCount) * 100, `Chunk ${ci + 1} / ${metaCheck.chunkCount}`);
        }

        const totalLen = decryptedParts.reduce((s, p) => s + p.byteLength, 0);
        const merged = new Uint8Array(totalLen);
        let pos = 0;
        for (const p of decryptedParts) { merged.set(p, pos); pos += p.byteLength; }

        const blob = new Blob([merged], { type: metaCheck.mime || 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        resWrap.innerHTML = `
            <div class="p-4 border border-white/20 bg-black/40">
                <div class="text-white font-bold mb-3 tracking-wider border-b border-white/10 pb-2">AUDIO DECRYPTED</div>
                <audio controls class="w-full" style="filter: invert(1) hue-rotate(180deg);" src="${url}"></audio>
            </div>`;
    } catch (err) {
        resWrap.innerHTML = `<span class="text-red-500 p-2 block border border-red-500/50 bg-red-500/10">Access Denied: ${err.message}</span>`;
    }

} else {
    // =========================================================
    // PATH C: v1 Legacy — single-blob decrypt → auto-detect
    // =========================================================
    const payload = await dbGet('TS64_STASH_' + id);
    if (!payload) {
        resWrap.innerHTML = `<span class="text-red-500">Access Denied: No data found for key ${id}.</span>`;
    } else {
        const decrypted = await decryptData(payload, pwd, false);
        if (!decrypted) {
            resWrap.innerHTML = `<span class="text-red-500 p-2 block border border-red-500/50 bg-red-500/10">Access Denied: Incorrect key or corrupted payload.</span>`;
        } else {
            try {
                const textStr = new TextDecoder("utf-8", { fatal: true }).decode(decrypted);
                const isText = /^[01 ]+$/.test(textStr.trim());
                if (isText) {
                    const bins = textStr.trim().split(/\s+/);
                    const englishPhrase = decodeBinaryBlocksToText(bins);
                    if (!englishPhrase) throw new Error("Binary parse error");
                    resWrap.innerHTML = `
                        <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">STASH DECRYPTED</div>
                        <div class="text-sm text-zinc-500 mb-4">${bins.length} blocks decoded</div>
                        <div class="mt-4 p-5 border border-white/20 bg-white/5 text-white font-mono text-base tracking-wide flex gap-3 items-start">
                            <span class="shrink-0">></span>
                            <span class="whitespace-pre-wrap break-words leading-relaxed">${englishPhrase.replace(/</g, '&lt;')}</span>
                        </div>`;
                } else { throw new Error("Not binary text"); }
            } catch {
                const blob = new Blob([decrypted]);
                const url = URL.createObjectURL(blob);
                const testAudio = new Audio(url);
                testAudio.oncanplay = () => {
                    testAudio.src = '';
                    resWrap.innerHTML = `
                        <div class="p-4 border border-white/20 bg-black/40">
                            <div class="text-white font-bold mb-3 tracking-wider border-b border-white/10 pb-2">AUDIO DECRYPTED</div>
                            <audio controls class="w-full" style="filter: invert(1) hue-rotate(180deg);" src="${url}"></audio>
                        </div>`;
                };
                testAudio.onerror = () => {
                    resWrap.innerHTML = `
                        <div class="p-4 border border-white/20 bg-black/40">
                            <div class="text-white font-bold mb-3 tracking-wider border-b border-white/10 pb-2">MEDIA DECRYPTED</div>
                            <video controls class="w-full border border-white/20" style="max-height:400px; background:#000;" src="${url}"></video>
                        </div>`;
                };
                testAudio.load();
            }
        }
    }
}
```

---

## Step 6 — Replace `handleMediaFile()` — Audio (Chunked IDB) + Video (Streaming)

**Where:** Replace the entire `handleMediaFile` function, **lines 329–411**.

```javascript
async function handleMediaFile(file, resultContainerId, expectedType) {
    const container = document.getElementById(resultContainerId);
    const lowerName = file.name.toLowerCase();

    const isAudio = expectedType === 'audio' &&
        (file.type.startsWith('audio/') || ['.mp3','.wav','.ogg','.flac','.aac','.m4a'].some(x => lowerName.endsWith(x)));
    const isVideo = expectedType === 'video' &&
        (file.type.startsWith('video/') || ['.mp4','.webm','.mkv','.mov','.avi'].some(x => lowerName.endsWith(x)));
    const isBackup = lowerName.endsWith('.ts64') || lowerName.endsWith('.ts64vid');

    if (!isAudio && !isVideo && !isBackup) {
        if (container) container.innerHTML = `<div class="text-red-500 text-sm p-4 border border-red-500/30 bg-red-500/5">ERROR: Unsupported file format — ${file.name}</div>`;
        return;
    }

    // ---- Backup restore (unchanged) ----
    if (isBackup) {
        const nameParts = file.name.split('.')[0].split('_');
        const id = nameParts[nameParts.length - 1];
        if (!id) { if (container) container.innerHTML = `<div class="text-red-500 text-sm p-4">ERROR: Malformed backup filename.</div>`; return; }
        const buf = await file.arrayBuffer();
        await dbSet('TS64_STASH_' + id, new Uint8Array(buf));
        if (container) container.innerHTML = `
            <div class="p-4 border border-white/20 bg-black/40 text-sm">
                <div class="font-bold text-white mb-2 tracking-widest">BACKUP RESTORED</div>
                <div class="text-zinc-400">Key ID: <span class="text-white font-bold">${id}</span></div>
                <div class="text-zinc-500 text-xs mt-2">Use <span class="text-white">unlock TS64-${id}-XXXX</span> in Terminal.</div>
            </div>`;
        renderSidebar();
        return;
    }

    // ---- Audio — Chunked IndexedDB ----
    if (isAudio) {
        const pwd = generatePassword();
        const id = pwd.split('-')[1];
        showProgressBar(resultContainerId, `ENCRYPTING AUDIO — ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
        try {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const key = await deriveKey(pwd, salt);
            const hdr = new Uint8Array(28);
            hdr.set([0x54, 0x53, 0x36, 0x34], 0);
            hdr.set(salt, 4);
            new DataView(hdr.buffer).setBigUint64(20, BigInt(file.size), true);
            await dbSet('TS64_STASH_' + id + '_header', hdr);

            let offset = 0, chunkIndex = 0, bytesProcessed = 0;
            while (offset < file.size) {
                const ab = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ab);
                const env = new Uint8Array(20 + ct.byteLength);
                const cv = new DataView(env.buffer);
                cv.setUint32(0, chunkIndex, true);
                env.set(iv, 4);
                cv.setUint32(16, ct.byteLength, true);
                env.set(new Uint8Array(ct), 20);
                await dbSet(`TS64_STASH_${id}_chunk_${chunkIndex}`, env);
                offset += CHUNK_SIZE; bytesProcessed += ab.byteLength; chunkIndex++;
                updateProgress((bytesProcessed / file.size) * 100,
                    `Chunk ${chunkIndex} · ${(bytesProcessed/(1024*1024)).toFixed(1)} / ${(file.size/(1024*1024)).toFixed(1)} MB`);
            }
            await dbSet('TS64_STASH_' + id, { type: 'audio', mime: file.type || 'audio/mpeg', name: file.name, chunkCount: chunkIndex, totalSize: file.size, v: 2 });
            await incrementStat('audio');
            if (container) container.innerHTML = `
                <div class="p-4 border border-white/20 bg-black/40 text-sm space-y-2">
                    <div class="font-bold text-white tracking-widest border-b border-white/10 pb-2 mb-3">AUDIO ENCRYPTED & STORED</div>
                    <div class="text-zinc-400">File: <span class="text-white">${file.name}</span></div>
                    <div class="text-zinc-400">Size: <span class="text-white">${(file.size/(1024*1024)).toFixed(2)} MB (${chunkIndex} chunks)</span></div>
                    <div class="text-zinc-400">Engine: <span class="text-white">AES-GCM 256-bit (per-chunk IV)</span></div>
                    ${keyCardHTML(pwd)}
                    <div class="text-zinc-600 text-xs mt-3">Use <span class="text-white">unlock ${pwd}</span> in Terminal to play.</div>
                </div>`;
            renderSidebar();
        } catch (err) {
            if (container) container.innerHTML = `<div class="text-red-500 text-sm p-4 border border-red-500/30 bg-red-500/5">Encryption Fault: ${err.message}</div>`;
        }
        return;
    }

    // ---- Video — Streaming download ----
    if (isVideo) {
        const pwd = generatePassword();
        const id = pwd.split('-')[1];
        showProgressBar(resultContainerId, `ENCRYPTING VIDEO — ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
        try {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const key = await deriveKey(pwd, salt);
            const hdr = new Uint8Array(28);
            hdr.set([0x54, 0x53, 0x36, 0x34], 0);
            hdr.set(salt, 4);
            new DataView(hdr.buffer).setBigUint64(20, BigInt(file.size), true);

            const supportsStreamSave = 'showSaveFilePicker' in window;
            let writable = null;
            if (supportsStreamSave) {
                updateProgress(0, 'Select save location…');
                const handle = await window.showSaveFilePicker({
                    suggestedName: `classified_footage_${id}.ts64vid`,
                    types: [{ description: 'Encrypted Video', accept: { 'application/octet-stream': ['.ts64vid'] } }]
                });
                writable = await handle.createWritable();
                await writable.write(hdr);
            }
            const blobParts = supportsStreamSave ? null : [hdr];
            let offset = 0, chunkIndex = 0, bytesProcessed = 0;
            while (offset < file.size) {
                const ab = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ab);
                const env = new Uint8Array(20 + ct.byteLength);
                const cv = new DataView(env.buffer);
                cv.setUint32(0, chunkIndex, true);
                env.set(iv, 4);
                cv.setUint32(16, ct.byteLength, true);
                env.set(new Uint8Array(ct), 20);
                if (writable) await writable.write(env);
                else blobParts.push(env);
                offset += CHUNK_SIZE; bytesProcessed += ab.byteLength; chunkIndex++;
                updateProgress((bytesProcessed / file.size) * 100,
                    `Encrypting ${(bytesProcessed/(1024*1024)).toFixed(1)} / ${(file.size/(1024*1024)).toFixed(1)} MB`);
            }
            if (writable) {
                await writable.close();
            } else {
                updateProgress(98, 'Building download…');
                const blob = new Blob(blobParts, { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `classified_footage_${id}.ts64vid`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
            await incrementStat('video');
            if (container) container.innerHTML = `
                <div class="p-4 border border-white/20 bg-black/40 text-sm space-y-2">
                    <div class="font-bold text-white tracking-widest border-b border-white/10 pb-2 mb-3">VIDEO ENCRYPTED & DOWNLOADED</div>
                    <div class="text-zinc-400">File: <span class="text-white">${file.name}</span></div>
                    <div class="text-zinc-400">Size: <span class="text-white">${(file.size/(1024*1024)).toFixed(2)} MB</span></div>
                    <div class="text-zinc-400">Output: <span class="text-white">classified_footage_${id}.ts64vid</span></div>
                    <div class="text-zinc-400">Engine: <span class="text-white">AES-GCM 256-bit (chunked stream)</span></div>
                    ${keyCardHTML(pwd)}
                </div>`;
            renderSidebar();
        } catch (err) {
            if (err.name === 'AbortError') {
                if (container) container.innerHTML = `<div class="text-zinc-500 text-sm p-4">Save dialog cancelled.</div>`;
            } else {
                if (container) container.innerHTML = `<div class="text-red-500 text-sm p-4 border border-red-500/30">Encryption Fault: ${err.message}</div>`;
            }
        }
    }
}
```

---

## Step 7 — Update `stash_audio` Terminal Command

**Where:** Find `fileInput.onchange` inside the `stash_audio` block (~line 1029). Replace handler with:

```javascript
fileInput.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) { resWrap.innerHTML = `<span class="text-red-500">No file selected.</span>`; return; }

    resWrap.innerHTML = `
        <div class="p-3 border border-white/20 bg-black/40">
            <div class="text-white font-bold tracking-widest text-xs mb-3 uppercase">ENCRYPTING AUDIO — ${(file.size/(1024*1024)).toFixed(1)} MB</div>
            <div class="w-full bg-white/10 h-1 mb-2 overflow-hidden">
                <div id="enc-progress-bar" class="bg-white h-1 transition-all duration-300" style="width:0%"></div>
            </div>
            <div id="enc-progress-text" class="text-zinc-500 text-xs font-mono">INITIALIZING...</div>
        </div>`;

    const pwd = generatePassword();
    const id = pwd.split('-')[1];
    try {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveKey(pwd, salt);
        const hdr = new Uint8Array(28);
        hdr.set([0x54, 0x53, 0x36, 0x34], 0);
        hdr.set(salt, 4);
        new DataView(hdr.buffer).setBigUint64(20, BigInt(file.size), true);
        await dbSet('TS64_STASH_' + id + '_header', hdr);

        let offset = 0, chunkIndex = 0, bytesProcessed = 0;
        while (offset < file.size) {
            const ab = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ab);
            const env = new Uint8Array(20 + ct.byteLength);
            const cv = new DataView(env.buffer);
            cv.setUint32(0, chunkIndex, true);
            env.set(iv, 4);
            cv.setUint32(16, ct.byteLength, true);
            env.set(new Uint8Array(ct), 20);
            await dbSet(`TS64_STASH_${id}_chunk_${chunkIndex}`, env);
            offset += CHUNK_SIZE; bytesProcessed += ab.byteLength; chunkIndex++;
            updateProgress((bytesProcessed / file.size) * 100,
                `Chunk ${chunkIndex} · ${(bytesProcessed/(1024*1024)).toFixed(1)} / ${(file.size/(1024*1024)).toFixed(1)} MB`);
        }
        await dbSet('TS64_STASH_' + id, { type: 'audio', mime: file.type || 'audio/mpeg', name: file.name, chunkCount: chunkIndex, totalSize: file.size, v: 2 });
        await incrementStat('audio');
        resWrap.innerHTML = `
            <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">AUDIO STASH SECURED</div>
            <div class="mb-2 text-zinc-500">File: <span class="text-white">${file.name}</span></div>
            <div class="mb-2 text-zinc-500">Size: <span class="text-white">${(file.size/(1024*1024)).toFixed(2)} MB (${chunkIndex} chunks)</span></div>
            <div class="mb-2 text-zinc-500">Engine: <span class="text-white">AES-GCM 256-bit / IndexedDB (chunked)</span></div>
            ${keyCardHTML(pwd)}`;
        renderSidebar();
    } catch (err) {
        resWrap.innerHTML = `<span class="text-red-500">Fault: ${err.message}</span>`;
    }
};
```

---

## Step 8 — Update `stash_video` Terminal Command

**Where:** Find `fileInput.onchange` inside the `stash_video` block (~line 1063). Replace handler with:

```javascript
fileInput.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) { resWrap.innerHTML = `<span class="text-red-500">No file selected.</span>`; return; }

    resWrap.innerHTML = `
        <div class="p-3 border border-white/20 bg-black/40">
            <div class="text-white font-bold tracking-widest text-xs mb-3 uppercase">ENCRYPTING VIDEO — ${(file.size/(1024*1024)).toFixed(1)} MB</div>
            <div class="w-full bg-white/10 h-1 mb-2 overflow-hidden">
                <div id="enc-progress-bar" class="bg-white h-1 transition-all duration-300" style="width:0%"></div>
            </div>
            <div id="enc-progress-text" class="text-zinc-500 text-xs font-mono">INITIALIZING...</div>
        </div>`;

    const pwd = generatePassword();
    const id = pwd.split('-')[1];
    try {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveKey(pwd, salt);
        const hdr = new Uint8Array(28);
        hdr.set([0x54, 0x53, 0x36, 0x34], 0);
        hdr.set(salt, 4);
        new DataView(hdr.buffer).setBigUint64(20, BigInt(file.size), true);

        const supportsStreamSave = 'showSaveFilePicker' in window;
        let writable = null;
        if (supportsStreamSave) {
            updateProgress(0, 'Select save location…');
            const handle = await window.showSaveFilePicker({
                suggestedName: `classified_footage_${id}.ts64vid`,
                types: [{ description: 'Encrypted Video', accept: { 'application/octet-stream': ['.ts64vid'] } }]
            });
            writable = await handle.createWritable();
            await writable.write(hdr);
        }
        const blobParts = supportsStreamSave ? null : [hdr];
        let offset = 0, chunkIndex = 0, bytesProcessed = 0;
        while (offset < file.size) {
            const ab = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ab);
            const env = new Uint8Array(20 + ct.byteLength);
            const cv = new DataView(env.buffer);
            cv.setUint32(0, chunkIndex, true);
            env.set(iv, 4);
            cv.setUint32(16, ct.byteLength, true);
            env.set(new Uint8Array(ct), 20);
            if (writable) await writable.write(env);
            else blobParts.push(env);
            offset += CHUNK_SIZE; bytesProcessed += ab.byteLength; chunkIndex++;
            updateProgress((bytesProcessed / file.size) * 100,
                `${(bytesProcessed/(1024*1024)).toFixed(1)} / ${(file.size/(1024*1024)).toFixed(1)} MB`);
        }
        if (writable) {
            await writable.close();
        } else {
            updateProgress(98, 'Building download…');
            const blob = new Blob(blobParts, { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `classified_footage_${id}.ts64vid`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        await incrementStat('video');
        resWrap.innerHTML = `
            <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">VIDEO STASH EXPORTED</div>
            <div class="mb-2 text-zinc-500">File: <span class="text-white">${file.name}</span></div>
            <div class="mb-2 text-zinc-500">Output: <span class="text-white">classified_footage_${id}.ts64vid</span></div>
            <div class="mb-2 text-zinc-500">Size: <span class="text-white">${(file.size/(1024*1024)).toFixed(2)} MB</span></div>
            <div class="mb-2 text-zinc-500">Engine: <span class="text-white">AES-GCM 256-bit (chunked stream)</span></div>
            ${keyCardHTML(pwd)}`;
        renderSidebar();
    } catch (err) {
        if (err.name === 'AbortError') resWrap.innerHTML = `<span class="text-zinc-500">Save dialog cancelled.</span>`;
        else resWrap.innerHTML = `<span class="text-red-500">Fault: ${err.message}</span>`;
    }
};
```

---

## Step 9 — Update `getVaultSummary()` — Remove Hardcoded 50 MB

**Where:** Lines 165–191. Replace the entire function.

```javascript
async function getVaultSummary() {
    const keys = await dbKeys();
    const items = await dbGetAll();
    let totalBytes = 0;

    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!k || !k.startsWith('TS64_STASH_')) continue;
        const item = items[i];
        if (typeof item === 'string') totalBytes += item.length;
        else if (item && item.byteLength) totalBytes += item.byteLength;
        // v2 metadata: count declared totalSize (avoids double-counting chunks)
        else if (item && typeof item === 'object' && item.totalSize) totalBytes += item.totalSize;
    }

    // Use real browser quota via StorageManager API
    let quotaBytes = 5 * 1024 * 1024 * 1024; // 5 GB default fallback
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const { quota } = await navigator.storage.estimate();
            if (quota) quotaBytes = quota;
        }
    } catch { /* use fallback */ }

    // Only count top-level stash entries (not chunk or header sub-keys)
    const stashKeys = keys.filter(k => k && k.startsWith('TS64_STASH_') && !k.includes('_chunk_') && !k.includes('_header'));
    const stats = await getStats();

    return {
        totalStashes: stashKeys.length,
        textCount: stats.text || 0,
        audioCount: stats.audio || 0,
        videoCount: stats.video || 0,
        totalBytes,
        totalKB: (totalBytes / 1024).toFixed(1),
        totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
        totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(3),
        quotaGB: (quotaBytes / (1024 * 1024 * 1024)).toFixed(1),
        percentage: Math.min(100, (totalBytes / quotaBytes) * 100).toFixed(2),
    };
}
```

---

## Step 10 — Update All `"50.0 MB"` Display Strings

**3 places to change (search for `50.0 MB` to find them):**

### 10a — Dashboard tab (~line 461):
```javascript
// OLD:
<span>${summary.totalKB} KB used / 50.0 MB limit</span>

// NEW:
<span>${summary.totalMB} MB used / ${summary.quotaGB} GB available</span>
```

### 10b — Terminal `status` command (~line 902):
```javascript
// OLD:
<span class="text-white">${summary.totalKB} KB / 50.0 MB</span>

// NEW:
<span class="text-white">${summary.totalMB} MB / ${summary.quotaGB} GB</span>
```

### 10c — Sidebar percentage bar:
Already fixed in Step 9 — it now uses `quotaBytes` from `StorageManager`.

---

## Step 11 — Update `purge` to Delete All Chunk & Header Keys

**Where:** Lines 1177–1188. Replace the `purge` handler entirely.

**Current:**
```javascript
} else if (command === 'purge') {
    const keys = await dbKeys();
    let wiped = 0;
    for (let key of keys) {
        if (key && key.startsWith('TS64_STASH_')) { await dbRemove(key); wiped++; }
    }
    await dbSet('TS64_META_stats', { text: 0, audio: 0, video: 0 });
```

**New:**
```javascript
} else if (command === 'purge') {
    const keys = await dbKeys();
    let wiped = 0;
    for (let key of keys) {
        // Catches: TS64_STASH_XXXX, TS64_STASH_XXXX_header, TS64_STASH_XXXX_chunk_N, TS64_META_*
        if (key && (key.startsWith('TS64_STASH_') || key.startsWith('TS64_META_'))) {
            await dbRemove(key);
            wiped++;
        }
    }
    await dbSet('TS64_META_stats', { text: 0, audio: 0, video: 0 });
    resWrap.innerHTML = `
        <div class="font-bold text-red-500 mb-2 border-b border-red-500/30 pb-2">VAULT PURGED</div>
        <div class="text-zinc-500">${wiped} objects destroyed (stashes + all chunk data).</div>`;
    renderSidebar();
```

---

## Final Summary

```
website/app.js
├── [INSERT after line 160]   CHUNK_SIZE + encryptFileChunks() generator
├── [INSERT after above]      decryptChunkedData() — unified v2 decrypt helper
├── [INSERT after above]      showProgressBar() + updateProgress() helpers
├── [REPLACE lines 990–1017]  stash command — v2 chunked text encrypt
├── [REPLACE lines 1103–1154] unlock command — 3-path v2 text / v2 audio / v1 legacy
├── [REPLACE lines 329–411]   handleMediaFile() — audio chunked + video streaming
├── [REPLACE lines 1029–1047] stash_audio terminal handler — chunked
├── [REPLACE lines 1063–1085] stash_video terminal handler — streaming
├── [REPLACE lines 165–191]   getVaultSummary() — StorageManager quota + v2 counting
├── [PATCH line 461]          Dashboard "50.0 MB" → dynamic quota string
├── [PATCH line 902]          Terminal status "50.0 MB" → dynamic quota string
└── [REPLACE lines 1177–1188] purge — chunk-key-aware full wipe
```

---

## Practical Limits After Implementation

| Type | All Browsers | Chrome/Edge |
|------|-------------|-------------|
| **Text stash** | Up to IndexedDB quota (~GB range) | Same |
| **Audio** | 4–10 GB (IDB chunked) | Same |
| **Video (encrypt)** | ~2 GB (Blob fallback) | **Unlimited** (streams to disk) |
| **Video (decrypt/play)** | Full file reassembled in RAM for playback | Same |

> ✅ Zero-knowledge preserved — all data stays in the browser.  
> ✅ Fully backward compatible — v1 stashes still work via legacy path.  
> ✅ Unified v2 format across text, audio, and video — ready for future features.