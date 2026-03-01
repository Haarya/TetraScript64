// ============================================================
// TETRASCRIPT64 — app.js  (Rebuilt v3.0.0)
// ============================================================

// ============================================================
// GLOBAL STATE
// ============================================================
const state = {
    activeTab: 'terminal',
};

// ============================================================
// GLOBAL INDEXEDDB LAYER
// ============================================================
const DB_NAME = 'TetraScriptDB';
const DB_VERSION = 1;
const STORE_NAME = 'stashes';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function dbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
    });
}

async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
    });
}

async function dbRemove(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
    });
}

async function dbKeys() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
    });
}

async function dbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
    });
}

// ============================================================
// GLOBAL STATS HELPERS (persisted in IDB as TS64_META_stats)
// ============================================================
async function getStats() {
    try {
        const s = await dbGet('TS64_META_stats');
        return s || { text: 0, audio: 0, video: 0 };
    } catch { return { text: 0, audio: 0, video: 0 }; }
}

async function incrementStat(field) {
    const s = await getStats();
    s[field] = (s[field] || 0) + 1;
    await dbSet('TS64_META_stats', s);
}

// ============================================================
// GLOBAL WEB CRYPTO ENGINE
// ============================================================
function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pt1 = '', pt2 = '';
    for (let i = 0; i < 4; i++) pt1 += chars.charAt(Math.floor(Math.random() * chars.length));
    for (let i = 0; i < 4; i++) pt2 += chars.charAt(Math.floor(Math.random() * chars.length));
    return `TS64-${pt1}-${pt2}`;
}

async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
}

async function encryptData(data, password) {
    const enc = new TextEncoder();
    let buffer;
    if (typeof data === 'string') buffer = enc.encode(data);
    else if (data instanceof ArrayBuffer) buffer = new Uint8Array(data);
    else buffer = data;

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer);

    const bundle = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    bundle.set(salt, 0);
    bundle.set(iv, salt.length);
    bundle.set(new Uint8Array(ciphertext), salt.length + iv.length);
    return bundle;
}

async function decryptData(bundleData, password, returnAsText = true) {
    try {
        let bundle;
        if (typeof bundleData === 'string') {
            bundle = new Uint8Array(atob(bundleData).split('').map(c => c.charCodeAt(0)));
        } else {
            bundle = new Uint8Array(bundleData);
        }
        const salt = bundle.slice(0, 16);
        const iv = bundle.slice(16, 28);
        const ciphertext = bundle.slice(28);
        const key = await deriveKey(password, salt);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
        return returnAsText ? new TextDecoder().decode(decrypted) : decrypted;
    } catch { return null; }
}

// ============================================================
// CHUNKED ENCRYPTION ENGINE (v2 — GB-scale support)
// ============================================================
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB per chunk

async function* encryptFileChunks(file, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);

    const header = new Uint8Array(28);
    header.set([0x54, 0x53, 0x36, 0x34], 0);
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
        cv.setUint32(0, chunkIndex, true);
        envelope.set(iv, 4);
        cv.setUint32(16, ciphertext.byteLength, true);
        envelope.set(new Uint8Array(ciphertext), 20);

        yield envelope;
        offset += CHUNK_SIZE;
        chunkIndex++;
    }
}

async function decryptChunkedData(id, password) {
    const meta = await dbGet('TS64_STASH_' + id);
    if (!meta || typeof meta !== 'object' || meta.v !== 2) return null;

    const headerRaw = await dbGet('TS64_STASH_' + id + '_header');
    if (!headerRaw) return null;

    const hdrArr = new Uint8Array(headerRaw.buffer || headerRaw);
    const salt = hdrArr.slice(4, 20);
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

// ============================================================
// GLOBAL VAULT STATS (for sidebar + dashboard)
// ============================================================
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
        else if (item && typeof item === 'object' && item.totalSize) totalBytes += item.totalSize;
    }

    let quotaBytes = 5 * 1024 * 1024 * 1024;
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const { quota } = await navigator.storage.estimate();
            if (quota) quotaBytes = quota;
        }
    } catch { }

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

// ============================================================
// SIDEBAR RENDERER  (called globally)
// ============================================================
async function renderSidebar() {
    const summary = await getVaultSummary();
    const barFill = Math.floor((parseFloat(summary.percentage) / 100) * 18);
    const barStr = '█'.repeat(barFill) + '░'.repeat(18 - barFill);

    const folders = [
        { icon: 'folder', label: '/text_stash', count: summary.textCount, tab: 'terminal' },
        { icon: 'folder', label: '/audio_stash', count: summary.audioCount, tab: 'audio' },
        { icon: 'folder', label: '/video_stash', count: summary.videoCount, tab: 'video' },
        { icon: 'folder', label: '/etc', count: null, tab: 'help' },
    ];

    const folderHtml = folders.map(f => `
        <div class="flex items-center justify-between text-zinc-400 hover:text-white cursor-pointer transition-colors group py-1"
             onclick="switchTab('${f.tab}')">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-xs group-hover:text-white">folder</span>
                <span class="text-xs">${f.label}</span>
            </div>
            ${f.count !== null ? `<span class="text-[10px] text-zinc-600 group-hover:text-zinc-400">[${f.count}]</span>` : ''}
        </div>
    `).join('');

    const sidebarNav = document.getElementById('sidebar-nav');
    if (sidebarNav) {
        sidebarNav.innerHTML = `
            <div class="mb-3">
                <div class="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-2">VAULT DIRECTORIES</div>
                ${folderHtml}
            </div>
            <div class="border-t border-white/10 pt-3 mt-3">
                <div class="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-2">TOTAL STASHES</div>
                <div class="text-white font-bold text-lg">${summary.totalStashes}</div>
                <div class="text-zinc-600 text-[10px]">encrypted objects</div>
            </div>
        `;
    }

    // Update memory bar in footer instead of CPU
    const globalCpu = document.getElementById('global-cpu');
    const cpuBar = document.getElementById('cpu-bar');
    const cpuLabel = document.getElementById('cpu-label');
    if (globalCpu) globalCpu.textContent = summary.totalMB + ' MB';
    if (cpuBar) cpuBar.style.width = summary.percentage + '%';
    if (cpuLabel) cpuLabel.textContent = 'VAULT MEMORY';
}

// ============================================================
// UI BOOTSTRAP
// ============================================================
const mainNavLinks = document.querySelectorAll('#main-nav .nav-link');
const mainContent = document.getElementById('main-content');
const rightSidebar = document.getElementById('right-sidebar');

// Patch sidebar label to say VAULT MEMORY
document.addEventListener('DOMContentLoaded', () => {
    const cpuLabelEl = document.querySelector('#global-cpu')?.closest('.h-28')?.querySelector('span');
    if (cpuLabelEl && cpuLabelEl.textContent.includes('CPU')) {
        cpuLabelEl.textContent = 'VAULT MEMORY';
        cpuLabelEl.id = 'cpu-label';
    }
});

mainNavLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        mainNavLinks.forEach(l => l.classList.remove('active'));
        e.currentTarget.classList.add('active');
        switchTab(e.currentTarget.getAttribute('data-tab'));
    });
});

// ============================================================
// TAB ROUTER
// ============================================================
function switchTab(tab) {
    state.activeTab = tab;
    mainContent.innerHTML = '';
    rightSidebar.innerHTML = '';
    rightSidebar.style.display = 'flex';

    // Sync nav highlight
    mainNavLinks.forEach(l => {
        l.classList.toggle('active', l.getAttribute('data-tab') === tab);
    });

    switch (tab) {
        case 'dashboard': renderDashboardTab(); break;
        case 'audio': renderAudioTab(); break;
        case 'video': renderVideoTab(); break;
        case 'terminal':
            renderTerminalTab();
            rightSidebar.style.display = 'none';
            break;
        case 'help': renderHelpTab(); break;
        default: renderTerminalTab(); rightSidebar.style.display = 'none';
    }

    renderSidebar();
}

// ============================================================
// KEY CARD SNIPPET (shared)
// ============================================================
function keyCardHTML(pwd) {
    return `
        <div class="mt-4 p-4 border border-zinc-500 bg-zinc-500/10 text-center relative group cursor-pointer"
             onclick="navigator.clipboard.writeText('${pwd}'); this.querySelector('.copy-txt').innerText='COPIED!'; setTimeout(()=>this.querySelector('.copy-txt').innerText='CLICK TO COPY',2000);">
            <div class="text-white font-bold mb-2 uppercase tracking-widest text-xs">Access Key — Save This!</div>
            <div class="text-xl font-mono text-white tracking-widest">${pwd}</div>
            <div class="copy-txt absolute top-2 right-2 text-[10px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">CLICK TO COPY</div>
        </div>
    `;
}

