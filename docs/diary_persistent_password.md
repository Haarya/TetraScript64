# 🔐 Diary Persistent Password — Implementation Plan

**TetraScript64 | Fix: Diary password must remain constant across unlock → edit → re-encrypt cycles**

> **Created:** 2026-03-07
> **Status:** Planned
> **Priority:** Critical — Current behavior causes password confusion & potential data loss

---

## Problem Statement

### Current (Broken) Behavior
When a user performs the following workflow:

```
1. Create a diary → Write entries
2. Click "STASH DIARY NODE" → Diary is encrypted
3. A password (e.g. TS64-ABCD-1234) is generated & displayed → User saves it
4. Download .ts64diary file
5. Later, user drops the .ts64diary file back into the website
6. Enters TS64-ABCD-1234 → Diary decrypts successfully ✅
7. Clicks "OPEN IN EDITOR" → Edits some entries
8. Clicks "STASH DIARY NODE" again to re-encrypt
9. ❌ A BRAND NEW password (e.g. TS64-WXYZ-5678) is generated
10. A NEW .ts64diary file is downloaded — the old password NO LONGER works for the new file
```

**Result:** The user now has multiple `.ts64diary` files, each with a different password. They lose track of which password belongs to which file. If they discard the old file thinking the new one is an "update", they might forget the new password entirely.

### Root Cause Analysis

**File:** `website/app.js` — Line **1508** inside `window.encryptDiary`

```javascript
const pwd = generatePassword();  // ← NEW random password every time!
```

Every call to `encryptDiary()` invokes `generatePassword()`, which produces a completely fresh `TS64-XXXX-XXXX` string. There is:
- **No check** for whether this diary was previously encrypted with an existing password
- **No storage** of the original password in the diary metadata or `diaryState`
- **No prompt** asking the user to set/confirm their own password

Additionally, the `openDecryptedDiaryInEditor()` function (line 1444) loads the decrypted diary into `diaryState` but **does not carry forward** the password that was used to decrypt it.

### Desired Behavior
1. When a diary is **first created**, the user is **prompted to set their own password** (or can choose auto-generate)
2. That password is **bound to the diary for life** — every subsequent encrypt uses the same password
3. When a diary is **unlocked from a .ts64diary file**, the password used to unlock it is **remembered** for the session
4. When the user clicks "STASH DIARY NODE" on a previously-unlocked diary, it **re-encrypts with the original password** — no new password is generated
5. The password is **displayed clearly** at creation time so the user can store/remember it
6. The password is **never stored in plaintext** inside the `.ts64diary` file (security preserved)

---

## Architecture Overview

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    DIARY CREATION FLOW                       │
  │                                                              │
  │  User clicks "+ CREATE_NODE" → Modal opens                   │
  │       ↓                                                      │
  │  User enters Name, Author                                    │
  │       ↓                                                      │
  │  NEW: Password Setup Screen appears                          │
  │       ├── Option A: "Set your own password"                  │
  │       │     → Input: TS64-____-____                          │
  │       │     → Confirm: re-type password                      │
  │       └── Option B: "Auto-generate password"                 │
  │             → System generates TS64-XXXX-XXXX                │
  │             → Displayed with COPY button                     │
  │       ↓                                                      │
  │  Password stored in diaryState.password (in-memory only)     │
  │  Password hash stored in diaryState.passwordHash             │
  │       ↓                                                      │
  │  Diary editor opens with password locked in                  │
  └──────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │                  RE-ENCRYPTION FLOW                          │
  │                                                              │
  │  User clicks "STASH DIARY NODE"                              │
  │       ↓                                                      │
  │  encryptDiary() checks diaryState.password                   │
  │       ├── EXISTS → Use it directly (no new password)         │
  │       └── MISSING → Prompt user to set password (first time) │
  │       ↓                                                      │
  │  Encrypt with the persistent password                        │
  │  Download .ts64diary file                                    │
  │  Show confirmation (password displayed for reference)        │
  └──────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │                  UNLOCK → EDIT FLOW                          │
  │                                                              │
  │  User drops .ts64diary → enters password → UNLOCK            │
  │       ↓                                                      │
  │  unlockDiaryFromTab() decrypts successfully                  │
  │       ↓                                                      │
  │  Password stored in window._lastDecryptedDiaryPassword       │
  │       ↓                                                      │
  │  User clicks "OPEN IN EDITOR"                                │
  │       ↓                                                      │
  │  openDecryptedDiaryInEditor() transfers password to          │
  │  diaryState.password                                         │
  │       ↓                                                      │
  │  User edits entries → clicks "STASH DIARY NODE"              │
  │       ↓                                                      │
  │  encryptDiary() finds diaryState.password → reuses it ✅     │
  │  Same password, same file compatibility                      │
  └──────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Execution Plan

