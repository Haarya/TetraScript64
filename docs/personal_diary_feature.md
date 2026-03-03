# 📓 Personal Diary Feature — Implementation Plan (v2 — Stitch UI)
**TetraScript64 | Encrypted Diary via `+ CREATE_NODE`**

> Updated to match the reference UI in `stitch_tetrascript64_terminal_ui/code.html`.
>
> Key UI elements from that design:
> - **Center**: `NODE_HISTORY.LOG | Personal Diary Repository` title, bordered container with corner bracket accents, date rows shown as `[YYYY-MON-DD]`, stashed/encrypted entry rows appear inverted (white-on-black) with metadata
> - **Right sidebar**: `TEMPORAL TOPOLOGY` — vertical spine line with month labels, dot markers per entry, node status tags (`NODE_YYYYMMDD: STABLE / PENDING`) for encrypted entries
> - **Left sidebar**: Directory tree with `/root/diary_vault` as active node path

---

## Architecture Overview

```
+ CREATE_NODE (footer)
        ↓
  Modal: Name the diary
        ↓
  switchTab('diary') — NODE_HISTORY.LOG view
        ↓
  Click a date row → inline editor expands
        ↓
  diaryState.entries updated in memory
        ↓
  STASH DIARY NODE button
        ↓
  AES-GCM 256-bit encryption (existing engine)
        ↓
  IndexedDB: TS64_DIARY_{id}
        ↓
  Access Key shown, rows flip to [STASHED] state
        ↓
  unlock_diary {key} in Terminal
```

---

## Step 1 — Wire the `+ CREATE_NODE` Footer Button

**File:** `website/index.html` — line 174

Find:
```html
<span class="text-white hover:text-zinc-300 cursor-pointer transition-colors">+ CREATE_NODE</span>
```

Replace with:
```html
<span
  id="create-node-btn"
  class="text-white hover:text-zinc-300 cursor-pointer transition-colors"
  onclick="openCreateNodeModal()">+ CREATE_NODE</span>
```

---

## Step 2 — Add the Diary Modal HTML

**File:** `website/index.html` — paste before `<!-- MAIN JAVASCRIPT APP -->`

```html
<div id="create-node-modal"
     class="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center hidden"
     onclick="if(event.target===this) closeCreateNodeModal()">
  <div class="bg-[#030303] border border-white w-full max-w-lg mx-4"
       style="font-family:'JetBrains Mono',monospace;">

    <div class="flex items-center justify-between border-b border-white px-5 py-4">
      <div>
        <div class="text-white font-bold tracking-widest text-sm uppercase">CREATE_NODE</div>
        <div class="text-gray-500 text-[10px] tracking-widest mt-0.5">/ root / nodes / new_diary_vault</div>
      </div>
      <button onclick="closeCreateNodeModal()" class="text-gray-600 hover:text-white font-bold text-lg">X</button>
    </div>

    <div class="p-5 space-y-3">
      <div class="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase mb-3">SELECT NODE TYPE</div>
      <div onclick="selectNodeType('diary')"
           class="border border-white/40 hover:border-white p-4 cursor-pointer transition-colors flex items-center gap-3">
        <span class="material-symbols-outlined text-white text-xl">book</span>
        <div>
          <div class="text-white font-bold text-xs tracking-widest">PERSONAL DIARY</div>
          <div class="text-gray-500 text-[10px] mt-0.5">Date-indexed encrypted journal node. AES-GCM 256-bit.</div>
        </div>
      </div>
    </div>

    <div id="diary-config-form" class="hidden px-5 pb-5 border-t border-white/10">
      <div class="pt-4 space-y-3">
        <div>
          <label class="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Node Name</label>
          <input type="text" id="diary-name-input" placeholder="e.g. Personal Journal"
                 class="w-full bg-black border border-white/30 focus:border-white text-white px-3 py-2 text-xs font-mono outline-none transition-colors"
                 autocomplete="off"/>
        </div>
        <div>
          <label class="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Author Tag (optional)</label>
          <input type="text" id="diary-author-input" placeholder="e.g. ROOT_ADMIN"
                 class="w-full bg-black border border-white/30 focus:border-white text-white px-3 py-2 text-xs font-mono outline-none transition-colors"
                 autocomplete="off"/>
        </div>
        <button onclick="launchDiaryEditor()"
                class="w-full bg-white text-black font-bold py-3 text-xs uppercase tracking-widest hover:bg-gray-200 transition-colors">
          INITIALIZE NODE
        </button>
      </div>
    </div>

  </div>
</div>
```