// ============================================================
// DRAG-AND-DROP ZONE BUILDER (shared for Audio + Video tabs)
// ============================================================
function buildDropZone(containerId, accept, labelText) {
    const zone = document.getElementById(containerId);
    if (!zone) return;

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('border-white'); });
    zone.addEventListener('dragleave', e => { zone.classList.remove('border-white'); });
    zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('border-white');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        await handleMediaFile(file, containerId, accept);
    });
}

async function handleMediaFile(file, resultContainerId, expectedType) {
    const container = document.getElementById(resultContainerId);
    const lowerName = file.name.toLowerCase();

    const isAudio = expectedType === 'audio' &&
        (file.type.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'].some(x => lowerName.endsWith(x)));
    const isVideo = expectedType === 'video' &&
        (file.type.startsWith('video/') || ['.mp4', '.webm', '.mkv', '.mov', '.avi'].some(x => lowerName.endsWith(x)));
    const isBackup = lowerName.endsWith('.ts64') || lowerName.endsWith('.ts64vid');

    if (!isAudio && !isVideo && !isBackup) {
        if (container) container.innerHTML = `<div class="text-red-500 text-sm p-4 border border-red-500/30 bg-red-500/5">ERROR: Unsupported file format — ${file.name}</div>`;
        return;
    }

    // ---- Backup restore / stream decrypt ----
    if (isBackup) {
        if (lowerName.endsWith('.ts64vid')) {
            if (container) {
                const formId = 'decrypt-form-' + Date.now();
                const inputId = 'decrypt-input-' + Date.now();
                container.innerHTML = `
                    <div class="p-4 border border-white/20 bg-black/40 text-left">
                        <div class="font-bold text-white mb-2 uppercase tracking-widest text-xs">DECRYPT VIDEO</div>
                        <div class="text-zinc-500 text-xs mb-3">File: <span class="text-white">${file.name}</span></div>
                        <form id="${formId}" class="flex gap-2">
                            <input type="text" id="${inputId}" placeholder="TS64-XXXX-XXXX" class="bg-black border border-white/20 text-white px-3 py-2 text-xs w-full font-mono outline-none focus:border-white transition-colors" autocomplete="off" />
                            <button type="submit" class="bg-white text-black font-bold px-4 py-2 text-xs tracking-widest hover:bg-zinc-300 transition-colors">UNLOCK</button>
                        </form>
                        <div id="${formId}-status" class="mt-3"></div>
                    </div>`;

                document.getElementById(formId).onsubmit = async (e) => {
                    e.preventDefault();
                    const pwd = document.getElementById(inputId).value.trim().toUpperCase();
                    if (!pwd) return;
                    const statusEl = document.getElementById(`${formId}-status`);

                    const parts = pwd.split('-');
                    if (parts.length !== 3 || parts[0] !== 'TS64') {
                        statusEl.innerHTML = `<span class="text-red-500 font-bold text-xs">Access Denied: Invalid key format.</span>`;
                        return;
                    }

                    // We are in a form submit event, which is a fresh user gesture. 
                    const supportsStreamSave = 'showSaveFilePicker' in window;
                    let writable = null;
                    if (supportsStreamSave) {
                        try {
                            const handle = await window.showSaveFilePicker({ suggestedName: `decrypted_${file.name.replace('.ts64vid', '')}.mp4` });
                            writable = await handle.createWritable();
                        } catch (err) {
                            if (err.name !== 'AbortError') statusEl.innerHTML = `<span class="text-red-500 text-xs">Decryption Fault: ${err.message}</span>`;
                            return;
                        }
                    }

                    statusEl.innerHTML = `
                        <div class="w-full bg-white/10 h-1 mb-2 mt-2 overflow-hidden">
                            <div id="enc-progress-bar" class="bg-white h-1 transition-all duration-300" style="width:0%"></div>
                        </div>
                        <div id="enc-progress-text" class="text-zinc-500 text-xs font-mono">Reading header...</div>`;

                    try {
                        const hdrRaw = await file.slice(0, 28).arrayBuffer();
                        const hdrArr = new Uint8Array(hdrRaw);
                        if (hdrArr[0] !== 0x54 || hdrArr[1] !== 0x53 || hdrArr[2] !== 0x36 || hdrArr[3] !== 0x34) {
                            throw new Error('Not a valid TS64 backup file.');
                        }
                        const salt = hdrArr.slice(4, 20);
                        const key = await deriveKey(pwd, salt);

                        const outBlobParts = supportsStreamSave ? null : [];

                        let offset = 28;
                        let chunkIndex = 0;
                        while (offset < file.size) {
                            const envHdr = await file.slice(offset, offset + 20).arrayBuffer();
                            if (envHdr.byteLength < 20) break;
                            const ctLen = new DataView(envHdr).getUint32(16, true);
                            const iv = new Uint8Array(envHdr, 4, 12);

                            const chunkData = await file.slice(offset + 20, offset + 20 + ctLen).arrayBuffer();
                            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, chunkData);

                            if (writable) await writable.write(plain);
                            else outBlobParts.push(plain);

                            offset += 20 + ctLen;
                            chunkIndex++;
                            updateProgress((offset / file.size) * 100, `Decrypting… ${(offset / (1024 * 1024)).toFixed(1)}MB`);
                        }

                        let url = '';
                        if (writable) {
                            await writable.close();
                        } else {
                            updateProgress(98, 'Building download…');
                            const outBlob = new Blob(outBlobParts, { type: 'video/mp4' });
                            url = URL.createObjectURL(outBlob);
                            const a = document.createElement('a'); a.href = url; a.download = `decrypted_${file.name.replace('.ts64vid', '')}.mp4`;
                            document.body.appendChild(a); a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
                        }

                        container.innerHTML = `
                            <div class="p-4 border border-white/20 bg-black/40 text-sm space-y-3">
                                <div class="font-bold text-white tracking-widest border-b border-white/10 pb-2 mb-3">VIDEO DECRYPTED</div>
                                ${url ? `<video controls class="w-full border border-white/20" style="max-height:400px; background:#000;" src="${url}"></video>` : ''}
                                <div class="text-zinc-400">File decrypted successfully & saved locally.</div>
                            </div>`;
                    } catch (err) {
                        statusEl.innerHTML = `<span class="text-red-500 p-2 block border border-red-500/50 bg-red-500/10 text-xs">Access Denied: ${err.message}. Wrong key or corrupted payload?</span>`;
                    }
                };
            }
            return;
        }

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
                    `Chunk ${chunkIndex} · ${(bytesProcessed / (1024 * 1024)).toFixed(1)} / ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
            }
            await dbSet('TS64_STASH_' + id, { type: 'audio', mime: file.type || 'audio/mpeg', name: file.name, chunkCount: chunkIndex, totalSize: file.size, v: 2 });
            await incrementStat('audio');
            if (container) container.innerHTML = `
                <div class="p-4 border border-white/20 bg-black/40 text-sm space-y-2">
                    <div class="font-bold text-white tracking-widest border-b border-white/10 pb-2 mb-3">AUDIO ENCRYPTED & STORED</div>
                    <div class="text-zinc-400">File: <span class="text-white">${file.name}</span></div>
                    <div class="text-zinc-400">Size: <span class="text-white">${(file.size / (1024 * 1024)).toFixed(2)} MB (${chunkIndex} chunks)</span></div>
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

        const supportsStreamSave = 'showSaveFilePicker' in window;
        let writable = null;
        if (supportsStreamSave) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: `classified_footage_${id}.ts64vid`,
                    types: [{ description: 'Encrypted Video', accept: { 'application/octet-stream': ['.ts64vid'] } }]
                });
                writable = await handle.createWritable();
            } catch (err) {
                if (err.name === 'AbortError') {
                    if (container) container.innerHTML = `<div class="text-zinc-500 text-sm p-4">Save dialog cancelled.</div>`;
                } else {
                    if (container) container.innerHTML = `<div class="text-red-500 text-sm p-4 border border-red-500/30">Encryption Fault: ${err.message}</div>`;
                }
                return;
            }
        }

        showProgressBar(resultContainerId, `ENCRYPTING VIDEO — ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
        try {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const key = await deriveKey(pwd, salt);
            const hdr = new Uint8Array(28);
            hdr.set([0x54, 0x53, 0x36, 0x34], 0);
            hdr.set(salt, 4);
            new DataView(hdr.buffer).setBigUint64(20, BigInt(file.size), true);

            if (writable) await writable.write(hdr);
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
                    `Encrypting ${(bytesProcessed / (1024 * 1024)).toFixed(1)} / ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
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
                    <div class="text-zinc-400">Size: <span class="text-white">${(file.size / (1024 * 1024)).toFixed(2)} MB</span></div>
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

// ============================================================
// DASHBOARD TAB
// ============================================================
async function renderDashboardTab() {
    // Show loading skeleton first
    mainContent.innerHTML = `<div class="p-8 text-zinc-600 text-sm animate-pulse">LOADING VAULT DIAGNOSTICS...</div>`;

    const summary = await getVaultSummary();
    const barFill = Math.floor((parseFloat(summary.percentage) / 100) * 30);
    const barStr = '█'.repeat(barFill) + '░'.repeat(30 - barFill);

    mainContent.innerHTML = `
    <div class="p-6 md:p-8 space-y-8">

        <!-- Title -->
        <div>
            <h1 class="text-2xl md:text-3xl font-bold tracking-widest text-white uppercase">Vault Intelligence Dashboard</h1>
            <div class="text-zinc-600 text-xs mt-1 tracking-wider">TetraScript64 // AES-GCM 256 // IndexedDB Local Vault // Build v3.0.0</div>
        </div>

        <!-- Stat Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="border border-white/20 bg-black/40 p-4 flex flex-col gap-1 hover:border-white/40 transition-colors cursor-pointer" onclick="switchTab('terminal')">
                <div class="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Text Stashes</div>
                <div class="text-white text-3xl font-bold">${summary.textCount}</div>
                <div class="text-zinc-600 text-[10px]">encrypted text entries</div>
            </div>
            <div class="border border-white/20 bg-black/40 p-4 flex flex-col gap-1 hover:border-white/40 transition-colors cursor-pointer" onclick="switchTab('audio')">
                <div class="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Audio Files</div>
                <div class="text-white text-3xl font-bold">${summary.audioCount}</div>
                <div class="text-zinc-600 text-[10px]">encrypted audio stored</div>
            </div>
            <div class="border border-white/20 bg-black/40 p-4 flex flex-col gap-1 hover:border-white/40 transition-colors cursor-pointer" onclick="switchTab('video')">
                <div class="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Video Files</div>
                <div class="text-white text-3xl font-bold">${summary.videoCount}</div>
                <div class="text-zinc-600 text-[10px]">encrypted videos exported</div>
            </div>
            <div class="border border-white/20 bg-black/40 p-4 flex flex-col gap-1">
                <div class="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Total Stashes</div>
                <div class="text-white text-3xl font-bold">${summary.totalStashes}</div>
                <div class="text-zinc-600 text-[10px]">objects in vault</div>
            </div>
        </div>

        <!-- Vault Usage Bar -->
        <div class="border border-white/20 bg-black/40 p-5">
            <div class="flex justify-between text-xs text-zinc-500 uppercase tracking-widest mb-3">
                <span class="font-bold text-white">Vault Utilization</span>
                <span>${summary.totalMB} MB used / ${summary.quotaGB} GB available</span>
            </div>
            <div class="font-mono text-xs text-zinc-300 leading-none">
                [${barStr}] ${summary.percentage}%
            </div>
            <div class="mt-3 flex gap-6 text-[10px] text-zinc-600">
                <span>ENGINE: AES-GCM-256</span>
                <span>STORAGE: IndexedDB</span>
                <span>ZERO-KNOWLEDGE: YES</span>
            </div>
        </div>

        <!-- Quick Actions -->
        <div>
            <div class="text-[10px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-3">QUICK ACTIONS</div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button onclick="switchTab('terminal')"
                    class="border border-white/20 bg-black/40 p-4 text-left hover:border-white/50 transition-colors group">
                    <div class="text-white font-bold text-xs tracking-widest group-hover:text-zinc-300">→ OPEN TERMINAL</div>
                    <div class="text-zinc-600 text-[10px] mt-1">Stash, unlock, encode, export text</div>
                </button>
                <button onclick="switchTab('audio')"
                    class="border border-white/20 bg-black/40 p-4 text-left hover:border-white/50 transition-colors group">
                    <div class="text-white font-bold text-xs tracking-widest group-hover:text-zinc-300">→ ENCRYPT AUDIO</div>
                    <div class="text-zinc-600 text-[10px] mt-1">MP3, WAV, OGG → AES-GCM vault</div>
                </button>
                <button onclick="switchTab('video')"
                    class="border border-white/20 bg-black/40 p-4 text-left hover:border-white/50 transition-colors group">
                    <div class="text-white font-bold text-xs tracking-widest group-hover:text-zinc-300">→ ENCRYPT VIDEO</div>
                    <div class="text-zinc-600 text-[10px] mt-1">MP4, WebM → classified .ts64vid file</div>
                </button>
            </div>
        </div>

        <!-- System Info -->
        <div class="border-t border-white/10 pt-6">
            <div class="text-[10px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-3">SYSTEM LOG</div>
            <div class="font-mono text-xs text-zinc-500 space-y-1">
                <div><span class="text-zinc-700">[OK]</span> IndexedDB vault online</div>
                <div><span class="text-zinc-700">[OK]</span> Web Crypto AES-GCM-256 initialized</div>
                <div><span class="text-zinc-700">[OK]</span> PBKDF2 key derivation active (100,000 iterations)</div>
                <div><span class="text-zinc-700">[OK]</span> Zero-knowledge architecture — no server contact</div>
                <div><span class="text-zinc-700">[--]</span> All encryption/decryption runs locally in your browser</div>
            </div>
        </div>
    </div>`;

    rightSidebar.innerHTML = `
        <div class="p-4 border-b border-white/20 text-[10px] font-bold tracking-widest text-white uppercase">VAULT STATUS</div>
        <div class="p-4 space-y-4 text-xs">
            <div class="flex justify-between text-zinc-500 uppercase tracking-widest">
                <span>Text Stashes</span><span class="text-white font-bold">${summary.textCount}</span>
            </div>
            <div class="flex justify-between text-zinc-500 uppercase tracking-widest">
                <span>Audio Encrypted</span><span class="text-white font-bold">${summary.audioCount}</span>
            </div>
            <div class="flex justify-between text-zinc-500 uppercase tracking-widest">
                <span>Video Exported</span><span class="text-white font-bold">${summary.videoCount}</span>
            </div>
            <div class="flex justify-between text-zinc-500 uppercase tracking-widest border-t border-white/10 pt-3">
                <span>Total Objects</span><span class="text-white font-bold">${summary.totalStashes}</span>
            </div>
            <div class="flex justify-between text-zinc-500 uppercase tracking-widest">
                <span>Vault Size</span><span class="text-white font-bold">${summary.totalKB} KB</span>
            </div>
            <div class="flex justify-between text-zinc-500 uppercase tracking-widest">
                <span>Utilization</span><span class="text-white font-bold">${summary.percentage}%</span>
            </div>
        </div>
        <div class="p-4 border-t border-white/10 text-[10px] text-zinc-600 tracking-widest space-y-1">
            <div>ENGINE: AES-GCM-256</div>
            <div>KDF: PBKDF2-SHA256</div>
            <div>STORAGE: IndexedDB</div>
        </div>
    `;
}

// ============================================================
// AUDIO TAB
// ============================================================
function renderAudioTab() {
    mainContent.innerHTML = `
    <div class="p-6 md:p-8 space-y-6">
        <div>
            <h2 class="text-2xl font-bold tracking-widest text-white uppercase">Audio Encryption Vault</h2>
            <div class="text-zinc-600 text-xs mt-1 tracking-wider">AES-GCM 256-bit // IndexedDB Local Storage // Supports MP3, WAV, OGG, FLAC</div>
        </div>

        <!-- Drop Zone -->
        <div id="audio-drop-zone"
             class="border-2 border-dashed border-white/20 bg-black/40 p-10 text-center transition-all duration-200 cursor-pointer"
             ondragover="event.preventDefault(); this.classList.add('border-white', 'bg-white/5');"
             ondragleave="this.classList.remove('border-white', 'bg-white/5');"
             ondrop="event.preventDefault(); this.classList.remove('border-white','bg-white/5'); handleAudioDrop(event);">
            <div class="material-symbols-outlined text-5xl text-white/20 mb-4 block">graphic_eq</div>
            <div class="text-white font-bold tracking-widest text-sm mb-2">DROP AUDIO FILE HERE</div>
            <div class="text-zinc-500 text-xs mb-6">MP3 · WAV · OGG · FLAC · or any browser-supported audio</div>
            <div class="text-zinc-600 text-xs mb-6">— or —</div>
            <button onclick="document.getElementById('audio-file-input').click()"
                class="bg-white text-black font-bold px-6 py-2 text-xs uppercase tracking-widest hover:bg-zinc-300 transition-colors">
                SELECT AUDIO FILE
            </button>
            <input type="file" id="audio-file-input" accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a" class="hidden"
                onchange="handleAudioInputChange(event)" />
        </div>

        <!-- Result Area -->
        <div id="audio-result"></div>

        <!-- Instructions -->
        <div class="border border-white/10 p-5 text-xs text-zinc-500 space-y-2">
            <div class="text-white font-bold tracking-widest text-[10px] uppercase mb-3">HOW IT WORKS</div>
            <div><span class="text-white">1.</span> Drop or select an audio file above</div>
            <div><span class="text-white">2.</span> The file is encrypted in-browser using AES-GCM 256-bit — nothing leaves your device</div>
            <div><span class="text-white">3.</span> The encrypted audio is stored in your local IndexedDB vault</div>
            <div><span class="text-white">4.</span> Save the generated Access Key — it's required to decrypt</div>
            <div><span class="text-white">5.</span> Use <code class="text-white bg-white/10 px-1">unlock [KEY]</code> in the Terminal to play the audio</div>
        </div>
    </div>`;

    rightSidebar.innerHTML = `
        <div class="p-4 border-b border-white/20 text-[10px] font-bold tracking-widest text-white uppercase">AUDIO.METADATA</div>
        <div class="p-4 text-xs text-zinc-500 space-y-3">
            <div class="text-white font-bold tracking-wider">Supported Formats</div>
            <div class="space-y-1 text-zinc-500">
                <div>· MP3 (audio/mpeg)</div>
                <div>· WAV (audio/wav)</div>
                <div>· OGG (audio/ogg)</div>
                <div>· FLAC (audio/flac)</div>
                <div>· AAC / M4A</div>
            </div>
            <div class="border-t border-white/10 pt-3 text-white font-bold tracking-wider mt-3">Storage</div>
            <div class="text-zinc-500">Encrypted blobs stored in browser IndexedDB. No server, no upload — fully local.</div>
            <div class="border-t border-white/10 pt-3 text-white font-bold tracking-wider mt-3">Backup</div>
            <div class="text-zinc-500">Use <code class="text-white">export [KEY]</code> in Terminal to download your encrypted audio as a .ts64 backup file.</div>
        </div>`;
}

window.handleAudioDrop = async function (e) {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await handleMediaFile(file, 'audio-result', 'audio');
    renderSidebar();
};

window.handleAudioInputChange = async function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleMediaFile(file, 'audio-result', 'audio');
    renderSidebar();
};

