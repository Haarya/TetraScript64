import re
import sys

def modify_app_js():
    path = r"c:\Users\AARYA\Desktop\TetraScript\website\app.js"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add IndexedDB helpers at the top of initTerminalEngine
    idb_code = """
    // IndexedDB Wrapper
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
"""
    content = content.replace("function initTerminalEngine() {", "function initTerminalEngine() {\n" + idb_code)

    # 2. Update Web Crypto to support ArrayBuffer
    content = re.sub(
        r"async function encryptData\(text, password\) \{.*?return btoa\(String\.fromCharCode\(\.\.\.bundle\)\);\s*\}",
        """async function encryptData(data, password) {
        const enc = new TextEncoder();
        let buffer;
        if (typeof data === 'string') {
            buffer = enc.encode(data);
        } else if (data instanceof ArrayBuffer) {
            buffer = new Uint8Array(data);
        } else {
            buffer = data;
        }

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt);

        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, key, buffer
        );

        const bundle = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
        bundle.set(salt, 0);
        bundle.set(iv, salt.length);
        bundle.set(new Uint8Array(ciphertext), salt.length + iv.length);

        return bundle; // Return raw Uint8Array for IDB
    }""",
        content,
        flags=re.DOTALL
    )

    content = re.sub(
        r"async function decryptData\(bundleBase64, password\) \{.*?return new TextDecoder\(\)\.decode\(decryptedBuffer\);\s*\} catch\s*\(e\)\s*\{\s*return null;\s*\}\s*\}",
        """async function decryptData(bundleData, password, returnAsText = true) {
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
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv }, key, ciphertext
            );

            if (returnAsText) {
                return new TextDecoder().decode(decryptedBuffer);
            } else {
                return decryptedBuffer;
            }
        } catch (e) {
            return null;
        }
    }""",
        content,
        flags=re.DOTALL
    )

    # 3. renderStorageStatsInline to Async
    content = re.sub(
        r"function renderStorageStatsInline\(\) \{.*?return\s*`.*?`;\s*\}",
        """async function renderStorageStatsInline() {
        let stashCount = 0;
        let stashSize = 0;
        const keys = await dbKeys();
        const items = await dbGetAll();
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] && keys[i].startsWith('TS64_STASH_')) {
                stashCount++;
                let item = items[i];
                if (typeof item === 'string') {
                    stashSize += item.length;
                } else if (item.byteLength) {
                    stashSize += item.byteLength;
                }
            }
        }
        const maxKb = 50 * 1024; // Expanded to 50MB for Media
        const kbSize = (stashSize / 1024).toFixed(1);
        const percentage = Math.min(100, (stashSize / (maxKb * 1024)) * 100).toFixed(2);
        const totalBars = 30;
        const filledBars = Math.floor((percentage / 100) * totalBars);
        const barStr = '█'.repeat(filledBars) + '-'.repeat(totalBars - filledBars);

        return `
        <div class="border border-white/20 pl-4 mb-6 space-y-6 pt-4 pr-4 bg-black/40">
            <div class="flex justify-between items-end border-b border-white/20 pb-2">
                <div>
                    <div class="text-white font-bold text-lg tracking-wider">SECURE STORAGE DIAGNOSTICS_</div>
                    <div class="text-zinc-500 text-xs uppercase">Local Vault Engine // AES-GCM 256 // IndexedDB</div>
                </div>
                <div class="text-right">
                    <div class="text-zinc-500 text-xs">ENCRYPTED STASHES</div>
                    <div class="text-white font-bold">${stashCount}</div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-4">
                    <div class="flex justify-between text-xs text-zinc-500 uppercase tracking-widest mb-1">
                        <span>Vault Utilization</span>
                        <span class="text-white">${kbSize} KB / 50.0 MB Max Limit</span>
                    </div>
                    <div class="font-mono font-bold text-xs md:text-sm text-zinc-300 leading-none overflow-hidden pb-2">
                        [${barStr}] ${percentage}%
                    </div>
                </div>
            </div>
        </div>`;
    }""",
        content,
        flags=re.DOTALL
    )

    # 4. Status command
    content = content.replace("resWrap.innerHTML = renderStorageStatsInline();", "resWrap.innerHTML = await renderStorageStatsInline();")

    # 5. Stash command (localStorage.setItem -> dbSet)
    content = content.replace("localStorage.setItem('TS64_STASH_' + id, encryptedB64);", "await dbSet('TS64_STASH_' + id, encryptedB64);")

    # 6. Unlock & Export command (localStorage.getItem -> dbGet)
    content = content.replace("const encryptedB64 = localStorage.getItem('TS64_STASH_' + id);", "const encryptedB64 = await dbGet('TS64_STASH_' + id);")

    # 7. Purge command
    content = re.sub(
        r"let wipedCount = 0;\s*for \(let i = localStorage\.length - 1; i >= 0; i--\) \{.*?\}",
        """let wipedCount = 0;
            const keys = await dbKeys();
            for (let key of keys) {
                if (key && key.startsWith('TS64_STASH_')) {
                    await dbRemove(key);
                    wipedCount++;
                }
            }""",
        content,
        flags=re.DOTALL
    )

    # 8. Add stash_audio and stash_video to help
    content = content.replace(
        "<p><span class=\"text-white font-bold\">purge</span> : Finds and securely zeroes out all Tetrascript64 encrypted data.</p>",
        """<p><span class="text-white font-bold">stash_audio</span> : Prompt to encrypt an audio file securely into local memory.</p>
                    <p><span class="text-white font-bold">stash_video</span> : Prompt to encrypt a video file and download it securely.</p>
                    <p><span class="text-white font-bold">purge</span> : Finds and securely zeroes out all Tetrascript64 encrypted data.</p>"""
    )
    
    # 9. Handle drag and drop for media decoding
    content = re.sub(
        r"const reader = new FileReader\(\);\s*reader\.onload = function \(evt\) \{[^}]+\};\s*reader\.readAsText\(file\);",
        """const reader = new FileReader();
            reader.onload = async function (evt) {
                const encryptedB64 = evt.target.result.trim();
                await dbSet('TS64_STASH_' + id, encryptedB64);

                const wrp = document.createElement('div');
                wrp.className = 'mt-2 mb-4 border-l border-white/20 pl-4 py-2 text-sm';
                wrp.innerHTML = `
                    <div class="font-bold text-white mb-2">BACKUP IMPORTED</div>
                    <div class="text-zinc-500">Key Restored: ${id}</div>
                `;
                outputContainer.appendChild(wrp);
                mainEl.scrollTop = mainEl.scrollHeight;
            };
            reader.readAsText(file);""",
        content,
        flags=re.DOTALL
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

modify_app_js()