---

## Step 3 — Diary State Object & Date Helpers

**File:** `website/app.js` — add after the `state` object (around line 10)

```javascript
// ============================================================
// DIARY STATE (in-memory, pre-encryption)
// ============================================================
const diaryState = {
    name: '',
    author: '',
    createdAt: null,
    entries: {},       // { "YYYY-MM-DD": { text: "", stashed: false, checksum: "" } }
    currentDate: null,
};

function resetDiaryState() {
    diaryState.name = '';
    diaryState.author = '';
    diaryState.createdAt = null;
    diaryState.entries = {};
    diaryState.currentDate = null;
}

function getTodayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// "2026-03-03" → "2026-MAR-03"  (matches NODE_HISTORY.LOG format)
function toLogDate(isoDate) {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const [y, m, d] = isoDate.split('-');
    return `${y}-${months[parseInt(m, 10) - 1]}-${d}`;
}

// "2026-03-03" → "Tuesday, 03 March 2026"
function formatDisplayDate(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}
```

---

## Step 4 — Modal Control Functions

**File:** `website/app.js`

```javascript
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
    const author = document.getElementById('diary-author-input').value.trim() || 'ROOT_ADMIN';
    resetDiaryState();
    diaryState.name      = name;
    diaryState.author    = author;
    diaryState.createdAt = new Date().toISOString();
    diaryState.currentDate = getTodayISO();
    diaryState.entries[diaryState.currentDate] = { text: '', stashed: false, checksum: '' };
    closeCreateNodeModal();
    switchTab('diary');
};
```

---

## Step 5 — Diary Editor Tab (NODE_HISTORY.LOG — Stitch UI)

**File:** `website/app.js`

### 5a. Add `case 'diary'` to `switchTab()`:
```javascript
case 'diary': renderDiaryTab(); break;
```

### 5b. Full `renderDiaryTab()`:

```javascript
// ============================================================
// DIARY EDITOR TAB  (NODE_HISTORY.LOG stitch UI)
// ============================================================
function renderDiaryTab() {
    if (!diaryState.name) {
        mainContent.innerHTML = `
        <div class="flex items-center justify-center h-full text-gray-600 text-sm tracking-widest font-mono">
            <div class="text-center">
                <div class="text-3xl mb-4">📓</div>
                <div>No diary node active.</div>
                <div class="mt-2">Click <span class="text-white font-bold">+ CREATE_NODE</span> to initialize one.</div>
            </div>
        </div>`;
        rightSidebar.innerHTML = '';
        return;
    }

    const sortedDates = Object.keys(diaryState.entries).sort();

    // ── Center: date rows ──────────────────────────────────────
    const rowsHtml = sortedDates.map(d => {
        const entry      = diaryState.entries[d];
        const logDate    = toLogDate(d);
        const isSelected = d === diaryState.currentDate;
        const isStashed  = entry.stashed;

        if (isStashed) {
            const shortCheck = entry.checksum ? entry.checksum.substring(0, 8).toUpperCase() + '...' : 'N/A';
            const sizeKb     = Math.ceil((entry.text.length * 2) / 1024) || 1;
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
            <div class="border-l-2 border-white pl-3 py-2 -ml-3 font-mono">
                <div class="flex items-center justify-between text-white text-sm font-bold mb-2 cursor-pointer"
                     onclick="switchDiaryDate('${d}')">
                    <span>&gt; [${logDate}]</span>
                    <span class="text-[10px] text-gray-500 font-normal">${formatDisplayDate(d)}</span>
                </div>
                <textarea id="diary-editor"
                    class="w-full bg-black border border-white/20 text-gray-200 p-3 font-mono text-xs leading-relaxed resize-none outline-none focus:border-white transition-colors"
                    rows="8"
                    placeholder="Write entry for ${logDate}..."
                    spellcheck="true">${entry.text}</textarea>
                <div class="flex gap-2 mt-2">
                    <button onclick="saveDiaryEntry()" id="diary-save-btn"
                            class="bg-white text-black font-bold px-4 py-1.5 text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-colors">
                        SAVE ENTRY
                    </button>
                    <button onclick="addDiaryEntry()"
                            class="border border-white/30 text-white font-bold px-4 py-1.5 text-[10px] uppercase tracking-widest hover:border-white transition-colors">
                        + NEW DATE
                    </button>
                </div>
            </div>`;
        }

        return `
        <div class="text-gray-400 hover:text-white text-sm font-mono py-0.5 cursor-pointer transition-colors"
             onclick="switchDiaryDate('${d}')">[${logDate}]</div>`;
    }).join('');

    mainContent.innerHTML = `
    <div class="p-8 overflow-auto h-full font-mono">

        <!-- Breadcrumb -->
        <div class="flex items-center text-sm text-gray-400 mb-6">
            <span>root</span>
            <span class="mx-2 text-gray-700">/</span>
            <span class="text-white font-bold">root/nodes/diary_vault</span>
            <div class="ml-auto w-3 h-5 bg-black border border-white"></div>
        </div>

        <h1 class="text-xl font-bold mb-6 tracking-wide">
            NODE_HISTORY.LOG | ${diaryState.name}
        </h1>

        <!-- Corner-bracket bordered container -->
        <div class="border border-white p-2 relative min-h-64">
            <div class="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-white"></div>
            <div class="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-white"></div>
            <div class="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-white"></div>
            <div class="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-white"></div>

            <div class="p-4 space-y-1">
                ${rowsHtml || '<div class="text-gray-700 text-xs">No entries yet. Click + NEW DATE to begin.</div>'}
            </div>
        </div>

        <!-- Terminal caret -->
        <div class="mt-6 flex items-center font-mono text-sm text-gray-400">
            <span class="mr-2">tetrascript64@system:~$</span>
            <span class="w-2.5 h-5 bg-white animate-pulse"></span>
        </div>
    </div>`;

    // Wire textarea to state
    const editor = document.getElementById('diary-editor');
    if (editor) {
        editor.addEventListener('input', () => {
            diaryState.entries[diaryState.currentDate].text = editor.value;
        });
        editor.focus();
    }

    // ── Right sidebar: TEMPORAL TOPOLOGY ──────────────────────
    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
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
            const entry      = diaryState.entries[d];
            const dayNum     = d.split('-')[2];
            const isStashed  = entry.stashed;
            const isSelected = d === diaryState.currentDate;
            const nodeId     = `NODE_${d.replace(/-/g, '')}`;

            if (isStashed) {
                return `
                <div class="flex items-center relative my-1.5 cursor-pointer" onclick="switchDiaryDate('${d}')">
                    <div class="absolute -left-[9px] w-2 h-2 ${isSelected ? 'bg-white' : 'bg-black'} border border-white z-10"></div>
                    <div class="ml-4 ${isSelected ? 'bg-white text-black' : 'bg-black text-white'} border border-white text-[10px] px-2 py-0.5 whitespace-nowrap z-20 font-bold">
                        ${nodeId}: STABLE
                    </div>
                    <div class="absolute left-0 w-4 h-px bg-white"></div>
                </div>`;
            }

            if (isSelected) {
                return `
                <div class="flex items-center relative my-1 cursor-pointer" onclick="switchDiaryDate('${d}')">
                    <div class="absolute -left-[9px] w-2 h-2 bg-white border border-white z-10"></div>
                    <span class="w-2 h-px bg-white -ml-4 mr-2"></span>
                    <span class="text-white font-bold text-[10px]">${dayNum}</span>
                </div>`;
            }

            return `
            <div class="flex items-center cursor-pointer hover:text-white transition-colors" onclick="switchDiaryDate('${d}')">
                <span class="w-2 h-px bg-gray-700 -ml-4 mr-2"></span>
                <span class="text-[10px]">${dayNum}</span>
            </div>`;
        }).join('');

        return `
        <div class="relative mb-8">
            <span class="absolute -left-2 text-gray-400 font-bold text-[10px]">${mon}</span>
            <div class="ml-10 pl-4 space-y-1 text-gray-500">${daysHtml}</div>
        </div>`;
    }).join('');

    rightSidebar.innerHTML = `
        <div class="h-12 border-b border-white flex items-center justify-between px-4 bg-[#030303]">
            <span class="text-xs font-bold tracking-widest uppercase">Temporal Topology</span>
            <span class="material-symbols-outlined text-sm text-gray-500">radio_button_checked</span>
        </div>
        <div class="flex-1 p-6 overflow-y-auto relative font-mono text-xs"
             style="background-image:radial-gradient(#222 1px,transparent 1px);background-size:20px 20px;">
            <div class="absolute left-10 top-0 bottom-0 w-px bg-gray-800"></div>
            ${timelineHtml || '<div class="text-gray-700 ml-10 mt-4 text-[10px]">No entries yet.</div>'}
        </div>
        <div class="border-t border-white p-4 space-y-3 bg-[#030303]">
            <div class="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">ENCRYPT VAULT</div>
            <div class="text-gray-600 text-[10px] leading-relaxed">
                Encrypt the entire diary node with AES-GCM 256-bit. All entries locked behind a single Access Key.
            </div>
            <button onclick="encryptDiary()"
                    class="w-full bg-white text-black font-bold py-2.5 text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-colors">
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
    renderDiaryTab();
};

// Add a new dated entry
window.addDiaryEntry = function () {
    const dateStr = prompt('Enter date for new entry (YYYY-MM-DD):', getTodayISO());
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    if (!diaryState.entries[dateStr]) {
        diaryState.entries[dateStr] = { text: '', stashed: false, checksum: '' };
    }
    diaryState.currentDate = dateStr;
    renderDiaryTab();
};

// Save current entry
window.saveDiaryEntry = function () {
    const editor = document.getElementById('diary-editor');
    if (editor) diaryState.entries[diaryState.currentDate].text = editor.value;
    const btn = document.getElementById('diary-save-btn');
    if (btn) {
        btn.textContent = 'SAVED';
        setTimeout(() => { btn.textContent = 'SAVE ENTRY'; }, 1200);
    }
};
```