// ============================================================
// VIDEO TAB
// ============================================================
function renderVideoTab() {
    mainContent.innerHTML = `
    <div class="p-6 md:p-8 space-y-6">
        <div>
            <h2 class="text-2xl font-bold tracking-widest text-white uppercase">Video Encryption Vault</h2>
            <div class="text-zinc-600 text-xs mt-1 tracking-wider">AES-GCM 256-bit // Downloads as .ts64vid // Supports MP4, WebM, MOV, MKV</div>
        </div>

        <!-- Drop Zone -->
        <div id="video-drop-zone"
             class="border-2 border-dashed border-white/20 bg-black/40 p-10 text-center transition-all duration-200 cursor-pointer"
             ondragover="event.preventDefault(); this.classList.add('border-white', 'bg-white/5');"
             ondragleave="this.classList.remove('border-white', 'bg-white/5');"
             ondrop="event.preventDefault(); this.classList.remove('border-white','bg-white/5'); handleVideoDrop(event);">
            <div class="material-symbols-outlined text-5xl text-white/20 mb-4 block">movie</div>
            <div class="text-white font-bold tracking-widest text-sm mb-2">DROP VIDEO FILE HERE</div>
            <div class="text-zinc-500 text-xs mb-2">MP4 · WebM · MOV · MKV · or any browser-supported video</div>
            <div class="text-zinc-500 text-xs mb-6">⚠ Large files may take a moment to encrypt in-memory</div>
            <div class="text-zinc-600 text-xs mb-6">— or —</div>
            <button onclick="document.getElementById('video-file-input').click()"
                class="bg-white text-black font-bold px-6 py-2 text-xs uppercase tracking-widest hover:bg-zinc-300 transition-colors">
                SELECT VIDEO FILE
            </button>
            <input type="file" id="video-file-input" accept="video/*,.mp4,.webm,.mov,.mkv,.avi" class="hidden"
                onchange="handleVideoInputChange(event)" />
        </div>

        <!-- Restore Zone -->
        <div class="border border-white/10 bg-black/20 p-5">
            <div class="text-[10px] font-bold tracking-widest text-white uppercase mb-3">RESTORE ENCRYPTED VIDEO</div>
            <div class="text-zinc-500 text-xs mb-4">Drop a <code class="text-white">.ts64vid</code> encrypted file here to instantly decrypt and play it, or use <code class="text-white">unlock_video</code> in the Terminal.</div>
            <div id="video-restore-zone"
                 class="border border-dashed border-white/10 p-6 text-center text-zinc-600 text-xs transition-all"
                 ondragover="event.preventDefault(); this.classList.add('border-white/40');"
                 ondragleave="this.classList.remove('border-white/40');"
                 ondrop="event.preventDefault(); this.classList.remove('border-white/40'); handleVideoRestoreDrop(event);">
                <div class="mb-3">DROP .ts64vid FILE HERE TO RESTORE</div>
                <div class="text-zinc-600 text-xs mb-3">— or —</div>
                <button onclick="document.getElementById('video-restore-file-input').click()"
                    class="bg-white text-black font-bold px-6 py-2 text-xs uppercase tracking-widest hover:bg-zinc-300 transition-colors">
                    SELECT FILE
                </button>
                <input type="file" id="video-restore-file-input" accept=".ts64,.ts64vid" class="hidden"
                    onchange="handleVideoRestoreInputChange(event)" />
            </div>
            <div id="video-restore-result" class="mt-3"></div>
        </div>

        <!-- Result Area -->
        <div id="video-result"></div>

        <!-- Instructions -->
        <div class="border border-white/10 p-5 text-xs text-zinc-500 space-y-2">
            <div class="text-white font-bold tracking-widest text-[10px] uppercase mb-3">HOW IT WORKS</div>
            <div><span class="text-white">1.</span> Drop or select a video file above</div>
            <div><span class="text-white">2.</span> Browser encrypts it in-memory with AES-GCM 256 — zero server contact</div>
            <div><span class="text-white">3.</span> Encrypted file auto-downloads as <code class="text-white">classified_footage_XXXX.ts64vid</code></div>
            <div><span class="text-white">4.</span> Save the Access Key — without it the video cannot be decrypted</div>
            <div><span class="text-white">5.</span> Drag the <code class="text-white">.ts64vid</code> file into the restore zone above, or use <code class="text-white">unlock_video</code> in Terminal to watch</div>
        </div>
    </div>`;

    rightSidebar.innerHTML = `
        <div class="p-4 border-b border-white/20 text-[10px] font-bold tracking-widest text-white uppercase">VIDEO.METADATA</div>
        <div class="p-4 text-xs text-zinc-500 space-y-3">
            <div class="text-white font-bold tracking-wider">Supported Formats</div>
            <div class="space-y-1 text-zinc-500">
                <div>· MP4 (video/mp4)</div>
                <div>· WebM (video/webm)</div>
                <div>· MOV (video/quicktime)</div>
                <div>· MKV / AVI</div>
            </div>
            <div class="border-t border-white/10 pt-3 text-white font-bold tracking-wider mt-3">Architecture</div>
            <div class="text-zinc-500">Videos are too large for IndexedDB — encrypted payload is downloaded to your device as a <code class="text-white">.ts64vid</code> file. The file is 100% opaque without the key.</div>
            <div class="border-t border-white/10 pt-3 text-white font-bold tracking-wider mt-3">Double Security</div>
            <div class="text-zinc-500">Planned: Layer 2 ChaCha20 wrapping for double-encrypted video vaults.</div>
        </div>`;
}

