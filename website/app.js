// app.js

const state = {
    activeTab: 'terminal',
    cpuLoad: 14.2
};

// UI Elements
const mainNavLinks = document.querySelectorAll('#main-nav .nav-link');
const mainContent = document.getElementById('main-content');
const rightSidebar = document.getElementById('right-sidebar');
const cpuBar = document.getElementById('cpu-bar');
const globalCpu = document.getElementById('global-cpu');

// Simulated CPU Load
setInterval(() => {
    state.cpuLoad = Math.max(5, Math.min(95, state.cpuLoad + (Math.random() * 10 - 5)));
    if (globalCpu) globalCpu.textContent = state.cpuLoad.toFixed(1) + '%';
    if (cpuBar) cpuBar.style.width = state.cpuLoad + '%';
}, 2000);

// Initialize Navigation
mainNavLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        mainNavLinks.forEach(l => l.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const tab = e.currentTarget.getAttribute('data-tab');
        switchTab(tab);
    });
});

// Layouts and Content Generators

function switchTab(tab) {
    state.activeTab = tab;
    mainContent.innerHTML = '';
    rightSidebar.innerHTML = '';
    rightSidebar.style.display = 'flex'; // show right sidebar by default

    // Cleanup if leaving terminal
    if (tab !== 'terminal') {
        const outputContainer = document.getElementById('output-container');
        if (outputContainer) outputContainer.innerHTML = '';
    }

    switch (tab) {
        case 'dashboard':
            renderDashboardTab();
            break;
        case 'audio':
            renderAudioTab();
            break;
        case 'video':
            renderVideoTab();
            break;
        case 'terminal':
            renderTerminalTab();
            rightSidebar.style.display = 'none'; // Terminal usually takes full width in our design
            break;
        case 'help':
            renderHelpTab();
            break;
        default:
            renderTerminalTab();
    }
}

function renderDashboardTab() {
    mainContent.innerHTML = `
    <div class="p-8">
        <h1 class="text-3xl font-bold tracking-widest text-white mb-2 uppercase">System Information: <br/>TetraScript64 Core</h1>
        <div class="text-zinc-500 text-xs mb-8">Build v2.4.0-stable | JetBrains Mono 100% Rendering</div>
        
        <div class="border-t border-white/20 pt-8 relative max-w-2xl">
            <div class="absolute -top-[10px] bg-[#030303] px-4 left-1/2 -translate-x-1/2 text-xs font-bold tracking-[0.2em] text-white">DEVELOPER_BIO.SYS</div>
            
            <div class="border border-white/20 p-6 font-mono text-sm leading-relaxed text-zinc-300">
                <p class="mb-4"><span class="text-white font-bold">01: [INIT]</span> Loading Architect Profile...</p>
                <p class="mb-4"><span class="text-white font-bold">02:</span> Tetrascript64 is the culmination of obsession-driven engineering, focusing on the convergence of low-level performance and high-fidelity aesthetic design.</p>
                <p class="mb-6"><span class="text-white font-bold">03:</span> Our mission is to provide an interface that doesn't just display data, but embodies the architectural integrity of the systems it monitors.</p>
                <p class="mb-2"><span class="text-white font-bold">04:</span> <span class="bg-white text-black px-1 font-bold">Lead Developer:</span> ARBITER_CORE_01</p>
                <p class="mb-6"><span class="text-white font-bold">05:</span> <span class="bg-white text-black px-1 font-bold">Location:</span> NEOM_HUB_SECTOR_7</p>
                <p><span class="text-white font-bold">06: [EOF]</span> End of biological data transmission.</p>
            </div>
        </div>
    </div>
    `;

    rightSidebar.innerHTML = `
        <div class="p-4 border-b border-white/20 text-[10px] font-bold tracking-widest text-white uppercase flex justify-between">
            <span>NETWORK TOPOLOGY</span>
            <span class="material-symbols-outlined text-xs">adjust</span>
        </div>
        <div class="flex-1 relative border-b border-white/20 p-4 opacity-50 flex items-center justify-center min-h-[300px]">
            <div class="border border-white/20 p-1 text-[10px] absolute top-4 left-4">NODE STATUS: ACTIVE</div>
            <!-- Mock Topology Grid -->
            <div class="w-full h-full border border-dashed border-white/20 rounded-full flex items-center justify-center relative">
                <div class="w-1/2 h-1/2 border border-dashed border-white/20 rounded-full"></div>
                <div class="absolute w-2 h-2 bg-white top-1/4 left-1/4"></div>
                <div class="absolute w-2 h-2 bg-white bottom-1/3 right-1/4"></div>
                <div class="absolute w-1 h-1 bg-zinc-600 top-1/2 right-1/2"></div>
            </div>
        </div>
        <div class="p-4 text-[10px] tracking-widest space-y-3 font-bold text-zinc-500 uppercase">
            <div class="flex justify-between"><span>NODE_ALFA</span> <span class="text-white">STABLE</span></div>
            <div class="flex justify-between"><span>NODE_BRAVO</span> <span class="text-white">STABLE</span></div>
            <div class="flex justify-between"><span>NODE_DELTA</span> <span class="text-white">STABLE</span></div>
        </div>
    `;
}