---

## Step 6 — Diary Encryption

**File:** `website/app.js`

### 6a. Update `getStats()` return (line ~94):
```javascript
// BEFORE:
return s || { text: 0, audio: 0, video: 0 };
// AFTER:
return s || { text: 0, audio: 0, video: 0, diary: 0 };
```

### 6b. Add `encryptDiary()`:

```javascript
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

    const allText    = Object.values(diaryState.entries).map(e => e.text).join(' ');
    const totalWords = allText.trim().split(/\s+/).filter(Boolean).length;
    if (totalWords === 0) {
        resultEl.innerHTML = `<span class="text-red-500 text-[10px]">Error: No content to encrypt.</span>`;
        return;
    }

    resultEl.innerHTML = `<div class="text-gray-500 text-[10px] animate-pulse tracking-widest">ENCRYPTING NODE...</div>`;

    try {
        const diaryPayload = {
            name: diaryState.name,
            author: diaryState.author,
            createdAt: diaryState.createdAt,
            encryptedAt: new Date().toISOString(),
            entries: diaryState.entries,
        };
        const diaryJSON    = JSON.stringify(diaryPayload);
        const pwd          = generatePassword();
        const id           = pwd.split('-')[1];
        const payloadBytes = new TextEncoder().encode(diaryJSON);

        // SHA-256 checksum for display in stashed rows
        const hashBuf  = await crypto.subtle.digest('SHA-256', payloadBytes);
        const hashHex  = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
        const checksum = hashHex.substring(0, 8).toUpperCase();

        // Chunked AES-GCM encrypt into IndexedDB
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key  = await deriveKey(pwd, salt);

        const hdr = new Uint8Array(28);
        hdr.set([0x54, 0x53, 0x36, 0x34], 0);
        hdr.set(salt, 4);
        new DataView(hdr.buffer).setBigUint64(20, BigInt(payloadBytes.byteLength), true);
        await dbSet('TS64_DIARY_' + id + '_header', hdr);

        let offset = 0, chunkIndex = 0;
        while (offset < payloadBytes.byteLength) {
            const chunk = payloadBytes.slice(offset, offset + CHUNK_SIZE);
            const iv    = crypto.getRandomValues(new Uint8Array(12));
            const ct    = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, chunk);
            const env   = new Uint8Array(20 + ct.byteLength);
            const cv    = new DataView(env.buffer);
            cv.setUint32(0, chunkIndex, true);
            env.set(iv, 4);
            cv.setUint32(16, ct.byteLength, true);
            env.set(new Uint8Array(ct), 20);
            await dbSet(`TS64_DIARY_${id}_chunk_${chunkIndex}`, env);
            offset += CHUNK_SIZE;
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
            diaryState.entries[d].stashed  = true;
            diaryState.entries[d].checksum = checksum;
        });

        renderDiaryTab();

        // Show key card
        const res2 = document.getElementById('diary-encrypt-result');
        if (res2) res2.innerHTML = `
            <div class="border border-white bg-black p-3 space-y-2 font-mono mt-2">
                <div class="text-white font-bold text-[10px] tracking-widest border-b border-white/20 pb-2">NODE STASHED</div>
                <div class="text-gray-500 text-[10px]">Entries: <span class="text-white">${Object.keys(diaryState.entries).length}</span></div>
                <div class="text-gray-500 text-[10px]">Checksum: <span class="text-white">${checksum}...</span></div>
                <div class="border border-white/40 p-3 text-center cursor-pointer mt-2 hover:border-white transition-colors"
                     onclick="navigator.clipboard.writeText('${pwd}'); this.querySelector('.ch').textContent='COPIED!'; setTimeout(()=>this.querySelector('.ch').textContent='CLICK TO COPY',2000);">
                    <div class="text-[10px] text-gray-500 mb-1">ACCESS KEY — SAVE THIS</div>
                    <div class="text-white font-bold font-mono tracking-widest">${pwd}</div>
                    <div class="ch text-[9px] text-gray-600 mt-1">CLICK TO COPY</div>
                </div>
                <div class="text-[10px] text-gray-600 leading-relaxed">
                    Terminal: <span class="text-white font-bold">unlock_diary ${pwd}</span>
                </div>
            </div>`;

        renderSidebar();
    } catch (err) {
        resultEl.innerHTML = `<span class="text-red-500 text-[10px]">Fault: ${err.message}</span>`;
    }
};
```