window.handleVideoDrop = async function (e) {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.ts64vid') || file.name.toLowerCase().endsWith('.ts64')) {
        await handleMediaFile(file, 'video-restore-result', 'backup');
    } else {
        await handleMediaFile(file, 'video-result', 'video');
    }
    renderSidebar();
};

window.handleVideoInputChange = async function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleMediaFile(file, 'video-result', 'video');
    renderSidebar();
};

window.handleVideoRestoreDrop = async function (e) {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.ts64vid') && !file.name.toLowerCase().endsWith('.ts64')) {
        document.getElementById('video-restore-result').innerHTML = `<div class="text-red-500 text-xs p-2">Error: Expected a .ts64 or .ts64vid file.</div>`;
        return;
    }
    await handleMediaFile(file, 'video-restore-result', 'backup');
};

window.handleVideoRestoreInputChange = async function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.ts64vid') && !file.name.toLowerCase().endsWith('.ts64')) {
        document.getElementById('video-restore-result').innerHTML = `<div class="text-red-500 text-xs p-2">Error: Expected a .ts64 or .ts64vid file.</div>`;
        return;
    }
    await handleMediaFile(file, 'video-restore-result', 'backup');
};

// ============================================================
// HELP TAB
// ============================================================
function renderHelpTab() {
    mainContent.innerHTML = `
    <div class="p-8">
        <h2 class="text-2xl font-bold tracking-widest text-white mb-6 uppercase border-b border-white/20 pb-4">System Manual</h2>
        <div class="space-y-6 text-sm text-zinc-400">
            <div>
                <h3 class="text-white font-bold mb-3 tracking-wider">TERMINAL COMMANDS</h3>
                <div class="space-y-3">
                    ${[
            ['encode {string}', 'Maps English characters to Binary blocks (UTF-8 → 64-bit blocks).'],
            ['decode {binary}', 'Reverses space-separated binary blocks into English text.'],
            ['stash {string}', 'Encrypts text payload with AES-GCM 256 and stores in local IndexedDB vault.'],
            ['unlock {key}', 'Decrypts a stash — works for text, audio, and video payloads.'],
            ['export {key}', 'Downloads your encrypted stash as a portable .ts64 backup file.'],
            ['stash_audio', 'Opens a file picker to encrypt an audio file into the local vault.'],
            ['stash_video', 'Opens a file picker to encrypt a video file — auto-downloads as .ts64vid.'],
            ['unlock_video', 'Opens a file picker to decrypt and play a .ts64vid video file.'],
            ['purge', 'Permanently wipes all TS64 encrypted data from the vault.'],
            ['status', 'Displays vault diagnostics: stash count, size, utilization.'],
            ['clear', 'Clears terminal output history.'],
        ].map(([cmd, desc]) => `
                        <div class="bg-white/5 border border-white/10 p-3">
                            <code class="text-white block mb-1 text-xs">${cmd}</code>
                            <p class="text-xs text-zinc-500">${desc}</p>
                        </div>`).join('')}
                </div>
            </div>
            <div>
                <h3 class="text-white font-bold mb-3 tracking-wider">DRAG & DROP</h3>
                <div class="space-y-2 text-xs text-zinc-500">
                    <p>The <strong class="text-white">Audio</strong> and <strong class="text-white">Video</strong> tabs both have drag-and-drop zones. Drop supported files directly onto the zone to encrypt them instantly.</p>
                    <p>You can also drag <strong class="text-white">.ts64</strong> or <strong class="text-white">.ts64vid</strong> backup files onto the Video tab restore zone to re-import them into the vault.</p>
                    <p>In the <strong class="text-white">Terminal</strong> tab, dropping any supported file works inline within the console output.</p>
                </div>
            </div>
            <div>
                <h3 class="text-white font-bold mb-3 tracking-wider">ENCRYPTION ARCHITECTURE</h3>
                <div class="text-xs text-zinc-500 space-y-2">
                    <p>All encryption uses the browser's native <strong class="text-white">Web Crypto API</strong> with <strong class="text-white">AES-GCM-256</strong>.</p>
                    <p>Keys are derived using <strong class="text-white">PBKDF2-SHA256</strong> with 100,000 iterations and a random 16-byte salt.</p>
                    <p>A random 12-byte IV is generated per encryption operation. Salt + IV + ciphertext are bundled into a single payload.</p>
                    <p><strong class="text-white">Nothing ever leaves your browser.</strong> No servers, no tracking, no cloud.</p>
                </div>
            </div>
        </div>
    </div>`;
    rightSidebar.style.display = 'none';
}