---

### Step 1 — Add `password` and `passwordHash` Fields to `diaryState`

**File:** `website/app.js` — Lines 15–21

**Why:** We need a place to hold the diary's persistent password in memory during the editing session. We also store a SHA-256 hash of the password inside the encrypted payload so we can verify it matches on unlock (defense-in-depth).

#### Current Code:
```javascript
const diaryState = {
    name: '',
    author: '',
    createdAt: null,
    entries: {},       // { "YYYY-MM-DD": { text: "", stashed: false, checksum: "" } }
    currentDate: null,
};
```

#### Replace With:
```javascript
const diaryState = {
    name: '',
    author: '',
    createdAt: null,
    entries: {},       // { "YYYY-MM-DD": { text: "", stashed: false, checksum: "" } }
    currentDate: null,
    password: null,        // The TS64-XXXX-XXXX password bound to this diary (in-memory only)
    passwordHash: null,    // SHA-256 hex hash of the password (stored inside encrypted payload)
};
```

Also update `resetDiaryState()` (lines 23–29):

#### Current Code:
```javascript
function resetDiaryState() {
    diaryState.name = '';
    diaryState.author = '';
    diaryState.createdAt = null;
    diaryState.entries = {};
    diaryState.currentDate = null;
}
```

#### Replace With:
```javascript
function resetDiaryState() {
    diaryState.name = '';
    diaryState.author = '';
    diaryState.createdAt = null;
    diaryState.entries = {};
    diaryState.currentDate = null;
    diaryState.password = null;
    diaryState.passwordHash = null;
}
```

---

### Step 2 — Add a Password Hashing Utility

**File:** `website/app.js` — Add after `formatDisplayDate()` (after line 47)

**Why:** We need a way to hash the password so we can store the hash (not the plaintext) inside the diary payload for verification purposes. This allows us to confirm the password matches without storing it in cleartext.

#### Add This Code:
```javascript
// ============================================================
// PASSWORD HASH UTILITY (for diary password verification)
// ============================================================
async function hashPassword(password) {
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(password));
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

---

### Step 3 — Add Password Validation Utility

**File:** `website/app.js` — Add directly after the `hashPassword` function from Step 2

**Why:** We need consistent validation of the `TS64-XXXX-XXXX` format wherever the user inputs a password.

#### Add This Code:
```javascript
function isValidTS64Password(pwd) {
    return /^TS64-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pwd);
}
```

---

### Step 4 — Create the Password Setup Modal

**File:** `website/app.js` — Add as a new function after the `isValidTS64Password` function from Step 3

**Why:** When a diary is first created, we need a UI for the user to either set their own password or auto-generate one. This replaces the old flow where the password was silently generated at encryption time.

#### Add This Code:
```javascript
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
```

---

### Step 5 — Modify `launchDiaryEditor()` to Require Password Setup

**File:** `website/app.js` — Lines 70–97

**Why:** The diary creation flow must now include a password setup step. Instead of immediately opening the editor after the user enters the diary name, we first show the password setup modal.

#### Current Code:
```javascript
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
    resetDiaryState();
    diaryState.name = name;
    diaryState.author = author;
    diaryState.createdAt = new Date().toISOString();
    diaryState.currentDate = getTodayISO();
    diaryState.entries[diaryState.currentDate] = { text: '', stashed: false, checksum: '' };
    localStorage.setItem('ts64_diary_draft', JSON.stringify(diaryState));
    closeCreateNodeModal();
    switchTab('diary');
};
```

#### Replace With:
```javascript
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
```

---

### Step 6 — Modify `encryptDiary()` to Use the Persistent Password

**File:** `website/app.js` — Lines 1480–1613

**Why:** This is the core fix. Instead of calling `generatePassword()` every time, `encryptDiary()` must use `diaryState.password` if it exists. If for some reason it doesn't exist (e.g., a draft diary from before the update), it prompts the user to set one.

#### Find This Line (Line 1508):
```javascript
        const pwd = generatePassword();