---

## Step 7 — Terminal Command: `unlock_diary {key}`

**File:** `website/app.js` — inside the command handler, after the `unlock_video` block

```javascript
} else if (command === 'unlock_diary') {
    if (!args) {
        resWrap.innerHTML = `<span class="text-red-500">Error: Usage — unlock_diary TS64-XXXX-XXXX</span>`;
    } else {
        const pwd = args.trim().toUpperCase();
        const kp  = pwd.split('-');
        if (kp.length !== 3 || kp[0] !== 'TS64') {
            resWrap.innerHTML = `<span class="text-red-500">Access Denied: Invalid key format.</span>`;
        } else {
            const id = kp[1];
            resWrap.innerHTML = `<div class="text-gray-500 animate-pulse text-xs tracking-widest font-mono">Decrypting diary node...</div>`;
            outputContainer.appendChild(resWrap);
            try {
                const meta = await dbGet('TS64_DIARY_' + id);
                if (!meta || meta.type !== 'diary') throw new Error('No diary node found for this key.');

                const hdrRaw = await dbGet('TS64_DIARY_' + id + '_header');
                if (!hdrRaw) throw new Error('Diary header missing from vault.');

                const hdrArr = new Uint8Array(hdrRaw.buffer || hdrRaw);
                const salt   = hdrArr.slice(4, 20);
                const aesKey = await deriveKey(pwd, salt);

                const decParts = [];
                for (let i = 0; i < meta.chunkCount; i++) {
                    const envRaw = await dbGet(`TS64_DIARY_${id}_chunk_${i}`);
                    if (!envRaw) throw new Error(`Chunk ${i} missing.`);
                    const ev    = new Uint8Array(envRaw.buffer || envRaw);
                    const iv    = ev.slice(4, 16);
                    const ctLen = new DataView(ev.buffer, ev.byteOffset + 16, 4).getUint32(0, true);
                    const ct    = ev.slice(20, 20 + ctLen);
                    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
                    decParts.push(new Uint8Array(plain));
                }

                const totalLen = decParts.reduce((s, p) => s + p.byteLength, 0);
                const merged   = new Uint8Array(totalLen);
                let pos = 0;
                for (const p of decParts) { merged.set(p, pos); pos += p.byteLength; }

                const diary    = JSON.parse(new TextDecoder().decode(merged));
                const MONTHS   = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                const dates    = Object.keys(diary.entries).sort();

                const rowsHtml = dates.map(d => {
                    const [y, m, day] = d.split('-');
                    const logDate     = `${y}-${MONTHS[parseInt(m,10)-1]}-${day}`;
                    const entry       = diary.entries[d];
                    const text        = typeof entry === 'string' ? entry : (entry.text || '');
                    const hasText     = text.trim().length > 0;
                    const sizeKb      = Math.ceil((text.length * 2) / 1024) || 1;
                    const chk         = (entry.checksum || meta.checksum || 'N/A').substring(0, 8);

                    return hasText ? `
                    <div class="bg-white text-black px-3 py-1.5 -mx-3 flex items-start font-mono text-sm">
                        <span class="mr-2 font-bold shrink-0">&gt;</span>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold">[${logDate}] [STASHED] &gt; Metadata: ${sizeKb}KB, Checksum: ${chk}...</div>
                            <div class="text-gray-700 text-xs mt-1 whitespace-pre-wrap break-words">
                                ${text.replace(/</g,'&lt;').substring(0, 300)}${text.length > 300 ? '…' : ''}
                            </div>
                        </div>
                        <span class="ml-2 shrink-0">&lt;</span>
                    </div>` :
                    `<div class="text-gray-400 text-sm font-mono py-0.5">[${logDate}]</div>`;
                }).join('');

                resWrap.innerHTML = `
                <div class="border border-white font-mono">
                    <div class="border-b border-white px-5 py-3 flex justify-between items-center">
                        <div>
                            <div class="text-white font-bold tracking-widest text-sm">📓 NODE_HISTORY.LOG | ${diary.name.replace(/</g,'&lt;')}</div>
                            <div class="text-gray-500 text-[10px] mt-0.5">by ${diary.author} · ${dates.length} entries · ${meta.totalWords} words</div>
                        </div>
                        <div class="text-[10px] text-gray-600 border border-white/20 px-2 py-1 text-right">
                            AES-GCM-256<br>DECRYPTED
                        </div>
                    </div>
                    <div class="border border-white relative p-2 m-3">
                        <div class="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-white"></div>
                        <div class="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-white"></div>
                        <div class="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-white"></div>
                        <div class="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-white"></div>
                        <div class="p-3 space-y-1 max-h-96 overflow-y-auto">
                            ${rowsHtml}
                        </div>
                    </div>
                </div>`;

            } catch (err) {
                resWrap.innerHTML = `<span class="text-red-500 p-2 block border border-red-500/40 bg-red-500/10 text-xs font-mono">
                    Access Denied: ${err.message}
                </span>`;
            }
            inputEl.value = ''; updateInputUI();
            setTimeout(() => mainEl.scrollTo({ top: mainEl.scrollHeight }), 50);
            return;
        }
    }
```