// ============================================================
// TERMINAL TAB
// ============================================================
function renderTerminalTab() {
    mainContent.innerHTML = `
        <div class="flex flex-col min-h-full w-full p-6 pb-20 justify-end">
            <div id="output-container" class="w-full flex-1 flex flex-col justify-end gap-1 text-sm md:text-base leading-relaxed"></div>
            <div class="flex items-start gap-3 mt-4 text-lg w-full relative shrink-0">
                <span class="text-white font-bold whitespace-nowrap pt-1">tetrascript64@system:~$</span>
                <form id="cli-form" class="flex-1 flex w-full relative">
                    <textarea id="cli-input"
                        class="flex-1 w-full bg-transparent border-none text-white p-0 focus:ring-0 focus:outline-none outline-none font-mono text-lg resize-none overflow-hidden pt-1 leading-relaxed caret-transparent"
                        style="box-shadow:none; -webkit-appearance:none; appearance:none;"
                        autocomplete="off" autocapitalize="none" autocorrect="off" autofocus spellcheck="false" rows="1"></textarea>
                    <div id="cli-cursor" class="absolute w-2 h-5 bg-white opacity-80 pointer-events-none mt-1.5 transition-all duration-75"></div>
                </form>
            </div>
        </div>`;

    setTimeout(() => {
        initTerminalEngine();
        document.getElementById('cli-input').focus();
    }, 50);
}