function renderAudioTab() {
    mainContent.innerHTML = `
    <div class="p-8 h-full flex flex-col justify-center items-center text-center">
        <span class="material-symbols-outlined text-6xl text-white/20 mb-4 animate-pulse">graphic_eq</span>
        <h2 class="text-2xl font-bold tracking-widest text-white mb-2 uppercase">Audio Encryption Module</h2>
        <p class="text-zinc-500 max-w-md text-sm leading-relaxed mb-8">Secure audio file transformation using AES-GCM and base64 chunking. This module is currently initializing.</p>
        <div class="border border-white/20 p-4 text-xs font-mono text-zinc-400">
            AWAITING UPLOAD PAYLOAD
        </div>
    </div>
    `;
    rightSidebar.innerHTML = `
        <div class="p-4 border-b border-white/20 text-[10px] font-bold tracking-widest text-white uppercase">AUDIO.METADATA</div>
        <div class="p-4 text-xs text-zinc-500">No active streams.</div>
    `;
}

function renderVideoTab() {
    mainContent.innerHTML = `
    <div class="p-8 h-full flex flex-col justify-center items-center text-center">
        <span class="material-symbols-outlined text-6xl text-white/20 mb-4 animate-pulse">movie</span>
        <h2 class="text-2xl font-bold tracking-widest text-white mb-2 uppercase">Video Encryption Module</h2>
        <p class="text-zinc-500 max-w-md text-sm leading-relaxed mb-8">Secure video container transformation with advanced chunk-based cryptographic wrapping.</p>
        <div class="border border-white/20 p-4 text-xs font-mono text-zinc-400">
            AWAITING UPLOAD PAYLOAD
        </div>
    </div>
    `;
    rightSidebar.innerHTML = `
        <div class="p-4 border-b border-white/20 text-[10px] font-bold tracking-widest text-white uppercase">VIDEO.METADATA</div>
        <div class="p-4 text-xs text-zinc-500">No active render targets.</div>
    `;
}

function renderHelpTab() {
    mainContent.innerHTML = `
    <div class="p-8">
        <h2 class="text-2xl font-bold tracking-widest text-white mb-6 uppercase border-b border-white/20 pb-4">System Manual</h2>
        <div class="space-y-6 text-sm text-zinc-400">
            <div>
                <h3 class="text-white font-bold mb-2">TERMINAL USAGE</h3>
                <p>Use the Terminal tab to execute core low-level commands to securely stash textual data into your browser's local memory footprint.</p>
            </div>
            <div class="bg-white/5 border border-white/10 p-4">
                <code class="text-white block mb-1">stash {your text}</code>
                <p class="text-xs">Encrypt data into AES-256 chunk and generate a secure retrieval key.</p>
            </div>
            <div class="bg-white/5 border border-white/10 p-4">
                <code class="text-white block mb-1">unlock {key}</code>
                <p class="text-xs">Use your securely generated key to decode and access your specific stash.</p>
            </div>
            <div class="bg-white/5 border border-white/10 p-4">
                <code class="text-white block mb-1">purge</code>
                <p class="text-xs">Permanently detonate all encrypted records cached within this browser's memory.</p>
            </div>
        </div>
    </div>
    `;
    rightSidebar.style.display = 'none';
}