**Also add to both help arrays (`renderHelpTab()` and terminal `help` command):**
```javascript
['unlock_diary {key}', 'Decrypt and view an encrypted diary node in the terminal.'],
```

---

## Step 8 — Sidebar, Stats & Dashboard Updates

**File:** `website/app.js`

### 8a. `getVaultSummary()` return — add:
```javascript
diaryCount: stats.diary || 0,
```

### 8b. `renderSidebar()` folders array — add:
```javascript
{ icon: 'book', label: '/diary_vault', count: summary.diaryCount, tab: 'diary' },
```

### 8c. Dashboard stat cards — add:
```html
<div class="border border-white/20 bg-black/40 p-4 flex flex-col gap-1 hover:border-white/40 transition-colors cursor-pointer"
     onclick="switchTab('diary')">
    <div class="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Diary Nodes</div>
    <div class="text-white text-3xl font-bold">${summary.diaryCount}</div>
    <div class="text-zinc-600 text-[10px]">encrypted diary vaults</div>
</div>
```

### 8d. Dashboard Quick Actions — add:
```html
<button onclick="openCreateNodeModal()"
    class="border border-white/20 bg-black/40 p-4 text-left hover:border-white/50 transition-colors group">
    <div class="text-white font-bold text-xs tracking-widest group-hover:text-zinc-300">→ CREATE DIARY NODE</div>
    <div class="text-zinc-600 text-[10px] mt-1">Date-indexed encrypted journal vault</div>
</button>
```

