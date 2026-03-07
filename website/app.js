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
// DIARY STATE (in-memory, pre-encryption)
// ============================================================
const diaryState = {
    name: '',
    author: '',
    createdAt: null,
    entries: {},       // { "YYYY-MM-DD": { text: "", stashed: false, checksum: "" } }
    currentDate: null,
    password: null,        // The TS64-XXXX-XXXX password bound to this diary (in-memory only)
    passwordHash: null,    // SHA-256 hex hash of the password (stored inside encrypted payload)
};

function resetDiaryState() {
    diaryState.name = '';
    diaryState.author = '';
    diaryState.createdAt = null;
    diaryState.entries = {};
    diaryState.currentDate = null;
    diaryState.password = null;
    diaryState.passwordHash = null;
}

function getTodayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "2026-03-03" -> "2026-MAR-03"  (matches NODE_HISTORY.LOG format)
function toLogDate(isoDate) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const [y, m, d] = isoDate.split('-');
    return `${y}-${months[parseInt(m, 10) - 1]}-${d}`;
}

// "2026-03-03" -> "Tuesday, 03 March 2026"
function formatDisplayDate(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

// ============================================================
// PASSWORD HASH UTILITY (for diary password verification)
// ============================================================
async function hashPassword(password) {
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(password));
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isValidTS64Password(pwd) {
    return /^TS64-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pwd);
}

// ============================================================
// DIARY PASSWORD SETUP MODAL
// ============================================================
window.showDiaryPasswordSetup = function (callback) {
    // Remove if already exists
    const existing = document.getElementById('diary-password-setup-modal');
    if (existing) existing.remove();

    const suggestedPwd = generatePassword();

    const modal = document.createElement('div');
    modal.id = 'diary-password-setup-modal';
    modal.className = 'fixed inset-0 z-[120] bg-black/90 flex items-center justify-center';
    // Do NOT allow clicking outside to close — password must be set
    modal.innerHTML = `
        <div class="bg-[#030303] border border-white w-full max-w-md mx-4"
             style="font-family:'JetBrains Mono',monospace;">

            <!-- Header -->
            <div class="flex items-center justify-between border-b border-white px-5 py-4">
                <div>
                    <div class="text-white font-bold text-xs tracking-widest uppercase">SET DIARY PASSWORD</div>
                    <div class="text-zinc-600 text-[10px] tracking-widest mt-0.5">
                        This password will be permanent for this diary
                    </div>
                </div>
                <div class="text-[10px] text-zinc-600 border border-white/20 px-2 py-1">AES-GCM-256</div>
            </div>

            <!-- Body -->
            <div class="px-5 py-5 space-y-5">

                <!-- Warning -->
                <div class="border border-yellow-500/40 bg-yellow-500/5 p-3 text-[10px] text-yellow-400 leading-relaxed">
                    <span class="font-bold uppercase tracking-widest">⚠ IMPORTANT:</span>
                    This password <span class="text-white font-bold">cannot be changed</span> after creation.
                    It will be used every time you encrypt or decrypt this diary. Store it safely.
                </div>

                <!-- Tab Buttons -->
                <div class="flex border border-white/20">
                    <button id="pwd-tab-custom" onclick="switchPwdTab('custom')"
                        class="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest
                               bg-white text-black transition-colors">
                        SET YOUR OWN
                    </button>
                    <button id="pwd-tab-auto" onclick="switchPwdTab('auto')"
                        class="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest
                               text-zinc-500 hover:text-white transition-colors">
                        AUTO-GENERATE
                    </button>
                </div>

                <!-- Custom Password Panel -->
                <div id="pwd-panel-custom">
                    <label class="text-[10px] text-zinc-500 uppercase tracking-widest block mb-2 font-bold">
                        Enter Password (format: TS64-XXXX-XXXX)
                    </label>
                    <input type="text" id="pwd-custom-input"
                           placeholder="TS64-XXXX-XXXX"
                           maxlength="14"
                           class="w-full bg-black border border-white/30 focus:border-white text-white
                                  px-3 py-2.5 text-sm font-mono uppercase tracking-widest outline-none
                                  transition-colors mb-3"
                           oninput="this.value=this.value.toUpperCase()" />

                    <label class="text-[10px] text-zinc-500 uppercase tracking-widest block mb-2 font-bold">
                        Confirm Password
                    </label>
                    <input type="text" id="pwd-custom-confirm"
                           placeholder="TS64-XXXX-XXXX"
                           maxlength="14"
                           class="w-full bg-black border border-white/30 focus:border-white text-white
                                  px-3 py-2.5 text-sm font-mono uppercase tracking-widest outline-none
                                  transition-colors"
                           oninput="this.value=this.value.toUpperCase()" />

                    <div id="pwd-custom-error" class="text-red-500 text-[10px] mt-2 hidden"></div>
                </div>

                <!-- Auto-Generate Panel (hidden by default) -->
                <div id="pwd-panel-auto" class="hidden">
                    <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 font-bold">
                        Your Generated Password
                    </div>
                    <div class="border border-white p-4 text-center bg-black/60 cursor-pointer group relative"
                         onclick="navigator.clipboard.writeText('${suggestedPwd}');
                                  this.querySelector('.cp').textContent='COPIED!';
                                  setTimeout(()=>this.querySelector('.cp').textContent='CLICK TO COPY',2000);">
                        <div class="text-white font-bold text-lg tracking-[0.3em] font-mono">${suggestedPwd}</div>
                        <div class="cp text-[9px] text-zinc-600 mt-2 tracking-widest group-hover:text-zinc-400
                                    transition-colors">CLICK TO COPY</div>
                    </div>
                    <div class="text-[10px] text-zinc-600 mt-3 leading-relaxed">
                        Save this password somewhere safe. You will need it every time you open this diary.
                    </div>
                </div>

                <!-- Confirm Button -->
                <button id="pwd-confirm-btn"
                    class="w-full bg-white text-black font-bold py-3 text-xs uppercase tracking-widest
                           hover:bg-zinc-200 active:scale-[0.98] transition-all"
                    onclick="confirmDiaryPassword()">
                    CONFIRM PASSWORD & CREATE DIARY
                </button>

            </div>
        </div>`;

    document.body.appendChild(modal);

    // Store callback globally for the confirm handler
    window._diaryPasswordCallback = callback;
    window._diaryAutoPassword = suggestedPwd;

    setTimeout(() => document.getElementById('pwd-custom-input')?.focus(), 100);
};

// Tab switcher for the password modal
window.switchPwdTab = function (tab) {
    const customTab = document.getElementById('pwd-tab-custom');
    const autoTab = document.getElementById('pwd-tab-auto');
    const customPanel = document.getElementById('pwd-panel-custom');
    const autoPanel = document.getElementById('pwd-panel-auto');

    if (tab === 'custom') {
        customTab.className = customTab.className.replace('text-zinc-500 hover:text-white', 'bg-white text-black');
        customTab.classList.add('bg-white', 'text-black');
        autoTab.className = autoTab.className.replace('bg-white text-black', 'text-zinc-500 hover:text-white');
        autoTab.classList.remove('bg-white', 'text-black');
        autoTab.classList.add('text-zinc-500');
        customPanel.classList.remove('hidden');
        autoPanel.classList.add('hidden');
        setTimeout(() => document.getElementById('pwd-custom-input')?.focus(), 50);
    } else {
        autoTab.className = autoTab.className.replace('text-zinc-500 hover:text-white', 'bg-white text-black');
        autoTab.classList.add('bg-white', 'text-black');
        customTab.className = customTab.className.replace('bg-white text-black', 'text-zinc-500 hover:text-white');
        customTab.classList.remove('bg-white', 'text-black');
        customTab.classList.add('text-zinc-500');
        autoPanel.classList.remove('hidden');
        customPanel.classList.add('hidden');
    }
};

// Confirm password handler
window.confirmDiaryPassword = async function () {
    const customPanel = document.getElementById('pwd-panel-custom');
    const isCustom = !customPanel.classList.contains('hidden');
    const errorEl = document.getElementById('pwd-custom-error');
    let finalPassword = '';

    if (isCustom) {
        const input1 = document.getElementById('pwd-custom-input').value.trim().toUpperCase();
        const input2 = document.getElementById('pwd-custom-confirm').value.trim().toUpperCase();

        if (!input1) {
            if (errorEl) { errorEl.textContent = 'Password cannot be empty.'; errorEl.classList.remove('hidden'); }
            return;
        }
        if (!isValidTS64Password(input1)) {
            if (errorEl) { errorEl.textContent = 'Invalid format. Must be: TS64-XXXX-XXXX (X = A-Z or 0-9)'; errorEl.classList.remove('hidden'); }
            return;
        }
        if (input1 !== input2) {
            if (errorEl) { errorEl.textContent = 'Passwords do not match.'; errorEl.classList.remove('hidden'); }
            return;
        }
        finalPassword = input1;
    } else {
        finalPassword = window._diaryAutoPassword;
    }

    // Close modal
    const modal = document.getElementById('diary-password-setup-modal');
    if (modal) modal.remove();

    // Call the callback with the chosen password
    if (window._diaryPasswordCallback) {
        await window._diaryPasswordCallback(finalPassword);
        window._diaryPasswordCallback = null;
        window._diaryAutoPassword = null;
    }
};