function renderTerminalTab() {
    mainContent.innerHTML = `
        <div class="flex flex-col min-h-full w-full p-6 pb-20 justify-end">
            <div id="output-container" class="w-full flex-1 flex flex-col justify-end gap-1 text-sm md:text-base leading-relaxed"></div>

            <div class="flex items-start gap-3 mt-4 text-lg w-full relative shrink-0">
                <span class="text-white font-bold whitespace-nowrap pt-1">tetrascript64@system:~$</span>
                <form id="cli-form" class="flex-1 flex w-full relative">
                    <textarea id="cli-input"
                        class="flex-1 w-full bg-transparent border-none text-white p-0 focus:ring-0 font-mono text-lg resize-none overflow-hidden pt-1 leading-relaxed caret-[#ffffff]"
                        autocomplete="off" autocapitalize="none" autocorrect="off" autofocus spellcheck="false" rows="1"></textarea>
                    
                    <div id="cli-cursor" class="absolute w-2 h-5 bg-white opacity-80 pointer-events-none mt-1.5 transition-all duration-75"></div>
                </form>
            </div>
        </div>
    `;

    setTimeout(() => {
        initTerminalEngine();
        document.getElementById('cli-input').focus();
    }, 50);
}

// -------------------------------------------------------------
// TERMINAL ENGINE LOGIC (Ported from original script)
// -------------------------------------------------------------
function initTerminalEngine() {
    const inputEl = document.getElementById('cli-input');
    const formEl = document.getElementById('cli-form');
    const outputContainer = document.getElementById('output-container');
    const mainEl = document.getElementById('main-content'); // Terminal uses main-content scroll

    if (!inputEl || !formEl) return;

    // Keep focus
    mainEl.addEventListener('click', () => {
        if (window.getSelection().toString() === '') {
            inputEl.focus();
        }
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

        let text = inputEl.value;
        const index = inputEl.selectionStart;
        const textBefore = text.substring(0, index);
        const charAtCursor = text.substring(index, index + 1) || '&nbsp;';
        const textAfter = text.substring(index + 1);

        // Rebuild the visible text layer
        inputMock.innerHTML = `
            <span class="text-white whitespace-pre-wrap leading-relaxed">${textBefore.replace(/</g, "&lt;")}</span><span class="bg-white text-black opacity-80 animate-pulse border-b-2 border-white inline-block whitespace-pre-wrap leading-relaxed ${charAtCursor === ' ' || charAtCursor === '&nbsp;' ? 'w-2 h-5 align-middle' : ''}">${charAtCursor === '&nbsp;' ? '' : charAtCursor.replace(/</g, "&lt;")}</span><span class="text-white whitespace-pre-wrap leading-relaxed">${textAfter.replace(/</g, "&lt;")}</span>
        `;

        inputMock.classList.remove('invisible');
        inputMock.style.visibility = 'visible';
    }

    inputEl.addEventListener('input', updateInputUI);
    inputEl.addEventListener('keyup', updateInputUI);
    inputEl.addEventListener('click', updateInputUI);

    // Initial call
    requestAnimationFrame(updateInputUI);

    // Keyboard bindings
    inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            formEl.dispatchEvent(new Event('submit'));
        } else if (e.key === 'PageUp') {
            e.preventDefault();
            mainEl.scrollBy({ top: -mainEl.clientHeight * 0.8, behavior: 'smooth' });
        } else if (e.key === 'PageDown') {
            e.preventDefault();
            mainEl.scrollBy({ top: mainEl.clientHeight * 0.8, behavior: 'smooth' });
        }
    });

    function encodeTextToBinaryBlocks(text) {
        if (!text) return [];
        const bytes = new TextEncoder().encode(text);
        let binaryStr = "";
        for (let b of bytes) {
            binaryStr += b.toString(2).padStart(8, '0');
        }
        // Split into chunks of 64 bits (8 characters worth of binary)
        const CHUNK_SIZE = 64;
        const blocks = [];
        for (let i = 0; i < binaryStr.length; i += CHUNK_SIZE) {
            blocks.push(binaryStr.substring(i, i + CHUNK_SIZE));
        }
        return blocks;
    }

    function decodeBinaryBlocksToText(blocksArray) {
        try {
            const binaryWord = blocksArray.join('');
            if (!binaryWord) return "";
            if (binaryWord.length % 8 !== 0) throw new Error("Invalid length");
            const bytes = new Uint8Array(binaryWord.length / 8);
            for (let i = 0; i < binaryWord.length; i += 8) {
                bytes[i / 8] = parseInt(binaryWord.substring(i, i + 8), 2);
            }
            return new TextDecoder().decode(bytes);
        } catch (e) {
            return null;
        }
    }

    // Web Crypto Engine
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
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
    }

    async function encryptData(text, password) {
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt);

        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, key, enc.encode(text)
        );

        const bundle = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
        bundle.set(salt, 0);
        bundle.set(iv, salt.length);
        bundle.set(new Uint8Array(ciphertext), salt.length + iv.length);

        return btoa(String.fromCharCode(...bundle));
    }

    async function decryptData(bundleBase64, password) {
        try {
            const bundle = new Uint8Array(atob(bundleBase64).split('').map(c => c.charCodeAt(0)));
            const salt = bundle.slice(0, 16);
            const iv = bundle.slice(16, 28);
            const ciphertext = bundle.slice(28);

            const key = await deriveKey(password, salt);
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv }, key, ciphertext
            );

            return new TextDecoder().decode(decryptedBuffer);
        } catch (e) {
            return null;
        }
    }

    function renderStorageStatsInline() {
        let stashCount = 0;
        let stashSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('TS64_STASH_')) {
                stashCount++;
                stashSize += localStorage.getItem(key).length;
            }
        }
        const kbSize = (stashSize / 1024).toFixed(1);
        const maxKb = 5120;
        const percentage = Math.min(100, (stashSize / (maxKb * 1024)) * 100).toFixed(2);
        const totalBars = 30;
        const filledBars = Math.floor((percentage / 100) * totalBars);
        const barStr = '█'.repeat(filledBars) + '-'.repeat(totalBars - filledBars);

        return `
        <div class="border border-white/20 pl-4 mb-6 space-y-6 pt-4 pr-4 bg-black/40">
            <div class="flex justify-between items-end border-b border-white/20 pb-2">
                <div>
                    <div class="text-white font-bold text-lg tracking-wider">SECURE STORAGE DIAGNOSTICS_</div>
                    <div class="text-zinc-500 text-xs uppercase">Local Vault Engine // AES-GCM 256</div>
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
                        <span class="text-white">${kbSize} KB / 5.0 MB</span>
                    </div>
                    <div class="font-mono font-bold text-xs md:text-sm text-zinc-300 leading-none overflow-hidden pb-2">
                        [${barStr}] ${percentage}%
                    </div>
                </div>
            </div>
        </div>`;
    }

    formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cmdText = inputEl.value.trim();
        if (!cmdText) return;

        // Output command trace
        const myCmdWrap = document.createElement('div');
        myCmdWrap.className = 'flex flex-col mt-4';
        myCmdWrap.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-white font-bold">tetrascript64@system:~$</span>
                <span class="text-zinc-300">${cmdText}</span>
            </div>
        `;
        outputContainer.appendChild(myCmdWrap);

        const rawParts = cmdText.split(/[\s\u200B\uFEFF]+/);
        const parts = rawParts.filter(Boolean);
        const command = parts[0]?.toLowerCase() || "";
        // Extract args preserving original spacing and casing exactly as typed
        // Extract args preserving original spacing/casing exactly as typed
        const firstWordEnd = cmdText.search(/[\s\u200B\uFEFF]/);
        const args = firstWordEnd === -1 ? '' : cmdText.substring(firstWordEnd).replace(/^[\s\u200B\uFEFF]+/, '');

        const resWrap = document.createElement('div');
        resWrap.className = 'mt-2 mb-4 border-l pl-4 py-2 border-white/10 text-sm';

        if (command === 'clear') {
            outputContainer.innerHTML = '';
        } else if (command === 'status' || command === 'dashboard') {
            resWrap.innerHTML = renderStorageStatsInline();
            resWrap.classList.remove('border-l', 'pl-4'); // clean layout
        } else if (command === 'help') {
            resWrap.innerHTML = `
                <div class="text-zinc-400">
                    <p><span class="text-white font-bold">encode {string}</span> : Maps English characters to Morse, Decimal, and Binary strings.</p>
                    <p><span class="text-white font-bold">decode {binary}</span> : Reverses space-separated binary blocks into English text.</p>
                    <p><span class="text-white font-bold">stash {string}</span> : Encrypts the Binary representation using AES-GCM.</p>
                    <p><span class="text-white font-bold">unlock {password}</span> : Decrypts your stash using the generated key.</p>
                    <p><span class="text-white font-bold">export {password}</span> : Triggers a physical download of encrypted .ts64 file.</p>
                    <p><span class="text-white font-bold">purge</span> : Finds and securely zeroes out all Tetrascript64 encrypted data.</p>
                    <p><span class="text-white font-bold">status</span> : Displays current storage and vault diagnostics.</p>
                </div>
            `;
        } else if (command === 'encode') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing input string</span>`;
            } else {
                const blocks = encodeTextToBinaryBlocks(args); // Encode exactly as presented
                const encodedPhrase = blocks.join(" ");
                let htmlRes = `<div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">ENCODING SEQUENCE</div>`;

                htmlRes += `<div class="text-sm text-zinc-500 mb-4">Sequence translated: <span class="text-white">${blocks.length} BLOCKS</span></div>`;

                if (encodedPhrase) {
                    htmlRes += `<div class="mt-4 p-5 border border-white/20 bg-white/5 text-zinc-300 font-mono text-xs md:text-sm tracking-widest break-all flex gap-3 items-start"><span class="shrink-0">></span> <span class="whitespace-pre-wrap leading-relaxed">${encodedPhrase}</span></div>`;
                }
                resWrap.innerHTML = htmlRes;
            }
        } else if (command === 'decode') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing binary blocks</span>`;
            } else {
                const bins = args.trim().split(/[\s\u200B\uFEFF]+/);
                let htmlRes = `<div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">DECODING SEQUENCE</div>`;

                const reconstructedPhrase = decodeBinaryBlocksToText(bins);

                if (reconstructedPhrase === null) {
                    htmlRes += `<div class="text-red-500 mb-2">Error: Invalid binary sequence</div>`;
                } else {
                    htmlRes += `<div class="text-sm text-zinc-500 mb-4">Sequence translated: <span class="text-white">${bins.length} BLOCKS</span></div>`;
                    htmlRes += `<div class="mt-4 p-5 border border-white/20 bg-white/5 text-white font-mono text-base tracking-wide flex gap-3 items-start"><span class="shrink-0">></span> <span class="whitespace-pre-wrap break-words leading-relaxed">${reconstructedPhrase.replace(/</g, "&lt;")}</span></div>`;
                }
                resWrap.innerHTML = htmlRes;
            }
        } else if (command === 'stash') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing input string to stash</span>`;
            } else {
                resWrap.innerHTML = `<div class="text-zinc-500 animate-pulse">Encrypting payload...</div>`;
                outputContainer.appendChild(resWrap);

                const binBlocks = encodeTextToBinaryBlocks(args); // Encodes full string exactly
                if (binBlocks.length === 0) {
                    resWrap.innerHTML = `<span class="text-red-500">Error: Could not encode payload.</span>`;
                } else {
                    const payload = binBlocks.join(" ");
                    const pwd = generatePassword();
                    const id = pwd.split('-')[1];

                    try {
                        const encryptedB64 = await encryptData(payload, pwd);
                        localStorage.setItem('TS64_STASH_' + id, encryptedB64);

                        resWrap.innerHTML = `
                            <div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">STASH SECURED</div>
                            <div class="mb-2 text-zinc-500">Encryption: <span class="text-white">AES-GCM 256-bit</span></div>
                            <div class="mb-2 text-zinc-500">Location: <span class="text-white">Local Vault</span></div>
                            <div class="mt-4 p-4 border border-zinc-500 bg-zinc-500/10 text-center relative group cursor-pointer" onclick="navigator.clipboard.writeText('${pwd}'); this.querySelector('.copy-txt').innerText = 'COPIED!'; setTimeout(() => this.querySelector('.copy-txt').innerText = 'CLICK TO COPY', 2000);">
                                <div class="text-white font-bold mb-2 uppercase tracking-widest">Access Key</div>
                                <div class="text-2xl font-mono text-white tracking-widest">${pwd}</div>
                                <div class="copy-txt absolute top-2 right-2 text-xs text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">CLICK TO COPY</div>
                            </div>
                        `;
                    } catch (err) {
                        resWrap.innerHTML = `<span class="text-red-500">Encryption Fault: ${err.message}</span>`;
                    }
                }
            }
        } else if (command === 'unlock') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing password key</span>`;
            } else {
                resWrap.innerHTML = `<div class="text-zinc-500 animate-pulse">Decrypting payload...</div>`;
                outputContainer.appendChild(resWrap);

                const pwd = args.trim().toUpperCase();
                const parts = pwd.split('-');
                if (parts.length !== 3 || parts[0] !== 'TS64') {
                    resWrap.innerHTML = `<span class="text-red-500">Access Denied: Invalid key format.</span>`;
                } else {
                    const id = parts[1];
                    const encryptedB64 = localStorage.getItem('TS64_STASH_' + id);

                    if (!encryptedB64) {
                        resWrap.innerHTML = `<span class="text-red-500">Access Denied: No data found.</span>`;
                    } else {
                        const decryptedPayload = await decryptData(encryptedB64, pwd);
                        if (!decryptedPayload) {
                            resWrap.innerHTML = `<span class="text-red-500 p-2 block border border-red-500/50 bg-red-500/10">Access Denied: Incorrect Key / Payload Corrupted</span>`;
                        } else {
                            const bins = decryptedPayload.split(' ');
                            let decodedHtml = `<div class="font-bold text-white mb-3 tracking-wider border-b border-white/10 pb-2">STASH DECRYPTED SUCCESSFULLY</div>`;

                            const englishPhrase = decodeBinaryBlocksToText(bins);

                            if (englishPhrase === null) {
                                decodedHtml += `<div class="text-red-500 p-2 block border border-red-500/50 bg-red-500/10">Decryption Failed: Binary parsing error</div>`;
                            } else {
                                decodedHtml += `<div class="text-sm text-zinc-500 mb-4">Sequence translated: <span class="text-white">${bins.length} BLOCKS</span></div>`;
                                decodedHtml += `<div class="mt-4 p-5 border border-white/20 bg-white/5 text-white font-mono text-base tracking-wide flex gap-3 items-start"><span class="shrink-0">></span> <span class="whitespace-pre-wrap break-words leading-relaxed">${englishPhrase.replace(/</g, "&lt;")}</span></div>`;
                            }

                            resWrap.innerHTML = decodedHtml;
                        }
                    }
                }
            }
        } else if (command === 'export') {
            if (!args) {
                resWrap.innerHTML = `<span class="text-red-500">Error: Missing password key</span>`;
            } else {
                const pwd = args.trim().toUpperCase();
                const parts = pwd.split('-');
                const id = parts[1];
                const encryptedB64 = localStorage.getItem('TS64_STASH_' + id);
                if (!encryptedB64) {
                    resWrap.innerHTML = `<span class="text-red-500">Export Failed: No stash found.</span>`;
                } else {
                    const blob = new Blob([encryptedB64], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `backup_${id}.ts64`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    resWrap.innerHTML = `<div class="text-white font-bold mb-2">BACKUP EXPORTED: backup_${id}.ts64</div>`;
                }
            }
        } else if (command === 'purge') {
            let wipedCount = 0;
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith('TS64_STASH_')) {
                    localStorage.removeItem(key);
                    wipedCount++;
                }
            }
            resWrap.innerHTML = `
                <div class="font-bold text-red-500 mb-2 border-b border-red-500/30 pb-2">DATA PURGED</div>
                <div class="text-zinc-500">Deleted ${wipedCount} items.</div>
            `;
        } else {
            resWrap.innerHTML = `<span class="text-zinc-500">Command not found: ${command}</span>`;
        }

        if (command !== 'clear') {
            if (!resWrap.parentNode) {
                outputContainer.appendChild(resWrap);
            }
        }

        inputEl.value = '';

        setTimeout(() => {
            mainEl.scrollTo({ top: mainEl.scrollHeight, behavior: 'auto' });
        }, 10);
    });

    // Initialize DRAG and DROP
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.activeTab !== 'terminal') return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (!file.name.endsWith('.ts64')) return;

            const id = file.name.split('_')[1]?.split('.')[0];
            if (!id) return;

            const reader = new FileReader();
            reader.onload = function (evt) {
                const encryptedB64 = evt.target.result.trim();
                localStorage.setItem('TS64_STASH_' + id, encryptedB64);

                const wrp = document.createElement('div');
                wrp.className = 'mt-2 mb-4 border-l border-white/20 pl-4 py-2 text-sm';
                wrp.innerHTML = `
                    <div class="font-bold text-white mb-2">BACKUP IMPORTED</div>
                    <div class="text-zinc-500">Key Restored: ${id}</div>
                `;
                outputContainer.appendChild(wrp);
                mainEl.scrollTop = mainEl.scrollHeight;
            };
            reader.readAsText(file);
        }
    });

}

// Start app
switchTab('terminal');

// Populate sidebar directory list
const sidebarExts = ['/etc', '/audio_stash', '/video_stash', '/usr', '/var'];
const sidebarHtml = sidebarExts.map(ext => `
    <div class="flex items-center gap-2 text-zinc-400 hover:text-white cursor-pointer transition-colors group">
        <span class="material-symbols-outlined text-xs group-hover:text-white">folder</span>
        <span>${ext}</span>
    </div>
`).join('');
document.getElementById('sidebar-nav').innerHTML = sidebarHtml;