---

## Implementation Checklist

| Step | Task | File | Key Detail |
|------|------|------|------------|
| ✅ 1 | Wire `+ CREATE_NODE` button | `index.html:174` | `onclick="openCreateNodeModal()"` |
| ✅ 2 | Add diary creation modal | `index.html` | Terminal-style, monospace, border-white |
| ✅ 3 | `diaryState`, `toLogDate()`, `formatDisplayDate()` | `app.js` | `[YYYY-MON-DD]` format |
| ✅ 4 | Modal control functions | `app.js` | `openCreateNodeModal`, `launchDiaryEditor` |
| ✅ 5 | `renderDiaryTab()` — Stitch UI | `app.js` | NODE_HISTORY.LOG + corner brackets + TEMPORAL TOPOLOGY |
| ✅ 6 | `encryptDiary()` — rows flip to STASHED | `app.js` | White-on-black row + checksum + IndexedDB |
| ✅ 7 | `unlock_diary` terminal command | `app.js` | In-terminal diary viewer with corner brackets |
| ✅ 8 | Sidebar `/diary_vault`, dashboard card | `app.js` | `diaryCount` in stats |

---

## Design Notes

**`[YYYY-MON-DD]` log format** — the `toLogDate()` helper converts ISO dates to the format shown in the stitch reference (`2026-MAR-03`).

**Stashed row flip** — after `encryptDiary()` completes, all `diaryState.entries[d].stashed` flags are set to `true`. `renderDiaryTab()` is called immediately, turning dim gray date rows into the white-on-black `[STASHED]` rows with checksum metadata.

**TEMPORAL TOPOLOGY spine** — built dynamically from `diaryState.entries`, grouped by month. Only entries marked `stashed: true` get the `NODE_YYYYMMDD: STABLE` tag in the timeline. The dotted background matches the stitch reference (`radial-gradient` CSS).

**Encryption reuse** — `deriveKey()`, `CHUNK_SIZE` chunked loop, `generatePassword()`, `incrementStat()`, `dbSet()` are all reused verbatim. The only difference from text stash is the `TS64_DIARY_*` key prefix.

**Access Key shown once** — shown immediately after encryption in the right sidebar. User must copy it before switching tabs. This is consistent with the rest of TetraScript64's zero-knowledge design.