```

#### Replace The Entire `encryptDiary` Function With:
```javascript
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
```

---

### Step 7 — Carry Password Through on Unlock → Open in Editor

**File:** `website/app.js` — Two functions need changes

#### 7a. In `unlockDiaryFromTab()` — Store the Password After Successful Decryption

**Find** (around line 1385):
```javascript
        // Store the decrypted diary object globally so OPEN IN EDITOR can access it
        window._lastDecryptedDiary = diaryObj;
```

**Replace With:**
```javascript
        // Store the decrypted diary object AND the password globally
        // so OPEN IN EDITOR can carry them forward
        window._lastDecryptedDiary = diaryObj;
        window._lastDecryptedDiaryPassword = pwd;
```

#### 7b. In `openDecryptedDiaryInEditor()` — Transfer Password to diaryState

**Find** (lines 1444–1475):
```javascript
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

    // Save draft and re-render
    localStorage.setItem('ts64_diary_draft', JSON.stringify(diaryState));
    window._lastDecryptedDiary = null;
    _pendingDiaryFile = null;
    renderDiaryTab();
    renderSidebar();
};
```

**Replace With:**
```javascript
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
```

---

### Step 8 — Update the Diary Editor Sidebar to Show Password Status

**File:** `website/app.js` — Inside `renderDiaryTab()`, update the right sidebar's "ENCRYPT VAULT" section

**Why:** Users should see whether a password is already set for the diary, and what it is. This builds confidence that re-encrypting won't change the password.

#### Find (around line 1071–1081):
```javascript
        <div class="border-t border-white p-4 space-y-3 bg-[#030303] shrink-0">
            <div class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">ENCRYPT VAULT</div>
            <div class="text-zinc-600 text-[10px] leading-relaxed">
                Encrypt the entire diary node with AES-GCM 256-bit. All entries locked behind a single Access Key.
            </div>
            <button onclick="encryptDiary()"
                    class="w-full bg-white text-black font-bold py-2.5 text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-colors">
                STASH DIARY NODE
            </button>
            <div id="diary-encrypt-result" class="mt-1"></div>
        </div>`;
```

#### Replace With:
```javascript
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
```

---

### Step 9 — Handle Draft Recovery (Edge Case)

**File:** `website/app.js` — Wherever the draft is restored from `localStorage`

**Why:** When the page reloads, `diaryState` is re-populated from `localStorage` via `ts64_diary_draft`. Since we intentionally do NOT save the password to localStorage (for security), the `diaryState.password` will be `null` after a reload. This is handled in Step 6's fallback — `encryptDiary()` will prompt the user to enter their password if `diaryState.password` is null.

Search for the draft restore logic and ensure it doesn't break:

#### Find (search for `ts64_diary_draft` being read):
```javascript
// This is typically near the DOMContentLoaded handler or at the top of the file
```

Look for something like:
```javascript
const savedDraft = localStorage.getItem('ts64_diary_draft');
if (savedDraft) {
    try {
        Object.assign(diaryState, JSON.parse(savedDraft));
    } catch {}
}
```

If this code exists, ensure the `password` field is not lost. Add after the `Object.assign`:
```javascript
        // password is never stored in localStorage for security.
        // It will be re-entered by user when they encrypt.
        diaryState.password = null;
```

If no draft restore code exists yet, no change is needed — the fallback in `encryptDiary()` handles it.

---

### Step 10 — Update the Terminal `unlock` Command (if it exists for diary)

**File:** `website/app.js` — Search for the `unlock` command handler in the terminal

**Why:** If users unlock diaries via the terminal's `unlock TS64-XXXX-XXXX` command, we need to make sure that flow also carries the password forward.

Search for the terminal command handler that matches `unlock` + diary detection logic. The password (`pwd`) used during terminal unlock should be stored similarly:

```javascript
window._lastDecryptedDiaryPassword = pwd;
```

This ensures that if the user unlocks via terminal and then switches to the diary tab, the password is still available.

---

## Summary of All Changes

| Step | File | What Changes | Lines Affected |
|------|------|-------------|----------------|
| 1 | `app.js` | Add `password` and `passwordHash` to `diaryState` + `resetDiaryState()` | 15–29 |
| 2 | `app.js` | Add `hashPassword()` utility | New code after line 47 |
| 3 | `app.js` | Add `isValidTS64Password()` utility | New code after Step 2 |
| 4 | `app.js` | Add password setup modal (`showDiaryPasswordSetup`, `switchPwdTab`, `confirmDiaryPassword`) | New code after Step 3 |
| 5 | `app.js` | Modify `launchDiaryEditor()` to show password modal before creating diary | 70–97 |
| 6 | `app.js` | **Core fix:** Modify `encryptDiary()` to use `diaryState.password` instead of `generatePassword()` | 1480–1613 |
| 7a | `app.js` | Store password in `window._lastDecryptedDiaryPassword` after successful unlock | ~1385 |
| 7b | `app.js` | Transfer password to `diaryState` in `openDecryptedDiaryInEditor()` | 1444–1475 |
| 8 | `app.js` | Show password status + locked indicator in diary sidebar | 1071–1081 |
| 9 | `app.js` | Handle draft recovery (password stays null, re-prompted on encrypt) | Draft restore section |
| 10 | `app.js` | Carry password forward through terminal `unlock` command | Terminal handler |

---

## Security Considerations

| Concern | How It's Handled |
|---------|-----------------|
| Password stored in plaintext in localStorage? | **NO** — Password is only in `diaryState` (in-memory). It is explicitly removed before saving to `ts64_diary_draft` in localStorage. |
| Password stored in the .ts64diary file? | **NO** — Only a SHA-256 hash of the password is stored inside the encrypted JSON payload. An attacker who somehow decrypts the file cannot extract the password from the hash (pre-image resistance). |
| Password survives page reload? | **NO** — By design. If the user refreshes, they must re-enter their password when they next encrypt. This is the secure trade-off (session-only memory). |
| Random salt per encryption? | **YES** — A new random `salt` and `iv` is generated for every encryption, even with the same password. This means the ciphertext changes even if the content and password are identical (no deterministic encryption). |
| Backward compatibility? | **YES** — Old `.ts64diary` files (without `passwordHash` in the payload) can still be decrypted normally. The system simply won't have a hash to verify against, but decryption still works. |

---

## Testing Checklist

- [ ] **New diary creation**: Verify password setup modal appears after entering name/author
- [ ] **Custom password**: Set a custom `TS64-XXXX-XXXX` password, verify it's displayed correctly
- [ ] **Auto-generated password**: Choose auto-generate, verify the password is shown and copyable
- [ ] **Password confirmation**: Verify mismatched passwords are rejected, empty passwords are rejected
- [ ] **First encryption**: Stash the diary, verify the password shown matches what was set during creation
- [ ] **Download**: Verify `.ts64diary` file downloads with the correct naming
- [ ] **Unlock with original password**: Drop the `.ts64diary` file, enter the original password, verify it decrypts
- [ ] **Open in Editor**: Click "OPEN IN EDITOR", verify diary loads into editor
- [ ] **Re-encrypt**: Click "STASH DIARY NODE" again, verify the ACCESS KEY shown is the **SAME** as the original
- [ ] **New download works with old password**: Download the re-encrypted `.ts64diary`, unlock it with the original password → must work
- [ ] **Sidebar shows password status**: Verify the green "✓ PASSWORD LOCKED" indicator appears in the sidebar when a password is set
- [ ] **Page reload**: Refresh the page, go to diary tab, try to encrypt — verify it prompts for password (since it was lost from memory)
- [ ] **Legacy drafts**: If a draft from before this update exists in localStorage, verify encrypting it prompts for a password
- [ ] **Terminal unlock**: Use `unlock TS64-XXXX-XXXX` in terminal, then switch to diary tab and edit — verify re-encryption uses the same password