// ============================================================
// TERMINAL ENGINE
// ============================================================
function initTerminalEngine() {
    const inputEl = document.getElementById('cli-input');
    const formEl = document.getElementById('cli-form');
    const outputContainer = document.getElementById('output-container');
    const mainEl = document.getElementById('main-content');

    if (!inputEl || !formEl) return;

    mainEl.addEventListener('click', () => {
        if (window.getSelection().toString() === '') inputEl.focus();
    });

    const cursorEl = document.getElementById('cli-cursor');
    const inputMock = document.createElement('div');
    inputMock.className = "w-full pointer-events-none break-all font-mono text-lg pt-1 invisible absolute top-0 left-0";
    formEl.insertBefore(inputMock, inputEl);
    inputEl.style.color = 'transparent';
    inputEl.style.caretColor = 'transparent';
    if (cursorEl) cursorEl.remove();

    function updateInputUI() {
        inputEl.style.height = 'auto';
        inputEl.style.height = inputEl.scrollHeight + 'px';
        const text = inputEl.value;
        const index = inputEl.selectionStart;
        const before = text.substring(0, index);
        const atCursor = text.substring(index, index + 1) || '&nbsp;';
        const after = text.substring(index + 1);
        inputMock.innerHTML = `<span class="text-white whitespace-pre-wrap leading-relaxed">${before.replace(/</g, '&lt;')}</span><span class="bg-white text-black opacity-80 animate-pulse border-b-2 border-white inline-block whitespace-pre-wrap leading-relaxed ${atCursor === ' ' || atCursor === '&nbsp;' ? 'w-2 h-5 align-middle' : ''}">${atCursor === '&nbsp;' ? '' : atCursor.replace(/</g, '&lt;')}</span><span class="text-white whitespace-pre-wrap leading-relaxed">${after.replace(/</g, '&lt;')}</span>`;
        inputMock.classList.remove('invisible');
        inputMock.style.visibility = 'visible';
    }

    inputEl.addEventListener('input', updateInputUI);
    inputEl.addEventListener('keyup', updateInputUI);
    inputEl.addEventListener('click', updateInputUI);
    requestAnimationFrame(updateInputUI);

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formEl.dispatchEvent(new Event('submit')); }
        else if (e.key === 'PageUp') { e.preventDefault(); mainEl.scrollBy({ top: -mainEl.clientHeight * 0.8, behavior: 'smooth' }); }
        else if (e.key === 'PageDown') { e.preventDefault(); mainEl.scrollBy({ top: mainEl.clientHeight * 0.8, behavior: 'smooth' }); }
    });

    // ---- Encoding helpers ----
    function encodeTextToBinaryBlocks(text) {
        if (!text) return [];
        const bytes = new TextEncoder().encode(text);
        let bin = '';
        for (let b of bytes) bin += b.toString(2).padStart(8, '0');
        const blocks = [];
        for (let i = 0; i < bin.length; i += 64) blocks.push(bin.substring(i, i + 64));
        return blocks;
    }

    function decodeBinaryBlocksToText(blocksArray) {
        try {
            const bin = blocksArray.join('');
            if (!bin || bin.length % 8 !== 0) throw new Error("Invalid length");
            const bytes = new Uint8Array(bin.length / 8);
            for (let i = 0; i < bin.length; i += 8) bytes[i / 8] = parseInt(bin.substring(i, i + 8), 2);
            return new TextDecoder().decode(bytes);
        } catch { return null; }
    }

    // ---- Storage stats (terminal inline) ----
    async function renderStorageStatsInline() {
        const summary = await getVaultSummary();
        const barFill = Math.floor((parseFloat(summary.percentage) / 100) * 30);
        const barStr = '█'.repeat(barFill) + '░'.repeat(30 - barFill);
        return `
        <div class="border border-white/20 pl-4 mb-6 space-y-4 pt-4 pr-4 bg-black/40">
            <div class="flex justify-between items-end border-b border-white/20 pb-2">
                <div>
                    <div class="text-white font-bold text-sm tracking-wider">SECURE STORAGE DIAGNOSTICS_</div>
                    <div class="text-zinc-500 text-xs uppercase">Local Vault Engine // AES-GCM 256 // IndexedDB</div>
                </div>
                <div class="text-right">
                    <div class="text-zinc-500 text-xs">TOTAL STASHES</div>
                    <div class="text-white font-bold">${summary.totalStashes}</div>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4 text-xs">
                <div><div class="text-zinc-600 uppercase tracking-widest">Text</div><div class="text-white font-bold text-xl">${summary.textCount}</div></div>
                <div><div class="text-zinc-600 uppercase tracking-widest">Audio</div><div class="text-white font-bold text-xl">${summary.audioCount}</div></div>
                <div><div class="text-zinc-600 uppercase tracking-widest">Video</div><div class="text-white font-bold text-xl">${summary.videoCount}</div></div>
            </div>
            <div>
                <div class="flex justify-between text-xs text-zinc-500 uppercase tracking-widest mb-1">
                    <span>Vault Utilization</span>
                    <span class="text-white">${summary.totalMB} MB / ${summary.quotaGB} GB</span>
                </div>
                <div class="font-mono text-xs text-zinc-300 leading-none pb-2">
                    [${barStr}] ${summary.percentage}%
                </div>
            </div>
        </div>`;
    }

    // ---- Command Handler ----
    formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cmdText = inputEl.value.trim();
        if (!cmdText) return;

        const myCmdWrap = document.createElement('div');
        myCmdWrap.className = 'flex flex-col mt-4';
        myCmdWrap.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-white font-bold">tetrascript64@system:~$</span>
                <span class="text-zinc-300">${cmdText.replace(/</g, '&lt;')}</span>
            </div>`;
        outputContainer.appendChild(myCmdWrap);

        const parts = cmdText.split(/[\s\u200B\uFEFF]+/).filter(Boolean);
        const command = parts[0]?.toLowerCase() || '';
        const firstWordEnd = cmdText.search(/[\s\u200B\uFEFF]/);
        const args = firstWordEnd === -1 ? '' : cmdText.substring(firstWordEnd).replace(/^[\s\u200B\uFEFF]+/, '');

        const resWrap = document.createElement('div');
        resWrap.className = 'mt-2 mb-4 border-l pl-4 py-2 border-white/10 text-sm';

        if (command === 'clear') {
            outputContainer.innerHTML = '';
        } else if (command === 'status' || command === 'dashboard') {
            resWrap.innerHTML = await renderStorageStatsInline();
            resWrap.classList.remove('border-l', 'pl-4');
        } else if (command === 'help') {
            resWrap.innerHTML = `
                <div class="text-zinc-400 space-y-1 text-xs">
                    ${[
                    ['encode {string}', 'Encode text to binary blocks'],
                    ['decode {binary}', 'Decode binary blocks to text'],
                    ['stash {string}', 'Encrypt and store text in vault'],
                    ['unlock {key}', 'Decrypt stash (text, audio, or video)'],
                    ['export {key}', 'Download encrypted backup (.ts64)'],
                    ['stash_audio', 'Encrypt an audio file into vault'],
                    ['stash_video', 'Encrypt a video file (downloads as .ts64vid)'],
                    ['purge', 'Wipe all encrypted data from vault'],
                    ['status', 'Show vault diagnostics'],
                    ['clear', 'Clear terminal output'],
                ].map(([c, d]) => `<p><span class="text-white font-bold">${c}</span> — ${d}</p>`).join('')}
                </div>`;

        } else if (command === 'encode') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing input string</span>`;
            } else {
                const blocks = encodeTextToBinaryBlocks(args);
                const encodedPhrase = blocks.join(' ');
                resWrap.innerHTML = `
                    <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">ENCODING SEQUENCE</div>
                    <div class="text-sm text-zinc-500 mb-4">Sequence: <span class="text-white">${blocks.length} BLOCKS</span></div>
                    <div class="mt-4 p-5 border border-white/20 bg-white/5 text-zinc-300 font-mono text-xs tracking-widest break-all flex gap-3 items-start">
                        <span class="shrink-0">></span>
                        <span class="whitespace-pre-wrap leading-relaxed">${encodedPhrase}</span>
                    </div>`;
            }

        } else if (command === 'decode') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing binary blocks</span>`;
            } else {
                const bins = args.trim().split(/[\s\u200B\uFEFF]+/);
                const result = decodeBinaryBlocksToText(bins);
                if (result === null) {
                    resWrap.innerHTML = `<span class="text-red-500">Error: Invalid binary sequence</span>`;
                } else {
                    resWrap.innerHTML = `
                        <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">DECODING SEQUENCE</div>
                        <div class="text-sm text-zinc-500 mb-4">Sequence: <span class="text-white">${bins.length} BLOCKS</span></div>
                        <div class="mt-4 p-5 border border-white/20 bg-white/5 text-white font-mono text-base tracking-wide flex gap-3 items-start">
                            <span class="shrink-0">></span>
                            <span class="whitespace-pre-wrap break-words leading-relaxed">${result.replace(/</g, '&lt;')}</span>
                        </div>`;
                }
            }

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
                        const salt = crypto.getRandomValues(new Uint8Array(16));
                        const key = await deriveKey(pwd, salt);
                        const hdr = new Uint8Array(28);
                        hdr.set([0x54, 0x53, 0x36, 0x34], 0);
                        hdr.set(salt, 4);
                        new DataView(hdr.buffer).setBigUint64(20, BigInt(payloadBytes.byteLength), true);
                        await dbSet('TS64_STASH_' + id + '_header', hdr);

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

        } else if (command === 'stash_audio') {
            const btnId = 'btn-audio-' + Date.now();
            resWrap.innerHTML = `
                <div class="text-zinc-500 mb-3">Select an audio file to encrypt (.mp3, .wav, .ogg...)</div>
                <button id="${btnId}" class="bg-white text-black font-bold px-4 py-2 text-xs uppercase tracking-widest hover:bg-zinc-300 transition-colors">SELECT AUDIO FILE</button>`;
            outputContainer.appendChild(resWrap);

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a';
            fileInput.onchange = async (ev) => {
                const file = ev.target.files[0];
                if (!file) { resWrap.innerHTML = `<span class="text-red-500">No file selected.</span>`; return; }

                resWrap.innerHTML = `
                    <div class="p-3 border border-white/20 bg-black/40">
                        <div class="text-white font-bold tracking-widest text-xs mb-3 uppercase">ENCRYPTING AUDIO — ${(file.size / (1024 * 1024)).toFixed(1)} MB</div>
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
                            `Chunk ${chunkIndex} · ${(bytesProcessed / (1024 * 1024)).toFixed(1)} / ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
                    }
                    await dbSet('TS64_STASH_' + id, { type: 'audio', mime: file.type || 'audio/mpeg', name: file.name, chunkCount: chunkIndex, totalSize: file.size, v: 2 });
                    await incrementStat('audio');
                    resWrap.innerHTML = `
                        <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">AUDIO STASH SECURED</div>
                        <div class="mb-2 text-zinc-500">File: <span class="text-white">${file.name}</span></div>
                        <div class="mb-2 text-zinc-500">Size: <span class="text-white">${(file.size / (1024 * 1024)).toFixed(2)} MB (${chunkIndex} chunks)</span></div>
                        <div class="mb-2 text-zinc-500">Engine: <span class="text-white">AES-GCM 256-bit / IndexedDB (chunked)</span></div>
                        ${keyCardHTML(pwd)}`;
                    renderSidebar();
                } catch (err) { resWrap.innerHTML = `<span class="text-red-500">Fault: ${err.message}</span>`; }
            };
            document.getElementById(btnId).addEventListener('click', () => fileInput.click());
            inputEl.value = '';
            setTimeout(() => mainEl.scrollTo({ top: mainEl.scrollHeight }), 10);
            return;

        } else if (command === 'stash_video') {
            const btnId = 'btn-video-' + Date.now();
            resWrap.innerHTML = `
                <div class="text-zinc-500 mb-3">Select a video file to encrypt (.mp4, .webm...)</div>
                <button id="${btnId}" class="bg-white text-black font-bold px-4 py-2 text-xs uppercase tracking-widest hover:bg-zinc-300 transition-colors">SELECT VIDEO FILE</button>`;
            outputContainer.appendChild(resWrap);

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'video/*,.mp4,.webm,.mov,.mkv,.avi';
            fileInput.onchange = async (ev) => {
                const file = ev.target.files[0];
                if (!file) { resWrap.innerHTML = `<span class="text-red-500">No file selected.</span>`; return; }

                const pwd = generatePassword();
                const id = pwd.split('-')[1];

                const supportsStreamSave = 'showSaveFilePicker' in window;
                let writable = null;
                if (supportsStreamSave) {
                    try {
                        const handle = await window.showSaveFilePicker({
                            suggestedName: `classified_footage_${id}.ts64vid`,
                            types: [{ description: 'Encrypted Video', accept: { 'application/octet-stream': ['.ts64vid'] } }]
                        });
                        writable = await handle.createWritable();
                    } catch (err) {
                        if (err.name === 'AbortError') resWrap.innerHTML = `<span class="text-zinc-500">Save dialog cancelled.</span>`;
                        else resWrap.innerHTML = `<span class="text-red-500">Encryption Fault: ${err.message}</span>`;
                        return;
                    }
                }

                resWrap.innerHTML = `
                    <div class="p-3 border border-white/20 bg-black/40">
                        <div class="text-white font-bold tracking-widest text-xs mb-3 uppercase">ENCRYPTING VIDEO — ${(file.size / (1024 * 1024)).toFixed(1)} MB</div>
                        <div class="w-full bg-white/10 h-1 mb-2 overflow-hidden">
                            <div id="enc-progress-bar" class="bg-white h-1 transition-all duration-300" style="width:0%"></div>
                        </div>
                        <div id="enc-progress-text" class="text-zinc-500 text-xs font-mono">INITIALIZING...</div>
                    </div>`;

                try {
                    const salt = crypto.getRandomValues(new Uint8Array(16));
                    const key = await deriveKey(pwd, salt);
                    const hdr = new Uint8Array(28);
                    hdr.set([0x54, 0x53, 0x36, 0x34], 0);
                    hdr.set(salt, 4);
                    new DataView(hdr.buffer).setBigUint64(20, BigInt(file.size), true);

                    if (writable) await writable.write(hdr);
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
                            `${(bytesProcessed / (1024 * 1024)).toFixed(1)} / ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
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
                        <div class="mb-2 text-zinc-500">Size: <span class="text-white">${(file.size / (1024 * 1024)).toFixed(2)} MB</span></div>
                        <div class="mb-2 text-zinc-500">Engine: <span class="text-white">AES-GCM 256-bit (chunked stream)</span></div>
                        ${keyCardHTML(pwd)}`;
                    renderSidebar();
                } catch (err) {
                    if (err.name === 'AbortError') resWrap.innerHTML = `<span class="text-zinc-500">Save dialog cancelled.</span>`;
                    else resWrap.innerHTML = `<span class="text-red-500">Fault: ${err.message}</span>`;
                }
            };
        } else if (command === 'unlock_video') {
            const btnId = 'btn-unlock-video-' + Date.now();
            resWrap.innerHTML = `
                <div class="text-zinc-500 mb-3">Select a .ts64vid file to decrypt</div>
                <button id="${btnId}" class="bg-white text-black font-bold px-4 py-2 text-xs uppercase tracking-widest hover:bg-zinc-300 transition-colors">SELECT .ts64vid FILE</button>`;
            outputContainer.appendChild(resWrap);

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.ts64vid,.ts64';
            fileInput.onchange = async (ev) => {
                const file = ev.target.files[0];
                if (!file) { resWrap.innerHTML = `<span class="text-red-500">No file selected.</span>`; return; }

                const pwd = prompt(`Enter Decryption Key for ${file.name}:`);
                if (!pwd) return;
                const parts = pwd.split('-');
                if (parts.length !== 3 || parts[0] !== 'TS64') {
                    resWrap.innerHTML = `<span class="text-red-500">Access Denied: Invalid key format.</span>`;
                    return;
                }

                resWrap.innerHTML = `
                    <div class="p-3 border border-white/20 bg-black/40">
                        <div class="text-white font-bold tracking-widest text-xs mb-3 uppercase">DECRYPTING VIDEO — ${(file.size / (1024 * 1024)).toFixed(1)} MB</div>
                        <div class="w-full bg-white/10 h-1 mb-2 overflow-hidden">
                            <div id="enc-progress-bar" class="bg-white h-1 transition-all duration-300" style="width:0%"></div>
                        </div>
                        <div id="enc-progress-text" class="text-zinc-500 text-xs font-mono">Reading header...</div>
                    </div>`;

                try {
                    const hdrRaw = await file.slice(0, 28).arrayBuffer();
                    const hdrArr = new Uint8Array(hdrRaw);
                    if (hdrArr[0] !== 0x54 || hdrArr[1] !== 0x53 || hdrArr[2] !== 0x36 || hdrArr[3] !== 0x34) {
                        throw new Error('Not a valid TS64 backup file.');
                    }
                    const salt = hdrArr.slice(4, 20);
                    const key = await deriveKey(pwd, salt);

                    const outBlobParts = [];
                    let offset = 28;
                    let chunkIndex = 0;
                    while (offset < file.size) {
                        const envHdr = await file.slice(offset, offset + 20).arrayBuffer();
                        if (envHdr.byteLength < 20) break;
                        const ctLen = new DataView(envHdr).getUint32(16, true);
                        const iv = new Uint8Array(envHdr, 4, 12);

                        const chunkData = await file.slice(offset + 20, offset + 20 + ctLen).arrayBuffer();
                        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, chunkData);
                        outBlobParts.push(plain);

                        offset += 20 + ctLen;
                        chunkIndex++;
                        updateProgress((offset / file.size) * 100, `Decrypting… ${(offset / (1024 * 1024)).toFixed(1)}MB`);
                    }

                    updateProgress(98, 'Building download…');
                    const outBlob = new Blob(outBlobParts, { type: 'video/mp4' });
                    const url = URL.createObjectURL(outBlob);

                    // Show inline player instead of downloading immediately if from terminal, or let them click download
                    resWrap.innerHTML = `
                        <div class="p-4 border border-white/20 bg-black/40 space-y-3">
                            <div class="font-bold text-white tracking-widest border-b border-white/10 pb-2">VIDEO DECRYPTED</div>
                            <video controls class="w-full border border-white/20" style="max-height:400px; background:#000;" src="${url}"></video>
                            <div class="mt-3">
                                <a href="${url}" download="decrypted_${file.name.replace('.ts64vid', '')}.mp4" class="inline-block bg-white text-black font-bold px-4 py-2 text-xs uppercase tracking-widest hover:bg-zinc-300 transition-colors">
                                    SAVE VIDEO TO DISK
                                </a>
                            </div>
                        </div>`;
                } catch (err) {
                    resWrap.innerHTML = `<span class="text-red-500 p-2 block border border-red-500/50 bg-red-500/10">Access Denied: ${err.message}. Wrong key or corrupted payload?</span>`;
                }
            };
            document.getElementById(btnId).addEventListener('click', () => fileInput.click());
            inputEl.value = '';
            setTimeout(() => mainEl.scrollTo({ top: mainEl.scrollHeight }), 10);
            return;

        } else if (command === 'unlock') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing password key</span>`;
            } else {
                resWrap.innerHTML = `<div class="text-zinc-500 animate-pulse">Decrypting payload...</div>`;
                outputContainer.appendChild(resWrap);
                const pwd = args.trim().toUpperCase();
                const parts = pwd.split('-');
                if (parts.length !== 3 || parts[0] !== 'TS64') {
                    resWrap.innerHTML = `<span class="text-red-500">Access Denied: Invalid key format. Expected TS64-XXXX-XXXX</span>`;
                } else {
                    const id = parts[1];

                    const metaCheck = await dbGet('TS64_STASH_' + id);
                    const isV2 = metaCheck && typeof metaCheck === 'object' && metaCheck.v === 2;

                    if (isV2 && metaCheck.type === 'text') {
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
                        const payload = await dbGet('TS64_STASH_' + id);
                        if (!payload) {
                            resWrap.innerHTML = `
                                <div class="text-red-500 font-bold mb-1">Access Denied: No data found for key ${id}.</div>
                                <div class="text-zinc-500 text-xs leading-relaxed">If this is a Video Stash, it was saved directly to your device as a <span class="text-white">.ts64vid</span> file. Use the <strong class="text-white">unlock_video</strong> command to decrypt it.</div>`;
                        } else {
                            const decrypted = await decryptData(payload, pwd, false);
                            if (!decrypted) {
                                resWrap.innerHTML = `
                                    <div class="text-red-500 p-2 border border-red-500/50 bg-red-500/10 mb-2">Access Denied: Incorrect key or corrupted payload.</div>
                                    <div class="text-zinc-500 text-[10px] uppercase">If this was a large file encrypted via old drag-and-drop, it may be corrupted due to RAM limits. In the future, use stash_audio or stash_video.</div>`;
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
                                    } else {
                                        throw new Error("Not binary text");
                                    }
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
                }
            }

        } else if (command === 'export') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing password key</span>`;
            } else {
                const pwd = args.trim().toUpperCase();
                const id = pwd.split('-')[1];
                const data = await dbGet('TS64_STASH_' + id);
                if (!data) {
                    resWrap.innerHTML = `<span class="text-red-500">Export Failed: No stash found for key ${id}.</span>`;
                } else {
                    const blob = new Blob([data], { type: 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `backup_${id}.ts64`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    resWrap.innerHTML = `<div class="text-white font-bold mb-2">BACKUP EXPORTED: backup_${id}.ts64</div><div class="text-zinc-500 text-xs">Drag this file back into the site to restore.</div>`;
                }
            }

        } else if (command === 'purge') {
            const keys = await dbKeys();
            let wiped = 0;
            for (let key of keys) {
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

        } else {
            resWrap.innerHTML = `<span class="text-zinc-500">Command not found: <span class="text-white">${command}</span>. Type <span class="text-white">help</span> for commands.</span>`;
        }

        if (command !== 'clear') {
            if (!resWrap.parentNode) outputContainer.appendChild(resWrap);
        }

        inputEl.value = '';
        setTimeout(() => mainEl.scrollTo({ top: mainEl.scrollHeight }), 10);
    });

    // ---- Terminal drag-and-drop ----
    window._terminalDragHandler && window.removeEventListener('drop', window._terminalDragHandler);
    window._terminalDragHandler = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.activeTab !== 'terminal') return;
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;

        const lowerName = file.name.toLowerCase();
        const isBackup = lowerName.endsWith('.ts64') || lowerName.endsWith('.ts64vid');
        const isAudio = file.type.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.flac', '.aac'].some(x => lowerName.endsWith(x));
        const isVideo = file.type.startsWith('video/') || ['.mp4', '.webm', '.mkv', '.mov', '.avi'].some(x => lowerName.endsWith(x));

        const wrp = document.createElement('div');
        wrp.className = 'mt-2 mb-4 border-l border-white/20 pl-4 py-2 text-sm';
        wrp.id = 'drop-result-' + Date.now();
        outputContainer.appendChild(wrp);

        if (isBackup) {
            const id = file.name.split('_')[1]?.split('.')[0];
            if (!id) { wrp.innerHTML = `<span class="text-red-500">Malformed backup filename.</span>`; return; }
            const buf = await file.arrayBuffer();
            await dbSet('TS64_STASH_' + id, new Uint8Array(buf));
            wrp.innerHTML = `<div class="font-bold text-white mb-2">BACKUP RESTORED</div><div class="text-zinc-500">Key: ${id}</div>`;
        } else if (isAudio) {
            wrp.innerHTML = `
                <div class="p-3 border border-white/20 bg-black/40">
                    <div class="text-white font-bold tracking-widest text-xs mb-3 uppercase">ENCRYPTING AUDIO — ${(file.size / (1024 * 1024)).toFixed(1)} MB</div>
                    <div class="w-full bg-white/10 h-1 mb-2 overflow-hidden">
                        <div id="enc-progress-bar" class="bg-white h-1 transition-all duration-300" style="width:0%"></div>
                    </div>
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
                    updateProgress((bytesProcessed / file.size) * 100, '');
                }
                await dbSet('TS64_STASH_' + id, { type: 'audio', mime: file.type || 'audio/mpeg', name: file.name, chunkCount: chunkIndex, totalSize: file.size, v: 2 });
                await incrementStat('audio');
                wrp.innerHTML = `
                    <div class="font-bold text-white mb-2 tracking-wider border-b border-white/10 pb-2">AUDIO STASH SECURED</div>
                    <div class="text-zinc-500 mb-1">File: <span class="text-white">${file.name}</span></div>
                    ${keyCardHTML(pwd)}`;
                renderSidebar();
            } catch (err) { wrp.innerHTML = `<span class="text-red-500">Fault: ${err.message}</span>`; }
        } else if (isVideo) {
            wrp.innerHTML = `
                <div class="p-3 border border-white/20 bg-black/40">
                    <div class="text-white font-bold tracking-widest text-xs mb-3 uppercase">ENCRYPTING VIDEO — ${(file.size / (1024 * 1024)).toFixed(1)} MB</div>
                    <div class="w-full bg-white/10 h-1 mb-2 overflow-hidden">
                        <div id="enc-progress-bar" class="bg-white h-1 transition-all duration-300" style="width:0%"></div>
                    </div>
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

                const blobParts = [hdr];
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
                    blobParts.push(env);
                    offset += CHUNK_SIZE; bytesProcessed += ab.byteLength; chunkIndex++;
                    updateProgress((bytesProcessed / file.size) * 100, '');
                }
                const blob = new Blob(blobParts, { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `classified_footage_${id}.ts64vid`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 60000);

                await incrementStat('video');
                wrp.innerHTML = `
                    <div class="font-bold text-white mb-2 tracking-wider border-b border-white/10 pb-2">VIDEO STASH EXPORTED</div>
                    <div class="text-zinc-500 mb-1">Output: <span class="text-white">classified_footage_${id}.ts64vid</span></div>
                    ${keyCardHTML(pwd)}`;
                renderSidebar();
            } catch (err) { wrp.innerHTML = `<span class="text-red-500">Fault: ${err.message}</span>`; }
        } else {
            wrp.innerHTML = `<span class="text-red-500">Unsupported file type: ${file.name}</span>`;
        }
        mainEl.scrollTop = mainEl.scrollHeight;
    };
    window.addEventListener('drop', window._terminalDragHandler);
    window.addEventListener('dragover', e => e.preventDefault());
}

// ============================================================
// BOOT
// ============================================================
switchTab('terminal');

// Update sidebar label from CPU to VAULT MEMORY
setTimeout(() => {
    const labelEl = document.querySelector('#main-content')?.closest('body')?.querySelector('[id="global-cpu"]')?.closest('.h-28')?.querySelector('span:first-child');
    const sidebarFooter = document.querySelector('.h-28');
    if (sidebarFooter) {
        const label = sidebarFooter.querySelector('span');
        if (label) label.textContent = 'VAULT MEMORY';
    }
}, 100);