// ============================================================
// CREATE NODE MODAL CONTROLS
// ============================================================
window.openCreateNodeModal = function () {
    document.getElementById('create-node-modal').classList.remove('hidden');
    document.getElementById('diary-config-form').classList.add('hidden');
    document.getElementById('diary-name-input').value = '';
    document.getElementById('diary-author-input').value = '';
};

window.closeCreateNodeModal = function () {
    document.getElementById('create-node-modal').classList.add('hidden');
};

window.selectNodeType = function (type) {
    if (type === 'diary') {
        document.getElementById('diary-config-form').classList.remove('hidden');
        document.getElementById('diary-name-input').focus();
    }
};

window.launchDiaryEditor = function () {
    const name = document.getElementById('diary-name-input').value.trim();
    if (!name) {
        const inp = document.getElementById('diary-name-input');
        inp.style.borderColor = '#ef4444';
        setTimeout(() => inp.style.borderColor = '', 1500);
        return;
    }

    if (diaryState.name && Object.keys(diaryState.entries).some(k => !diaryState.entries[k].stashed)) {
        if (!confirm(`An unencrypted node draft '${diaryState.name}' exists. Overwrite it?`)) {
            closeCreateNodeModal();
            switchTab('diary');
            return;
        }
    }

    const author = document.getElementById('diary-author-input').value.trim() || 'ROOT_ADMIN';
    closeCreateNodeModal();

    // Show password setup modal BEFORE creating the diary
    showDiaryPasswordSetup(async function (chosenPassword) {
        const pwdHash = await hashPassword(chosenPassword);

        resetDiaryState();
        diaryState.name = name;
        diaryState.author = author;
        diaryState.createdAt = new Date().toISOString();
        diaryState.currentDate = getTodayISO();
        diaryState.entries[diaryState.currentDate] = { text: '', stashed: false, checksum: '' };
        diaryState.password = chosenPassword;
        diaryState.passwordHash = pwdHash;

        // Note: password is NOT saved in localStorage draft (security)
        const draftCopy = { ...diaryState };
        delete draftCopy.password;
        localStorage.setItem('ts64_diary_draft', JSON.stringify(draftCopy));

        switchTab('diary');
    });
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
        return s || { text: 0, audio: 0, video: 0, diary: 0 };
    } catch { return { text: 0, audio: 0, video: 0, diary: 0 }; }
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
        diaryCount: stats.diary || 0,
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
        { icon: 'folder', label: '/diary_vault', count: summary.diaryCount, tab: 'diary' },
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
        case 'diary': renderDiaryTab(); break;
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
// DIARY EDITOR TAB  (NODE_HISTORY.LOG stitch UI)
// ============================================================
function renderDiaryTab() {
    if (!diaryState.name) {
        mainContent.innerHTML = `
        <div class="p-8 pb-32 overflow-auto h-full font-mono">
            <div class="flex items-center text-xs text-zinc-500 mb-6 font-bold tracking-widest uppercase">
                <span>root</span>
                <span class="mx-2 text-zinc-700">/</span>
                <span class="text-white">root/nodes/diary_vault</span>
                <div class="ml-auto w-3 h-5 bg-black border border-white"></div>
            </div>

            <div class="text-center py-10">
                <div class="text-4xl mb-4">📓</div>
                <div class="text-zinc-500 text-sm tracking-widest mb-3">No diary node active.</div>
                <button onclick="openCreateNodeModal()"
                    class="bg-white text-black font-bold px-8 py-3 text-xs uppercase tracking-widest
                           hover:bg-zinc-200 active:scale-95 transition-all duration-150">
                    + ADD NODE
                </button>
                <div class="text-zinc-600 text-[10px] mt-4">or unlock an existing encrypted diary below</div>
            </div>

            <!-- Restore Zone -->
            <div class="border border-white/20 p-5 mb-6">
                <div class="text-[10px] font-bold tracking-widest text-white uppercase mb-3">UNLOCK ENCRYPTED DIARY</div>
                <div class="text-zinc-500 text-xs mb-4">
                    Drop a <code class="text-white">.ts64diary</code> backup file below and enter your access key to decrypt and view your diary entries.
                </div>

                <!-- Drop Zone -->
                <div id="diary-restore-drop-zone"
                     class="border border-dashed border-white/20 bg-black/40 p-8 text-center transition-all duration-200 cursor-pointer mb-4"
                     ondragover="event.preventDefault(); this.classList.add('border-white', 'bg-white/5');"
                     ondragleave="this.classList.remove('border-white', 'bg-white/5');"
                     ondrop="event.preventDefault(); this.classList.remove('border-white','bg-white/5'); handleDiaryRestoreDrop(event);">
                    <div class="text-2xl text-white/20 mb-3">📓</div>
                    <div class="text-white font-bold tracking-widest text-xs mb-2">DROP .ts64diary FILE HERE</div>
                    <div class="text-zinc-600 text-xs mb-4">— or —</div>
                    <button onclick="document.getElementById('diary-restore-file-input').click()"
                        class="bg-white text-black font-bold px-6 py-2 text-xs uppercase tracking-widest hover:bg-zinc-300 transition-colors">
                        SELECT FILE
                    </button>
                    <input type="file" id="diary-restore-file-input" accept=".ts64diary,.ts64" class="hidden"
                        onchange="handleDiaryRestoreInputChange(event)" />
                </div>

                <!-- Access Key Input -->
                <div id="diary-restore-key-section" class="hidden">
                    <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-bold">File loaded. Enter Access Key:</div>
                    <div class="flex gap-2">
                        <input type="text" id="diary-restore-key-input"
                               placeholder="TS64-XXXX-XXXX"
                               class="flex-1 bg-black border border-white/30 text-white px-3 py-2.5 text-xs font-mono
                                      uppercase tracking-widest outline-none focus:border-white transition-colors"
                               onkeydown="if(event.key==='Enter') unlockDiaryFromTab()" />
                        <button onclick="unlockDiaryFromTab()"
                                class="bg-white text-black font-bold px-6 py-2.5 text-[10px] uppercase tracking-widest
                                       hover:bg-zinc-200 transition-colors shrink-0">
                            UNLOCK
                        </button>
                    </div>
                    <div class="text-zinc-600 text-[10px] mt-2" id="diary-restore-file-info"></div>
                </div>

                <!-- Result -->
                <div id="diary-restore-result" class="mt-3"></div>
            </div>

            <!-- How It Works -->
            <div class="border border-white/10 p-5 text-xs text-zinc-500 space-y-2">
                <div class="text-white font-bold tracking-widest text-[10px] uppercase mb-3">HOW IT WORKS</div>
                <div><span class="text-white">1.</span> Click <span class="text-white font-bold">+ ADD NODE</span> to create a new diary node</div>
                <div><span class="text-white">2.</span> Write entries across different dates — everything is timestamped</div>
                <div><span class="text-white">3.</span> Click <span class="text-white font-bold">STASH DIARY NODE</span> to encrypt with AES-GCM 256-bit</div>
                <div><span class="text-white">4.</span> A <code class="text-white">.ts64diary</code> backup file is auto-downloaded</div>
                <div><span class="text-white">5.</span> To restore: drop the backup file above, enter your access key, and unlock</div>
                <div><span class="text-white">6.</span> Click <span class="text-white font-bold">OPEN IN EDITOR</span> to edit the decrypted diary and re-encrypt</div>
            </div>
        </div>`;
        rightSidebar.innerHTML = `
            <div class="h-12 border-b border-white flex items-center justify-between px-4 bg-[#030303]">
                <span class="text-xs font-bold tracking-widest text-white uppercase">Diary Vault</span>
                <span class="material-symbols-outlined text-sm text-zinc-500">lock</span>
            </div>
            <div class="flex-1 p-6 text-xs text-zinc-600 font-mono">
                <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 font-bold">STATUS</div>
                <div class="space-y-2">
                    <div>Active Diary: <span class="text-red-400">NONE</span></div>
                    <div>Entries: <span class="text-white">0</span></div>
                    <div class="border-t border-white/10 pt-2 mt-3 text-zinc-600 text-[10px]">
                        Drop a .ts64diary file or create a new diary to begin.
                    </div>
                </div>
            </div>`;
        return;
    }

    const sortedDates = Object.keys(diaryState.entries).sort();

    // ── Center: date rows ──────────────────────────────────────
    const rowsHtml = sortedDates.map(d => {
        const entry = diaryState.entries[d];
        const logDate = toLogDate(d);
        const isSelected = d === diaryState.currentDate;
        const isStashed = entry.stashed;

        if (isStashed) {
            const shortCheck = entry.checksum ? entry.checksum.substring(0, 8).toUpperCase() + '...' : 'N/A';
            const sizeKb = Math.ceil((entry.text.length * 2) / 1024) || 1;
            return `
            <div class="bg-white text-black px-3 py-1.5 -mx-3 flex items-center font-mono text-sm cursor-pointer"
                 onclick="switchDiaryDate('${d}')">
                <span class="mr-2 font-bold">&gt;</span>
                <span class="font-bold">[${logDate}] [STASHED] &gt; Metadata: ${sizeKb}KB, Encrypted, Checksum: ${shortCheck}</span>
                <span class="ml-auto">&lt;</span>
            </div>`;
        }

        if (isSelected) {
            return `
            <div class="border-l-2 border-white pl-3 py-2 -ml-3 font-mono mt-1 mb-1">
                <div class="flex items-center justify-between text-white text-sm font-bold mb-2 cursor-pointer"
                     onclick="switchDiaryDate('${d}')">
                    <span>&gt; [${logDate}]</span>
                    <span class="text-[10px] text-zinc-500 font-normal">${formatDisplayDate(d)}</span>
                </div>
                <textarea id="diary-editor"
                    class="w-full bg-black border border-white/20 text-zinc-200 p-3 font-mono text-xs leading-relaxed resize-none outline-none focus:border-white transition-colors"
                    rows="8"
                    placeholder="Write entry for ${logDate}..."
                    spellcheck="true">${entry.text}</textarea>
                <div class="flex gap-2 mt-2 flex-wrap">
                    <button onclick="saveDiaryEntry()" id="diary-save-btn"
                            class="bg-white text-black font-bold px-4 py-1.5 text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-colors">
                        SAVE ENTRY
                    </button>
                    <button onclick="addDiaryEntry()"
                            class="border border-white/30 text-white font-bold px-4 py-1.5 text-[10px] uppercase tracking-widest hover:border-white transition-colors">
                        + NEW DATE
                    </button>
                    <button onclick="deleteDiaryEntry('${d}')"
                            class="border border-red-500/40 text-red-400 font-bold px-4 py-1.5 text-[10px] uppercase tracking-widest hover:border-red-500 hover:bg-red-500/10 transition-colors ml-auto">
                        DELETE ENTRY
                    </button>
                </div>
            </div>`;
        }

        return `
        <div class="text-zinc-500 hover:text-white text-sm font-mono py-1 cursor-pointer transition-colors block"
             onclick="switchDiaryDate('${d}')">[${logDate}]</div>`;
    }).join('');

    mainContent.innerHTML = `
    <div class="p-8 pb-32 overflow-auto h-full font-mono relative">
        <!-- Breadcrumb -->
        <div class="flex items-center text-xs text-zinc-500 mb-6 font-bold tracking-widest uppercase">
            <span>root</span>
            <span class="mx-2 text-zinc-700">/</span>
            <span class="text-white">root/nodes/diary_vault</span>
            <div class="ml-auto w-3 h-5 bg-black border border-white"></div>
        </div>

        <h1 class="text-xl font-bold mb-6 tracking-wide text-white">
            NODE_HISTORY.LOG | ${diaryState.name}
        </h1>

        <!-- Corner-bracket bordered container -->
        <div class="border border-white p-2 relative min-h-[300px]">
            <div class="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-white"></div>
            <div class="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-white"></div>
            <div class="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-white"></div>
            <div class="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-white"></div>

            <div class="p-4 space-y-1">
                ${rowsHtml || '<div class="text-zinc-600 text-xs">No entries yet. Click + NEW DATE to begin.</div>'}
            </div>
        </div>

        <!-- Terminal caret -->
        <div class="mt-6 flex items-center font-mono text-sm text-zinc-500 mb-6">
            <span class="mr-2">tetrascript64@system:~$</span>
            <span class="w-2.5 h-5 bg-white animate-pulse block"></span>
        </div>

        <!-- Unlock Another Diary -->
        <div class="border border-white/10 p-4 mt-4">
            <div class="flex items-center justify-between mb-3">
                <div class="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">UNLOCK ANOTHER DIARY</div>
            </div>
            <div class="flex gap-2 items-center">
                <button onclick="document.getElementById('diary-inline-restore-input').click()"
                    class="border border-white/20 text-white font-bold px-4 py-2 text-[10px] uppercase tracking-widest
                           hover:border-white hover:bg-white/5 transition-colors">
                    SELECT .ts64diary FILE
                </button>
                <input type="file" id="diary-inline-restore-input" accept=".ts64diary,.ts64" class="hidden"
                    onchange="handleInlineDiaryRestore(event)" />
                <span class="text-zinc-600 text-[10px]">or drop a file onto the Diary tab when no diary is active</span>
            </div>
            <div id="diary-inline-restore-result" class="mt-2"></div>
        </div>
    </div>`;

    // Wire textarea to state
    const editor = document.getElementById('diary-editor');
    if (editor) {
        editor.addEventListener('input', () => {
            diaryState.entries[diaryState.currentDate].text = editor.value;
            localStorage.setItem('ts64_diary_draft', JSON.stringify(diaryState));
        });
        editor.focus();
    }

    // ── Right sidebar: TEMPORAL TOPOLOGY ──────────────────────
    const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const byMonth = {};
    sortedDates.forEach(d => {
        const [y, m] = d.split('-');
        const key = `${y}-${MONTHS[parseInt(m, 10) - 1]}`;
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(d);
    });

    const timelineHtml = Object.entries(byMonth).map(([monthKey, dates]) => {
        const [, mon] = monthKey.split('-');
        const daysHtml = dates.map(d => {
            const entry = diaryState.entries[d];
            const dayNum = d.split('-')[2];
            const isStashed = entry.stashed;
            const isSelected = d === diaryState.currentDate;
            const nodeId = `NODE_${d.replace(/-/g, '')}`;

            if (isStashed) {
                return `
                <div class="flex items-center relative my-1.5 cursor-pointer" onclick="switchDiaryDate('${d}')">
                    <div class="absolute -left-[9px] w-2 h-2 ${isSelected ? 'bg-white' : 'bg-black'} border border-white z-10"></div>
                    <div class="ml-4 ${isSelected ? 'bg-white text-black' : 'bg-black text-white'} border border-white text-[10px] px-2 py-0.5 whitespace-nowrap z-20 font-bold tracking-wider">
                        ${nodeId}: STABLE
                    </div>
                    <div class="absolute left-0 w-4 h-px bg-white"></div>
                </div>`;
            }

            if (isSelected) {
                return `
                <div class="flex items-center relative my-1 cursor-pointer" onclick="switchDiaryDate('${d}')">
                    <div class="absolute -left-[9px] w-2 h-2 bg-white border border-white z-10"></div>
                    <span class="w-2 h-px bg-white -ml-4 mr-2 block"></span>
                    <span class="text-white font-bold text-[10px] block">${dayNum}</span>
                </div>`;
            }

            return `
            <div class="flex items-center cursor-pointer hover:text-white transition-colors" onclick="switchDiaryDate('${d}')">
                <span class="w-2 h-px bg-zinc-700 -ml-4 mr-2 block"></span>
                <span class="text-[10px] block">${dayNum}</span>
            </div>`;
        }).join('');

        return `
        <div class="relative mb-8">
            <span class="absolute -left-2 text-zinc-500 font-bold text-[10px] uppercase">${mon}</span>
            <div class="ml-10 pl-4 space-y-1 text-zinc-500">${daysHtml}</div>
        </div>`;
    }).join('');

    rightSidebar.innerHTML = `
        <div class="h-12 border-b border-white flex items-center justify-between px-4 bg-[#030303]">
            <span class="text-xs font-bold tracking-widest text-white uppercase">Temporal Topology</span>
            <span class="material-symbols-outlined text-sm text-zinc-500">radio_button_checked</span>
        </div>
        <div class="flex-1 p-6 overflow-y-auto relative font-mono text-xs"
             style="background-image:radial-gradient(#222 1px,transparent 1px);background-size:20px 20px;">
            <div class="absolute left-10 top-0 bottom-0 w-px bg-zinc-800"></div>
            ${timelineHtml || '<div class="text-zinc-600 ml-10 mt-4 text-[10px] uppercase tracking-widest">No entries yet.</div>'}
        </div>
        <div class="border-t border-white p-4 space-y-3 bg-[#030303] shrink-0">
            <div class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">ENCRYPT VAULT</div>
            ${diaryState.password
            ? `<div class="border border-green-500/30 bg-green-500/5 p-2 text-[10px] text-green-400 leading-relaxed">
                       <span class="font-bold">✓ PASSWORD LOCKED</span> — Re-encryption will use your existing password.
                   </div>
                   <div class="border border-white/20 p-2 text-center">
                       <div class="text-[9px] text-zinc-600 tracking-widest mb-1">CURRENT PASSWORD</div>
                       <div class="text-white font-bold font-mono text-xs tracking-widest cursor-pointer"
                            onclick="navigator.clipboard.writeText('${diaryState.password}');
                                     this.textContent='COPIED!';
                                     var self=this; setTimeout(function(){self.textContent='${diaryState.password}'},1500);">
                           ${diaryState.password}
                       </div>
                   </div>`
            : `<div class="text-zinc-600 text-[10px] leading-relaxed">
                       Encrypt the entire diary node with AES-GCM 256-bit. You will be asked to set a password.
                   </div>`
        }
            <button onclick="encryptDiary()"
                    class="w-full bg-white text-black font-bold py-2.5 text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-colors">
                STASH DIARY NODE
            </button>
            <div id="diary-encrypt-result" class="mt-1"></div>
        </div>`;
}

// Switch to a different date
window.switchDiaryDate = function (dateStr) {
    const editor = document.getElementById('diary-editor');
    if (editor && diaryState.entries[diaryState.currentDate]) {
        diaryState.entries[diaryState.currentDate].text = editor.value;
    }
    diaryState.currentDate = dateStr;
    localStorage.setItem('ts64_diary_draft', JSON.stringify(diaryState));
    renderDiaryTab();
};

// Delete a diary entry by date
window.deleteDiaryEntry = function (dateStr) {
    const entryCount = Object.keys(diaryState.entries).length;
    if (entryCount <= 1) {
        alert('Cannot delete the last entry. Use ENCRYPT or create a new diary instead.');
        return;
    }

    const logDate = toLogDate(dateStr);
    if (!confirm(`Delete entry [${logDate}]? This cannot be undone.`)) return;

    delete diaryState.entries[dateStr];

    // If we just deleted the currently selected date, switch to the most recent remaining date
    if (diaryState.currentDate === dateStr) {
        const remainingDates = Object.keys(diaryState.entries).sort();
        diaryState.currentDate = remainingDates[remainingDates.length - 1] || null;
    }

    localStorage.setItem('ts64_diary_draft', JSON.stringify(diaryState));
    renderDiaryTab();
};

// Add a new dated entry
window.addDiaryEntry = function () {
    // Use a styled inline modal instead of browser prompt
    const existingModal = document.getElementById('diary-date-picker-modal');
    if (existingModal) existingModal.remove();

    const today = getTodayISO();
    const modal = document.createElement('div');
    modal.id = 'diary-date-picker-modal';
    modal.className = 'fixed inset-0 z-[110] bg-black/80 flex items-center justify-center';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="bg-[#030303] border border-white w-full max-w-sm mx-4 font-mono">
            <div class="flex items-center justify-between border-b border-white px-4 py-3">
                <div>
                    <div class="text-white font-bold tracking-widest text-xs uppercase">NEW ENTRY NODE</div>
                    <div class="text-zinc-600 text-[10px] tracking-widest mt-0.5">/ diary_vault / add_entry</div>
                </div>
                <button onclick="this.closest('#diary-date-picker-modal').remove()"
                        class="text-zinc-600 hover:text-white font-bold text-sm">✕</button>
            </div>
            <div class="p-4 space-y-4">
                <div>
                    <label class="text-[10px] text-zinc-500 uppercase tracking-widest block mb-2 font-bold">
                        Select Date
                    </label>
                    <input type="date" id="diary-new-date-input" value="${today}"
                           class="w-full bg-black border border-white/30 focus:border-white text-white
                                  px-3 py-2.5 text-xs font-mono outline-none transition-colors" />
                </div>
                <div class="flex gap-2">
                    <button onclick="(function(){
                        var d=document.getElementById('diary-new-date-input').value;
                        if(!d||!/^\\d{4}-\\d{2}-\\d{2}$/.test(d))return;
                        if(diaryState.entries[d]){
                            diaryState.currentDate=d;
                        } else {
                            diaryState.entries[d]={text:'',stashed:false,checksum:''};
                            diaryState.currentDate=d;
                        }
                        localStorage.setItem('ts64_diary_draft',JSON.stringify(diaryState));
                        document.getElementById('diary-date-picker-modal').remove();
                        renderDiaryTab();
                    })()"
                    class="flex-1 bg-white text-black font-bold py-2.5 text-[10px] uppercase tracking-widest
                           hover:bg-zinc-200 transition-colors">
                        CREATE ENTRY
                    </button>
                    <button onclick="(function(){
                        var d=getTodayISO();
                        if(!diaryState.entries[d])
                            diaryState.entries[d]={text:'',stashed:false,checksum:''};
                        diaryState.currentDate=d;
                        localStorage.setItem('ts64_diary_draft',JSON.stringify(diaryState));
                        document.getElementById('diary-date-picker-modal').remove();
                        renderDiaryTab();
                    })()"
                    class="border border-white/30 text-white font-bold px-4 py-2.5 text-[10px] uppercase
                           tracking-widest hover:border-white transition-colors">
                        TODAY
                    </button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('diary-new-date-input')?.focus(), 50);
};

// Save current entry
window.saveDiaryEntry = function () {
    const editor = document.getElementById('diary-editor');
    if (editor) diaryState.entries[diaryState.currentDate].text = editor.value;
    localStorage.setItem('ts64_diary_draft', JSON.stringify(diaryState));
    const btn = document.getElementById('diary-save-btn');
    if (btn) {
        const savedDate = toLogDate(diaryState.currentDate);
        btn.textContent = `SAVED [${savedDate}]`;
        btn.classList.add('bg-green-600', 'text-white');
        btn.classList.remove('bg-white', 'text-black');
        setTimeout(() => {
            btn.textContent = 'SAVE ENTRY';
            btn.classList.remove('bg-green-600', 'text-white');
            btn.classList.add('bg-white', 'text-black');
        }, 1500);
    }
};

// ============================================================
// DIARY RESTORE / UNLOCK FROM TAB
// ============================================================
let _pendingDiaryFile = null; // holds the selected/dropped .ts64diary file

window.handleDiaryRestoreDrop = function (e) {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    _loadDiaryFile(file);
};

window.handleDiaryRestoreInputChange = function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    _loadDiaryFile(file);
};

function _loadDiaryFile(file) {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.ts64diary') && !lowerName.endsWith('.ts64')) {
        const resultEl = document.getElementById('diary-restore-result');
        if (resultEl) resultEl.innerHTML = `<div class="text-red-500 text-xs p-2 border border-red-500/30">Error: Expected a .ts64diary file.</div>`;
        return;
    }
    _pendingDiaryFile = file;

    // Show the key section
    const keySection = document.getElementById('diary-restore-key-section');
    if (keySection) keySection.classList.remove('hidden');

    const fileInfo = document.getElementById('diary-restore-file-info');
    if (fileInfo) fileInfo.textContent = `File: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;

    // Update drop zone to show loaded state
    const dropZone = document.getElementById('diary-restore-drop-zone');
    if (dropZone) {
        dropZone.innerHTML = `
            <div class="text-2xl mb-2">✅</div>
            <div class="text-white font-bold tracking-widest text-xs">${file.name}</div>
            <div class="text-zinc-500 text-[10px] mt-1">${(file.size / 1024).toFixed(1)}KB loaded · Enter access key below</div>`;
    }

    // Clear any previous result
    const resultEl = document.getElementById('diary-restore-result');
    if (resultEl) resultEl.innerHTML = '';

    // Auto-focus the key input
    setTimeout(() => document.getElementById('diary-restore-key-input')?.focus(), 50);
}

// Inline restore from active diary view — resets state and opens unlock UI
window.handleInlineDiaryRestore = function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.ts64diary') && !lowerName.endsWith('.ts64')) {
        const resultEl = document.getElementById('diary-inline-restore-result');
        if (resultEl) resultEl.innerHTML = `<div class="text-red-500 text-xs p-2">Error: Expected a .ts64diary file.</div>`;
        return;
    }
    // Reset current diary state so we go to the empty/unlock view
    resetDiaryState();
    localStorage.removeItem('ts64_diary_draft');
    renderDiaryTab();
    // After re-render, load the file into the restore flow
    setTimeout(() => _loadDiaryFile(file), 100);
};

window.unlockDiaryFromTab = async function () {
    const resultEl = document.getElementById('diary-restore-result');
    if (!resultEl) return;

    if (!_pendingDiaryFile) {
        resultEl.innerHTML = `<div class="text-red-500 text-xs p-2">Error: No file loaded. Drop a .ts64diary file first.</div>`;
        return;
    }

    const keyInput = document.getElementById('diary-restore-key-input');
    const pwd = (keyInput?.value || '').trim().toUpperCase();
    if (!pwd || !/^TS64-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pwd)) {
        resultEl.innerHTML = `<div class="text-red-500 text-xs p-2 border border-red-500/30">Invalid key format. Expected: TS64-XXXX-XXXX</div>`;
        return;
    }

    resultEl.innerHTML = `<div class="text-zinc-500 animate-pulse text-xs tracking-widest uppercase p-3">Decrypting diary...</div>`;

    try {
        const buf = await _pendingDiaryFile.arrayBuffer();
        if (buf.byteLength < 28) throw new Error('File too small to be a valid backup');

        // Verify TS64 magic header
        const magic = new Uint8Array(buf.slice(0, 4));
        if (magic[0] !== 0x54 || magic[1] !== 0x53 || magic[2] !== 0x36 || magic[3] !== 0x34) {
            throw new Error('Invalid file — does not contain TS64 magic header');
        }

        // Extract salt from header and derive key
        const hdrArr = new Uint8Array(buf.slice(0, 28));
        const salt = hdrArr.slice(4, 20);
        const key = await deriveKey(pwd, salt);

        // Parse chunk envelopes starting at byte 28
        const decryptedParts = [];
        let offset = 28;
        let chunkIdx = 0;
        while (offset + 20 <= buf.byteLength) {
            const cv = new DataView(buf, offset, 20);
            const ctLen = cv.getUint32(16, true);
            const envelopeSize = 20 + ctLen;
            if (ctLen <= 0 || ctLen > 100 * 1024 * 1024 || offset + envelopeSize > buf.byteLength) break;

            const ev = new Uint8Array(buf.slice(offset, offset + envelopeSize));
            const iv = ev.slice(4, 16);
            const ciphertext = ev.slice(20, 20 + ctLen);

            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            decryptedParts.push(new Uint8Array(plain));
            offset += envelopeSize;
            chunkIdx++;
        }

        if (decryptedParts.length === 0) throw new Error('No chunks were decrypted — wrong key?');

        // Merge decrypted parts
        const totalLen = decryptedParts.reduce((s, p) => s + p.byteLength, 0);
        const merged = new Uint8Array(totalLen);
        let pos = 0;
        for (const part of decryptedParts) { merged.set(part, pos); pos += part.byteLength; }

        // Parse JSON diary
        const diaryStr = new TextDecoder('utf-8', { fatal: true }).decode(merged);
        const diaryObj = JSON.parse(diaryStr);

        // Build the interactive date-list view
        const sortedDates = Object.keys(diaryObj.entries).sort();
        const containerId = 'diary-tab-unlock-' + Date.now();

        const rowsHtml = sortedDates.map((d, idx) => {
            const logDate = toLogDate(d);
            const entry = diaryObj.entries[d];
            const text = (typeof entry === 'string' ? entry : entry.text) || '(empty entry)';
            const escapedText = text.replace(/</g, '&lt;');
            const hasContent = text.trim().length > 0 && text !== '(empty entry)';
            const sizeKb = Math.ceil((text.length * 2) / 1024) || 1;
            const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
            const rowId = `${containerId}-row-${idx}`;
            const textId = `${containerId}-text-${idx}`;

            return `
            <div id="${rowId}" class="group">
                <div class="flex items-center justify-between py-2 px-3 -mx-3 cursor-pointer transition-all duration-200
                            hover:bg-white/10 text-zinc-400 hover:text-white font-mono text-sm"
                     onclick="(function(){
                         var el=document.getElementById('${textId}');
                         var arrow=document.getElementById('${rowId}-arrow');
                         if(el.classList.contains('hidden')){
                             el.classList.remove('hidden');
                             arrow.textContent='▼';
                         } else {
                             el.classList.add('hidden');
                             arrow.textContent='▶';
                         }
                     })()">
                    <div class="flex items-center gap-2">
                        <span id="${rowId}-arrow" class="text-[10px] text-zinc-600 w-3">▶</span>
                        <span class="font-bold">[${logDate}]</span>
                        ${hasContent
                    ? `<span class="text-[10px] text-zinc-600 font-normal ml-2">${wordCount} words · ${sizeKb}KB</span>`
                    : `<span class="text-[10px] text-zinc-700 font-normal ml-2">empty</span>`
                }
                    </div>
                    <span class="text-[10px] text-zinc-700 group-hover:text-zinc-500 transition-colors">${formatDisplayDate(d)}</span>
                </div>
                <div id="${textId}" class="hidden border-l-2 border-white ml-1 pl-4 py-3 mb-2 transition-all">
                    <div class="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">${escapedText}</div>
                </div>
            </div>`;
        }).join('');

        // Store the decrypted diary object AND the password globally
        // so OPEN IN EDITOR can carry them forward
        window._lastDecryptedDiary = diaryObj;
        window._lastDecryptedDiaryPassword = pwd;

        resultEl.innerHTML = `
            <div class="border border-white p-4 relative font-mono mt-2 mb-4">
                <div class="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-white bg-black"></div>
                <div class="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-white bg-black"></div>
                <div class="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-white bg-black"></div>
                <div class="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-white bg-black"></div>

                <div class="flex items-center justify-between mb-4 border-b border-white/20 pb-3">
                    <div>
                        <h3 class="text-white font-bold tracking-widest uppercase text-base">📓 ${diaryObj.name || 'Diary'}</h3>
                        <div class="text-zinc-500 text-[10px] mt-1">
                            by <span class="text-white">${diaryObj.author || 'Unknown'}</span> ·
                            <span class="text-white">${sortedDates.length}</span> entries
                        </div>
                    </div>
                    <div class="text-[10px] text-zinc-600 border border-white/20 px-2 py-1 text-right shrink-0">
                        AES-GCM-256<br>DECRYPTED
                    </div>
                </div>

                <div class="text-[10px] text-zinc-600 uppercase tracking-widest mb-3 font-bold">
                    Click a date to expand entry ▼
                </div>
                <div class="space-y-0 divide-y divide-white/10">${rowsHtml}</div>

                <div class="mt-4 pt-3 border-t border-white/10 flex gap-3 flex-wrap">
                    <button onclick="(function(){
                        document.querySelectorAll('[id^=\\'${containerId}-text-\\']').forEach(function(el){el.classList.remove('hidden')});
                        document.querySelectorAll('[id$=\\'-arrow\\']').forEach(function(el){if(el.id.startsWith('${containerId}')){el.textContent='▼'}});
                    })()" class="text-[10px] text-zinc-500 hover:text-white border border-white/20 px-3 py-1 tracking-widest hover:border-white transition-colors">
                        EXPAND ALL
                    </button>
                    <button onclick="(function(){
                        document.querySelectorAll('[id^=\\'${containerId}-text-\\']').forEach(function(el){el.classList.add('hidden')});
                        document.querySelectorAll('[id$=\\'-arrow\\']').forEach(function(el){if(el.id.startsWith('${containerId}')){el.textContent='▶'}});
                    })()" class="text-[10px] text-zinc-500 hover:text-white border border-white/20 px-3 py-1 tracking-widest hover:border-white transition-colors">
                        COLLAPSE ALL
                    </button>
                    <button onclick="openDecryptedDiaryInEditor()"
                        class="ml-auto bg-white text-black font-bold px-5 py-1.5 text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-colors">
                        OPEN IN EDITOR
                    </button>
                </div>
            </div>`;

    } catch (err) {
        resultEl.innerHTML = `
            <div class="text-red-500 p-3 border border-red-500/30 bg-red-500/10 text-xs mb-2">
                Access Denied: ${err.message}
            </div>
            <div class="text-zinc-600 text-[10px] uppercase">
                Check your access key and ensure the file is a valid .ts64diary backup.
            </div>`;
    }
};

// Open the last decrypted diary in the editor
window.openDecryptedDiaryInEditor = function () {
    const diaryObj = window._lastDecryptedDiary;
    if (!diaryObj) {
        alert('No decrypted diary data found. Please unlock a diary first.');
        return;
    }

    // Populate diaryState
    diaryState.name = diaryObj.name || 'Restored Diary';
    diaryState.author = diaryObj.author || 'Unknown';
    diaryState.createdAt = diaryObj.createdAt || new Date().toISOString();
    diaryState.entries = {};

    const dates = Object.keys(diaryObj.entries).sort();
    dates.forEach(d => {
        const entry = diaryObj.entries[d];
        diaryState.entries[d] = {
            text: (typeof entry === 'string' ? entry : entry.text) || '',
            stashed: false,
            checksum: ''
        };
    });

    diaryState.currentDate = dates[dates.length - 1] || null;

    // ── CARRY FORWARD THE PASSWORD ──────────────────────────
    // The password used to decrypt is now the diary's permanent password
    diaryState.password = window._lastDecryptedDiaryPassword || null;
    diaryState.passwordHash = diaryObj.passwordHash || null;

    // Save draft (WITHOUT password — password stays in-memory only)
    const draftCopy = { ...diaryState };
    delete draftCopy.password;
    localStorage.setItem('ts64_diary_draft', JSON.stringify(draftCopy));

    window._lastDecryptedDiary = null;
    window._lastDecryptedDiaryPassword = null;
    _pendingDiaryFile = null;
    renderDiaryTab();
    renderSidebar();
};

// ============================================================
// DIARY ENCRYPTION
// ============================================================
window.encryptDiary = async function () {
    const resultEl = document.getElementById('diary-encrypt-result');
    if (!resultEl) return;

    // Flush editor
    const editor = document.getElementById('diary-editor');
    if (editor && diaryState.entries[diaryState.currentDate]) {
        diaryState.entries[diaryState.currentDate].text = editor.value;
    }

    const allText = Object.values(diaryState.entries).map(e => e.text).join(' ');
    const totalWords = allText.trim().split(/\s+/).filter(Boolean).length;
    if (totalWords === 0) {
        resultEl.innerHTML = `<span class="text-red-500 text-[10px]">Error: No content to encrypt.</span>`;
        return;
    }

    // ── PASSWORD RESOLUTION ──────────────────────────────────
    // If diary already has a password (set at creation or carried from unlock), use it.
    // If not (legacy draft from before password update), prompt user to set one.
    if (!diaryState.password) {
        showDiaryPasswordSetup(async function (chosenPassword) {
            diaryState.password = chosenPassword;
            diaryState.passwordHash = await hashPassword(chosenPassword);
            // Re-call encryptDiary now that password is set
            await window.encryptDiary();
        });
        return;
    }

    const pwd = diaryState.password; // ← USE THE PERSISTENT PASSWORD

    resultEl.innerHTML = `<div class="text-zinc-500 text-[10px] animate-pulse tracking-widest mt-2 uppercase">ENCRYPTING NODE...</div>`;

    try {
        const diaryPayload = {
            name: diaryState.name,
            author: diaryState.author,
            createdAt: diaryState.createdAt,
            encryptedAt: new Date().toISOString(),
            passwordHash: diaryState.passwordHash, // Store hash in payload for verification
            entries: diaryState.entries,
        };
        const diaryJSON = JSON.stringify(diaryPayload);
        const id = pwd.split('-')[1];
        const payloadBytes = new TextEncoder().encode(diaryJSON);

        // SHA-256 checksum for display in stashed rows
        const hashBuf = await crypto.subtle.digest('SHA-256', payloadBytes);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        const checksum = hashHex.substring(0, 8).toUpperCase();

        // Chunked AES-GCM encrypt into IndexedDB
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveKey(pwd, salt);

        const hdr = new Uint8Array(28);
        hdr.set([0x54, 0x53, 0x36, 0x34], 0);
        hdr.set(salt, 4);
        new DataView(hdr.buffer).setBigUint64(20, BigInt(payloadBytes.byteLength), true);
        await dbSet('TS64_DIARY_' + id + '_header', hdr);

        let offset = 0, chunkIndex = 0;
        const DIARY_CHUNK_SIZE = 1048576; // 1MB
        while (offset < payloadBytes.byteLength) {
            const chunk = payloadBytes.slice(offset, offset + DIARY_CHUNK_SIZE);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, chunk);
            const env = new Uint8Array(20 + ct.byteLength);
            const cv = new DataView(env.buffer);
            cv.setUint32(0, chunkIndex, true);
            env.set(iv, 4);
            cv.setUint32(16, ct.byteLength, true);
            env.set(new Uint8Array(ct), 20);
            await dbSet(`TS64_DIARY_${id}_chunk_${chunkIndex}`, env);
            offset += DIARY_CHUNK_SIZE;
            chunkIndex++;
        }

        // Write metadata record
        await dbSet('TS64_DIARY_' + id, {
            type: 'diary',
            name: diaryState.name,
            author: diaryState.author,
            entryCount: Object.keys(diaryState.entries).length,
            totalWords,
            chunkCount: chunkIndex,
            totalSize: payloadBytes.byteLength,
            checksum,
            createdAt: diaryState.createdAt,
            encryptedAt: new Date().toISOString(),
            v: 2
        });

        await incrementStat('diary');

        // Flip all entries to stashed state so rows re-render as white-on-black
        Object.keys(diaryState.entries).forEach(d => {
            diaryState.entries[d].stashed = true;
            diaryState.entries[d].checksum = checksum;
        });

        localStorage.removeItem('ts64_diary_draft');

        // ── Auto-download a .ts64diary backup file ──
        try {
            const headerRaw = await dbGet('TS64_DIARY_' + id + '_header');
            const dlParts = [headerRaw];
            for (let ci = 0; ci < chunkIndex; ci++) {
                const chunkRaw = await dbGet(`TS64_DIARY_${id}_chunk_${ci}`);
                dlParts.push(chunkRaw);
            }
            const backupBlob = new Blob(dlParts, { type: 'application/octet-stream' });
            const dlUrl = URL.createObjectURL(backupBlob);
            const dlA = document.createElement('a');
            dlA.href = dlUrl;
            dlA.download = `diary_node_${id}.ts64diary`;
            document.body.appendChild(dlA);
            dlA.click();
            document.body.removeChild(dlA);
            setTimeout(() => URL.revokeObjectURL(dlUrl), 60000);
        } catch (dlErr) { console.warn('Diary backup download failed:', dlErr); }

        renderDiaryTab();

        // Show key card — reminder of the SAME password
        const res2 = document.getElementById('diary-encrypt-result');
        if (res2) res2.innerHTML = `
            <div class="border border-white bg-[#020202] p-3 space-y-2 font-mono mt-2 text-left">
                <div class="text-white font-bold text-[10px] tracking-widest border-b border-white/20 pb-2 mb-2">NODE STASHED & EXPORTED</div>
                <div class="text-zinc-500 text-[10px]">Entries: <span class="text-white font-bold">${Object.keys(diaryState.entries).length}</span></div>
                <div class="text-zinc-500 text-[10px]">Checksum: <span class="text-white font-bold">${checksum}...</span></div>
                <div class="text-zinc-500 text-[10px]">Backup: <span class="text-white font-bold">diary_node_${id}.ts64diary</span> (auto-downloaded)</div>
                <div class="border border-white/40 p-3 text-center cursor-pointer mt-3 hover:border-white transition-colors group relative"
                     onclick="navigator.clipboard.writeText('${pwd}'); this.querySelector('.ch').textContent='COPIED!'; setTimeout(()=>this.querySelector('.ch').textContent='CLICK TO COPY',2000);">
                    <div class="text-[10px] text-zinc-500 mb-1 font-bold">ACCESS KEY — SAME AS BEFORE</div>
                    <div class="text-white font-bold font-mono tracking-widest text-xs">${pwd}</div>
                    <div class="ch text-[9px] text-zinc-600 mt-2 tracking-widest">CLICK TO COPY</div>
                </div>
                <div class="text-[10px] text-zinc-500 leading-relaxed mt-2 p-2 bg-white/5 border border-white/10">
                    Terminal: <span class="text-white font-bold">unlock ${pwd}</span>
                </div>
                <div class="text-[10px] text-green-400/80 mt-1">
                    ✓ Password unchanged — same key works for all versions of this diary
                </div>
            </div>`;

        renderSidebar();
    } catch (err) {
        resultEl.innerHTML = `<span class="text-red-500 text-[10px]">Fault: ${err.message}</span>`;
    }
};

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
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
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
            <div class="border border-white/20 bg-black/40 p-4 flex flex-col gap-1 hover:border-white/40 transition-colors cursor-pointer" onclick="switchTab('diary')">
                <div class="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Diary Nodes</div>
                <div class="text-white text-3xl font-bold">${summary.diaryCount}</div>
                <div class="text-zinc-600 text-[10px]">encrypted diary vaults</div>
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
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                <button onclick="openCreateNodeModal()"
                    class="border border-white/20 bg-black/40 p-4 text-left hover:border-white/50 transition-colors group">
                    <div class="text-white font-bold text-xs tracking-widest group-hover:text-zinc-300">→ CREATE DIARY NODE</div>
                    <div class="text-zinc-600 text-[10px] mt-1">Date-indexed encrypted journal vault</div>
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
            <div class="flex justify-between text-zinc-500 uppercase tracking-widest">
                <span>Diary Nodes</span><span class="text-white font-bold">${summary.diaryCount}</span>
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
            ['encode {string}', 'Maps English characters to Binary blocks (UTF-8 \u2192 64-bit blocks).'],
            ['decode {binary}', 'Reverses space-separated binary blocks into English text.'],
            ['stash {string}', 'Encrypts text payload with AES-GCM 256 and stores in local IndexedDB vault.'],
            ['unlock {key}', 'Decrypts a stash \u2014 auto-detects text, audio, video, and diary payloads.'],
            ['export {key}', 'Downloads encrypted stash or diary as a portable backup file (.ts64 / .ts64diary).'],
            ['stash_audio', 'Opens a file picker to encrypt an audio file into the local vault.'],
            ['stash_video', 'Opens a file picker to encrypt a video file \u2014 auto-downloads as .ts64vid.'],
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
                    ['unlock {key}', 'Decrypt stash (text, audio, video, or diary)'],
                    ['export {key}', 'Download encrypted backup (.ts64 / .ts64diary)'],
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

                    // ── Check if this is a diary key first ──
                    const diaryMeta = await dbGet('TS64_DIARY_' + id);
                    if (diaryMeta && diaryMeta.type === 'diary') {
                        // Delegate to diary decryption logic
                        try {
                            const headerRaw = await dbGet('TS64_DIARY_' + id + '_header');
                            if (!headerRaw) throw new Error('Header chunk missing');
                            const hdrArr = new Uint8Array(headerRaw.buffer || headerRaw);
                            const salt = hdrArr.slice(4, 20);
                            const key = await deriveKey(pwd, salt);

                            const decryptedParts = [];
                            for (let ci = 0; ci < diaryMeta.chunkCount; ci++) {
                                const envRaw = await dbGet(`TS64_DIARY_${id}_chunk_${ci}`);
                                if (!envRaw) throw new Error(`Chunk ${ci} missing`);
                                const ev = new Uint8Array(envRaw.buffer || envRaw);
                                const iv = ev.slice(4, 16);
                                const ctLen = new DataView(ev.buffer, ev.byteOffset + 16, 4).getUint32(0, true);
                                const ct = ev.slice(20, 20 + ctLen);
                                const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
                                decryptedParts.push(new Uint8Array(plain));
                            }

                            const totalLen = decryptedParts.reduce((s, p) => s + p.byteLength, 0);
                            const merged = new Uint8Array(totalLen);
                            let pos = 0;
                            for (const p of decryptedParts) { merged.set(p, pos); pos += p.byteLength; }

                            const diaryStr = new TextDecoder('utf-8', { fatal: true }).decode(merged);
                            const diaryObj = JSON.parse(diaryStr);

                            // Store so OPEN IN EDITOR can carry password
                            window._lastDecryptedDiary = diaryObj;
                            window._lastDecryptedDiaryPassword = pwd;

                            const sortedDates = Object.keys(diaryObj.entries).sort();
                            const containerId = 'diary-unlock-' + Date.now();

                            // Build date-only rows (text hidden by default)
                            const rowsHtml = sortedDates.map((d, idx) => {
                                const logDate = toLogDate(d);
                                const entry = diaryObj.entries[d];
                                const text = (typeof entry === 'string' ? entry : entry.text) || '(empty entry)';
                                const escapedText = text.replace(/</g, '&lt;');
                                const hasContent = text.trim().length > 0 && text !== '(empty entry)';
                                const sizeKb = Math.ceil((text.length * 2) / 1024) || 1;
                                const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
                                const rowId = `${containerId}-row-${idx}`;
                                const textId = `${containerId}-text-${idx}`;

                                return `
                                <div id="${rowId}" class="group">
                                    <div class="flex items-center justify-between py-2 px-3 -mx-3 cursor-pointer transition-all duration-200
                                                hover:bg-white/10 text-zinc-400 hover:text-white font-mono text-sm"
                                         onclick="(function(){
                                             var el=document.getElementById('${textId}');
                                             var arrow=document.getElementById('${rowId}-arrow');
                                             if(el.classList.contains('hidden')){
                                                 el.classList.remove('hidden');
                                                 arrow.textContent='▼';
                                             } else {
                                                 el.classList.add('hidden');
                                                 arrow.textContent='▶';
                                             }
                                         })()">
                                        <div class="flex items-center gap-2">
                                            <span id="${rowId}-arrow" class="text-[10px] text-zinc-600 w-3">▶</span>
                                            <span class="font-bold">[${logDate}]</span>
                                            ${hasContent
                                        ? `<span class="text-[10px] text-zinc-600 font-normal ml-2">${wordCount} words · ${sizeKb}KB</span>`
                                        : `<span class="text-[10px] text-zinc-700 font-normal ml-2">empty</span>`
                                    }
                                        </div>
                                        <span class="text-[10px] text-zinc-700 group-hover:text-zinc-500 transition-colors">${formatDisplayDate(d)}</span>
                                    </div>
                                    <div id="${textId}" class="hidden border-l-2 border-white ml-1 pl-4 py-3 mb-2 transition-all">
                                        <div class="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">${escapedText}</div>
                                    </div>
                                </div>`;
                            }).join('');

                            resWrap.innerHTML = `
                                <div class="border border-white p-4 relative font-mono mt-2 mb-4">
                                    <div class="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-white bg-black"></div>
                                    <div class="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-white bg-black"></div>
                                    <div class="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-white bg-black"></div>
                                    <div class="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-white bg-black"></div>

                                    <div class="flex items-center justify-between mb-4 border-b border-white/20 pb-3">
                                        <div>
                                            <h3 class="text-white font-bold tracking-widest uppercase text-base">📓 ${diaryObj.name}</h3>
                                            <div class="text-zinc-500 text-[10px] mt-1">
                                                by <span class="text-white">${diaryObj.author}</span> ·
                                                <span class="text-white">${sortedDates.length}</span> entries ·
                                                Checksum: <span class="text-white">${diaryMeta.checksum}</span>
                                            </div>
                                        </div>
                                        <div class="text-[10px] text-zinc-600 border border-white/20 px-2 py-1 text-right shrink-0">
                                            AES-GCM-256<br>DECRYPTED
                                        </div>
                                    </div>

                                    <div class="text-[10px] text-zinc-600 uppercase tracking-widest mb-3 font-bold">
                                        Click a date to expand entry ▼
                                    </div>
                                    <div class="space-y-0 divide-y divide-white/10">${rowsHtml}</div>

                                    <div class="mt-4 pt-3 border-t border-white/10 flex gap-3 flex-wrap">
                                        <button onclick="(function(){
                                            document.querySelectorAll('[id^=\\'${containerId}-text-\\']').forEach(function(el){el.classList.remove('hidden')});
                                            document.querySelectorAll('[id$=\\'-arrow\\']').forEach(function(el){if(el.id.startsWith('${containerId}')){el.textContent='▼'}});
                                        })()" class="text-[10px] text-zinc-500 hover:text-white border border-white/20 px-3 py-1 tracking-widest hover:border-white transition-colors">
                                            EXPAND ALL
                                        </button>
                                        <button onclick="(function(){
                                            document.querySelectorAll('[id^=\\'${containerId}-text-\\']').forEach(function(el){el.classList.add('hidden')});
                                            document.querySelectorAll('[id$=\\'-arrow\\']').forEach(function(el){if(el.id.startsWith('${containerId}')){el.textContent='▶'}});
                                        })()" class="text-[10px] text-zinc-500 hover:text-white border border-white/20 px-3 py-1 tracking-widest hover:border-white transition-colors">
                                            COLLAPSE ALL
                                        </button>
                                        <button onclick="switchTab('diary'); openDecryptedDiaryInEditor()"
                                            class="ml-auto bg-white text-black font-bold px-4 py-1.5 text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-colors">
                                            OPEN IN EDITOR
                                        </button>
                                    </div>
                                </div>`;
                        } catch (err) {
                            resWrap.innerHTML = `<span class="text-red-500 p-2 block border border-red-500/50 bg-red-500/10">Access Denied: ${err.message}</span>`;
                        }
                    } else {

                        // ── Standard stash lookup ──
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
                    } // end else (standard stash)
                }
            }

        } else if (command === 'export') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing password key</span>`;
            } else {
                const pwd = args.trim().toUpperCase();
                const parts2 = pwd.split('-');
                const id = parts2[1];

                // Check if this is a diary export
                const diaryMetaExport = await dbGet('TS64_DIARY_' + id);
                if (diaryMetaExport && diaryMetaExport.type === 'diary') {
                    try {
                        const headerRaw = await dbGet('TS64_DIARY_' + id + '_header');
                        if (!headerRaw) throw new Error('Diary header missing');
                        const dlParts = [headerRaw];
                        for (let ci = 0; ci < diaryMetaExport.chunkCount; ci++) {
                            const chunkRaw = await dbGet(`TS64_DIARY_${id}_chunk_${ci}`);
                            if (!chunkRaw) throw new Error(`Chunk ${ci} missing`);
                            dlParts.push(chunkRaw);
                        }
                        const blob = new Blob(dlParts, { type: 'application/octet-stream' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = `diary_node_${id}.ts64diary`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                        resWrap.innerHTML = `
                            <div class="text-white font-bold mb-2">DIARY EXPORTED: diary_node_${id}.ts64diary</div>
                            <div class="text-zinc-500 text-xs">Diary: <span class="text-white">${diaryMetaExport.name}</span> (${diaryMetaExport.entryCount} entries)</div>`;
                    } catch (err) {
                        resWrap.innerHTML = `<span class="text-red-500">Export Failed: ${err.message}</span>`;
                    }
                } else {
                    // Standard stash export — stitch header + all chunks into one binary file
                    try {
                        const stashMeta = await dbGet('TS64_STASH_' + id);
                        if (!stashMeta) {
                            resWrap.innerHTML = `<span class="text-red-500">Export Failed: No stash found for key ${id}.</span>`;
                        } else if (stashMeta && typeof stashMeta === 'object' && stashMeta.v === 2) {
                            // V2 chunked — stitch header + all chunk envelopes together
                            const headerRaw = await dbGet('TS64_STASH_' + id + '_header');
                            if (!headerRaw) throw new Error('Header chunk missing — cannot export');
                            const dlParts = [headerRaw];
                            for (let ci = 0; ci < stashMeta.chunkCount; ci++) {
                                const chunkRaw = await dbGet(`TS64_STASH_${id}_chunk_${ci}`);
                                if (!chunkRaw) throw new Error(`Data chunk ${ci} missing`);
                                dlParts.push(chunkRaw);
                            }
                            // NO trailing type tag — the TS64 magic header is already sufficient
                            const blob = new Blob(dlParts, { type: 'application/octet-stream' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = `backup_${id}.ts64`;
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            setTimeout(() => URL.revokeObjectURL(url), 60000);
                            resWrap.innerHTML = `<div class="text-white font-bold mb-2">BACKUP EXPORTED: backup_${id}.ts64</div><div class="text-zinc-500 text-xs">Drag this file back into the terminal to restore.</div>`;
                        } else {
                            // Legacy V1 raw blob — export as-is
                            const blob = new Blob([stashMeta], { type: 'application/octet-stream' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = `backup_${id}.ts64`;
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            resWrap.innerHTML = `<div class="text-white font-bold mb-2">BACKUP EXPORTED: backup_${id}.ts64</div><div class="text-zinc-500 text-xs">Legacy format — drag back to restore.</div>`;
                        }
                    } catch (err) {
                        resWrap.innerHTML = `<span class="text-red-500">Export Failed: ${err.message}</span>`;
                    }
                }
            }

        } else if (command === 'purge') {
            const keys = await dbKeys();
            let wiped = 0;
            for (let key of keys) {
                if (key && (key.startsWith('TS64_STASH_') || key.startsWith('TS64_META_') || key.startsWith('TS64_DIARY_'))) {
                    await dbRemove(key);
                    wiped++;
                }
            }
            await dbSet('TS64_META_stats', { text: 0, audio: 0, video: 0, diary: 0 });
            resWrap.innerHTML = `
                <div class="font-bold text-red-500 mb-2 border-b border-red-500/30 pb-2">VAULT PURGED</div>
                <div class="text-zinc-500">${wiped} objects destroyed (stashes + diary nodes + all chunk data).</div>`;
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
        const isDiaryBackup = lowerName.endsWith('.ts64diary');
        const isBackup = lowerName.endsWith('.ts64') || lowerName.endsWith('.ts64vid');
        const isAudio = file.type.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.flac', '.aac'].some(x => lowerName.endsWith(x));
        const isVideo = file.type.startsWith('video/') || ['.mp4', '.webm', '.mkv', '.mov', '.avi'].some(x => lowerName.endsWith(x));

        const wrp = document.createElement('div');
        wrp.className = 'mt-2 mb-4 border-l border-white/20 pl-4 py-2 text-sm';
        wrp.id = 'drop-result-' + Date.now();
        outputContainer.appendChild(wrp);

        if (isDiaryBackup) {
            const idMatch = file.name.match(/node_([A-Z0-9]{4})\.ts64diary$/i) || file.name.match(/([A-Z0-9]{4})\.ts64diary$/i);
            const id = idMatch ? idMatch[1].toUpperCase() : null;
            if (!id) { wrp.innerHTML = `<span class="text-red-500">Malformed diary backup filename.</span>`; return; }

            try {
                const buf = await file.arrayBuffer();
                if (buf.byteLength < 28) throw new Error("Invalid diary backup: file too small");

                const hdrRaw = new Uint8Array(buf.slice(0, 28));
                if (hdrRaw[0] !== 0x54 || hdrRaw[1] !== 0x53 || hdrRaw[2] !== 0x36 || hdrRaw[3] !== 0x34) {
                    throw new Error("Invalid magic pattern in diary structure");
                }

                await dbSet('TS64_DIARY_' + id + '_header', hdrRaw);

                let offset = 28;
                let chunkCount = 0;
                while (offset < buf.byteLength) {
                    if (offset + 20 > buf.byteLength) break;
                    const cv = new DataView(buf.slice(offset, offset + 20));
                    const ctLen = cv.getUint32(16, true);
                    const chunkSize = 20 + ctLen;
                    if (offset + chunkSize > buf.byteLength) break;

                    const env = new Uint8Array(buf.slice(offset, offset + chunkSize));
                    await dbSet(`TS64_DIARY_${id}_chunk_${chunkCount}`, env);
                    offset += chunkSize;
                    chunkCount++;
                }

                await dbSet('TS64_DIARY_' + id, {
                    type: 'diary',
                    chunkCount: chunkCount,
                    checksum: 'RESTORED',
                    name: 'RESTORED DIARY NODE',
                    author: 'UNKNOWN',
                    v: 2
                });

                wrp.innerHTML = `<div class="font-bold text-white mb-2 tracking-widest text-[10px]">DIARY BACKUP RESTORED</div><div class="text-zinc-500 text-xs">Key chunk ID processed: <span class="text-white">${id}</span>. You may now unlock.</div>`;
            } catch (err) {
                wrp.innerHTML = `<span class="text-red-500">Diary restore error: ${err.message}</span>`;
            }
        } else if (isBackup) {
            // .ts64 backup file — extract id from filename
            const idMatch = file.name.match(/backup_([A-Z0-9]{4})\.ts64$/i) || file.name.match(/([A-Z0-9]{4})\.ts64$/i);
            const id = (idMatch ? idMatch[1] : file.name.split('_')[1]?.split('.')[0] || file.name.split('.')[0])?.toUpperCase();
            if (!id) { wrp.innerHTML = `<span class="text-red-500">Malformed backup filename.</span>`; return; }
            try {
                const buf = await file.arrayBuffer();

                // Check for V2 magic header: bytes 0-3 = 0x54 0x53 0x36 0x34 ('TS64')
                const magic = new Uint8Array(buf.slice(0, 4));
                const hasV2Magic = magic[0] === 0x54 && magic[1] === 0x53 && magic[2] === 0x36 && magic[3] === 0x34;

                if (hasV2Magic && buf.byteLength >= 28) {
                    // V2 chunked binary — split into header + chunks
                    const hdrRaw = new Uint8Array(buf.slice(0, 28));
                    await dbSet('TS64_STASH_' + id + '_header', hdrRaw);

                    // Greedily walk chunk envelopes starting at byte 28
                    // Envelope format: [4B index][12B IV][4B ctLen][ctLen bytes ciphertext]
                    let offset = 28;
                    let chunkCount = 0;
                    while (offset + 20 <= buf.byteLength) {
                        // Read ciphertext length from envelope header
                        const cv = new DataView(buf, offset, 20);
                        const ctLen = cv.getUint32(16, true);
                        const envelopeSize = 20 + ctLen;

                        // Validate we have enough bytes for the full envelope
                        if (ctLen <= 0 || ctLen > 100 * 1024 * 1024 || offset + envelopeSize > buf.byteLength) break;

                        const env = new Uint8Array(buf.slice(offset, offset + envelopeSize));
                        await dbSet(`TS64_STASH_${id}_chunk_${chunkCount}`, env);
                        offset += envelopeSize;
                        chunkCount++;
                    }

                    if (chunkCount === 0) {
                        wrp.innerHTML = `<span class="text-red-500">Backup appears corrupted: valid header but no readable chunks.</span>`;
                        return;
                    }

                    // Store V2 metadata so unlock recognizes this as chunked
                    await dbSet('TS64_STASH_' + id, { type: 'text', chunkCount, totalSize: buf.byteLength, v: 2 });
                    await incrementStat('text');
                    wrp.innerHTML = `<div class="font-bold text-white mb-2 tracking-widest text-[10px]">BACKUP RESTORED</div><div class="text-zinc-500 text-xs">Key: <span class="text-white">${id}</span> · ${chunkCount} chunk(s) imported. Use <span class="text-white">unlock TS64-${id}-XXXX</span> to decrypt.</div>`;
                } else {
                    // Not V2 binary — check if it's a corrupt old-format export (JSON metadata)
                    try {
                        const testStr = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buf.slice(0, Math.min(100, buf.byteLength))));
                        if (testStr.startsWith('{') && testStr.includes('"type"')) {
                            wrp.innerHTML = `<span class="text-red-500 block mb-1">This backup file contains metadata only, not encrypted data.</span><span class="text-zinc-500 text-[10px]">It was exported with an old version of TetraScript. You need to re-stash and re-export the data.</span>`;
                            return;
                        }
                    } catch (e) { /* not JSON */ }

                    // Legacy V1 raw blob — store directly
                    await dbSet('TS64_STASH_' + id, new Uint8Array(buf));
                    await incrementStat('text');
                    wrp.innerHTML = `<div class="font-bold text-white mb-2">BACKUP RESTORED (legacy)</div><div class="text-zinc-500">Key: ${id}</div>`;
                }
            } catch (err) {
                wrp.innerHTML = `<span class="text-red-500">Restore error: ${err.message}</span>`;
            }
        } else if (isAudio) {
            wrp.innerHTML = `
                <div class="p-3 border border-white/20 bg-black/40">
                    <div class="text-white font-bold tracking-widest text-xs mb-3 uppercase">ENCRYPTING AUDIO — ${(file.size / (1024 * 1024)).toFixed(1)} MB</div>
                    <div class="w-full bg-white/10 h-1 mb-2 overflow-hidden">
                        <div id="enc-progress-bar" class="bg-white h-1 transition-all duration-300" style="width:0%"></div>
                    </div>
                </div>`;
            const audioPwd = generatePassword();
            const audioId = audioPwd.split('-')[1];
            try {
                const salt = crypto.getRandomValues(new Uint8Array(16));
                const key = await deriveKey(audioPwd, salt);
                const hdr = new Uint8Array(28);
                hdr.set([0x54, 0x53, 0x36, 0x34], 0);
                hdr.set(salt, 4);
                new DataView(hdr.buffer).setBigUint64(20, BigInt(file.size), true);
                await dbSet('TS64_STASH_' + audioId + '_header', hdr);

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
                    await dbSet(`TS64_STASH_${audioId}_chunk_${chunkIndex}`, env);
                    offset += CHUNK_SIZE; bytesProcessed += ab.byteLength; chunkIndex++;
                    updateProgress((bytesProcessed / file.size) * 100, '');
                }
                await dbSet('TS64_STASH_' + audioId, { type: 'audio', mime: file.type || 'audio/mpeg', name: file.name, chunkCount: chunkIndex, totalSize: file.size, v: 2 });
                await incrementStat('audio');
                wrp.innerHTML = `
                    <div class="font-bold text-white mb-2 tracking-wider border-b border-white/10 pb-2">AUDIO STASH SECURED</div>
                    <div class="text-zinc-500 mb-1">File: <span class="text-white">${file.name}</span></div>
                    ${keyCardHTML(audioPwd)}`;
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
            const videoPwd = generatePassword();
            const videoId = videoPwd.split('-')[1];
            try {
                const salt = crypto.getRandomValues(new Uint8Array(16));
                const key = await deriveKey(videoPwd, salt);
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
                a.href = url; a.download = `classified_footage_${videoId}.ts64vid`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 60000);

                await incrementStat('video');
                wrp.innerHTML = `
                                <div class="font-bold text-white mb-2 tracking-wider border-b border-white/10 pb-2">VIDEO STASH EXPORTED</div>
                                    <div class="text-zinc-500 mb-1">Output: <span class="text-white">classified_footage_${videoId}.ts64vid</span></div>
                    ${keyCardHTML(videoPwd)} `;
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
// ============================================================
// BOOT AND PERSISTENCE
// ============================================================
try {
    const draft = localStorage.getItem('ts64_diary_draft');
    if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed && parsed.name) Object.assign(diaryState, parsed);
    }
} catch (e) { }

window.addEventListener('beforeunload', function (e) {
    if (diaryState.name && Object.keys(diaryState.entries).length > 0) {
        const hasUnsaved = Object.values(diaryState.entries).some(entry => !entry.stashed && entry.text && entry.text.trim().length > 0);
        if (hasUnsaved) {
            e.preventDefault();
            e.returnValue = '';
        }
    }
});

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