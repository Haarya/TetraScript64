# 📓 Diary v2 — Interactive Upgrade Implementation Plan

**TetraScript64 | Menu Button + Date-Indexed Viewer + CRUD Operations**

> **Goals:**
> 1. Add a `Diary` button to the top navbar for quick access
> 2. When unlocking a diary (terminal `unlock` command), show **date list first** — not all text at once
> 3. Clicking a specific date reveals the entry text for that date
> 4. Make the diary section fully interactive: **Add, Delete, and Edit** entries

---

## Architecture Overview

```
  ┌──────────────────────────────────────────────────────┐
  │  NAVBAR                                              │
  │  Dashboard · Audio_Enc · Video_Enc · Diary · Terminal│ ← NEW: Diary tab
  │  · Help                                              │
  └──────────────────────────────────────────────────────┘
          ↓
  ┌──────────────────────────────────────────────────────┐
  │  renderDiaryTab()                                    │
  │  ┌────────────────────────────────────────────────┐  │
  │  │  + NEW DATE  │  DELETE ENTRY  │  EDIT / SAVE   │  │ ← CRUD toolbar
  │  │  Date rows: [2026-MAR-01], [2026-MAR-02], ...  │  │
  │  │  Click date → inline editor + save/delete btns │  │
  │  └────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────┘
          ↓
  ┌──────────────────────────────────────────────────────┐
  │  Terminal: unlock TS64-XXXX-XXXX                     │
  │  ┌────────────────────────────────────────────────┐  │
  │  │  Phase 1: Show DATE LIST only                  │  │
  │  │    [2026-MAR-01]  [2026-MAR-02]  [2026-MAR-03] │  │
  │  │                                                 │  │
  │  │  Phase 2: Click a date → text expands below    │  │
  │  │    > [2026-MAR-02]                             │  │
  │  │    Today I worked on the encryption engine...  │  │
  │  └────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────┘
```

---

## Step 1 — Add Diary Button to Top Navbar

**File:** `website/index.html` — lines 107-119

### Current Code:
```html
<nav class="hidden md:flex items-center gap-6 text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase h-full pt-1"
    id="main-nav">
    <a href="#" class="nav-link active h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="dashboard">Dashboard</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="audio">Audio_Enc</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="video">Video_Enc</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="terminal">Terminal</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="help">Help</a>
</nav>
```

### Replace With:
```html
<nav class="hidden md:flex items-center gap-6 text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase h-full pt-1"
    id="main-nav">
    <a href="#" class="nav-link active h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="dashboard">Dashboard</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="audio">Audio_Enc</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="video">Video_Enc</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="diary">Diary</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="terminal">Terminal</a>
    <a href="#" class="nav-link h-full flex items-center px-1 transition-colors hover:text-zinc-300"
        data-tab="help">Help</a>
</nav>
```

### What Changed:
- Added a new `<a>` link with `data-tab="diary"` **before** the Terminal tab
- The existing `switchTab('diary')` case in `app.js` already routes to `renderDiaryTab()`, so no JS wiring needed for the tab routing
- The nav highlight logic (`mainNavLinks.forEach`) already picks up all `.nav-link` elements dynamically

---

## Step 2 — Refactor the Terminal Diary Unlock to Show Date List First

**File:** `website/app.js` — inside the `unlock` command handler (lines ~2052-2103)

### Current Behavior:
When `unlock TS64-XXXX-XXXX` detects a diary key, it immediately renders **all entry texts** inline in the terminal output.

### New Behavior:
1. First render: show only the **date rows** (clickable) — no entry text visible
2. Clicking a date row **expands** that entry's text inline (toggle behavior)
3. Clicking again collapses it

### Current Code (lines 2083-2103):
```javascript
const sortedDates = Object.keys(diaryObj.entries).sort();
const rowsHtml = sortedDates.map(d => {
    const logDate = toLogDate(d);
    const text = diaryObj.entries[d].text || '(empty entry)';
    return `
    <div class="border-l-2 border-white pl-3 py-2 -ml-3 font-mono mt-1 mb-3">
        <div class="text-white text-sm font-bold mb-2">> [${logDate}]</div>
        <div class="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap">${text.replace(/</g, '&lt;')}</div>
    </div>`;
}).join('');

resWrap.innerHTML = `
    <div class="border border-white p-4 relative font-mono mt-2 mb-4">
        ...corner brackets...
        <h3 class="text-white font-bold tracking-widest uppercase mb-4 text-base">${diaryObj.name}</h3>
        <div class="text-zinc-500 text-xs mb-4">Author: ... | Entries: ... | Checksum: ...</div>
        <div class="space-y-2 relative">${rowsHtml}</div>
    </div>`;
```

### Replace With:
```javascript
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

        <div class="mt-4 pt-3 border-t border-white/10 flex gap-3">
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
        </div>
    </div>`;
```

---

## Step 3 — Add Delete Button for Diary Entries

**File:** `website/app.js` — inside `renderDiaryTab()` (lines ~842-851)

### Current Code (buttons in the selected date row):
```javascript
<div class="flex gap-2 mt-2">
    <button onclick="saveDiaryEntry()" id="diary-save-btn"
            class="bg-white text-black font-bold px-4 py-1.5 text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-colors">
        SAVE ENTRY
    </button>
    <button onclick="addDiaryEntry()"
            class="border border-white/30 text-white font-bold px-4 py-1.5 text-[10px] uppercase tracking-widest hover:border-white transition-colors">
        + NEW DATE
    </button>
</div>
```

### Replace With:
```javascript
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
```

---

## Step 4 — Add `deleteDiaryEntry()` Function

**File:** `website/app.js` — add after `saveDiaryEntry()` (after line ~1019)

```javascript
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
```

---

## Step 5 — Enhance "Add Entry" with Calendar-Style Date Picker

**File:** `website/app.js` — replace `addDiaryEntry()` (lines ~991-999)

### Current Code:
```javascript
window.addDiaryEntry = function () {
    const dateStr = prompt('Enter date for new entry (YYYY-MM-DD):', getTodayISO());
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    if (!diaryState.entries[dateStr]) {
        diaryState.entries[dateStr] = { text: '', stashed: false, checksum: '' };
    }
    diaryState.currentDate = dateStr;
    localStorage.setItem('ts64_diary_draft', JSON.stringify(diaryState));
    renderDiaryTab();
};
```

### Replace With:
```javascript
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
```

---

## Step 6 — Add Dashboard Quick Action for Diary

**File:** `website/app.js` — inside `renderDashboardTab()`, Quick Actions grid (line ~1222-1238)

### Current Code:
```javascript
<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
    <button onclick="switchTab('terminal')" ...>→ OPEN TERMINAL</button>
    <button onclick="switchTab('audio')" ...>→ ENCRYPT AUDIO</button>
    <button onclick="switchTab('video')" ...>→ ENCRYPT VIDEO</button>
</div>
```

### Replace With:
```javascript
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
```

---

## Step 7 — Add Diary Node Count to Dashboard Stat Cards

**File:** `website/app.js` — inside `renderDashboardTab()`, Stat Cards grid (lines ~1180-1201)

### Add this card after the Video Files card (before Total Stashes):
```javascript
<div class="border border-white/20 bg-black/40 p-4 flex flex-col gap-1 hover:border-white/40 transition-colors cursor-pointer"
     onclick="switchTab('diary')">
    <div class="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Diary Nodes</div>
    <div class="text-white text-3xl font-bold">${summary.diaryCount}</div>
    <div class="text-zinc-600 text-[10px]">encrypted diary vaults</div>
</div>
```

### Also change the grid from `grid-cols-4` to `grid-cols-5`:
```html
<div class="grid grid-cols-2 md:grid-cols-5 gap-4">
```

---

## Step 8 — Add Diary Count to Right Sidebar Vault Status

**File:** `website/app.js` — inside `renderDashboardTab()`, right sidebar (lines ~1254-1281)

### Add this row after Video Exported:
```javascript
<div class="flex justify-between text-zinc-500 uppercase tracking-widest">
    <span>Diary Nodes</span><span class="text-white font-bold">${summary.diaryCount}</span>
</div>
```

---

## Implementation Checklist

| Step | Task | File | Key Detail |
|------|------|------|------------|
| 1 | Add `Diary` tab to top navbar | `index.html:107-119` | `data-tab="diary"` link inserted between Video_Enc and Terminal |
| 2 | Refactor terminal unlock → date list first | `app.js:2083-2103` | Clickable date rows with expand/collapse, EXPAND ALL / COLLAPSE ALL buttons |
| 3 | Add DELETE button to diary entry toolbar | `app.js:842-851` | Red-themed delete button beside SAVE ENTRY and + NEW DATE |
| 4 | New `deleteDiaryEntry()` function | `app.js` (after ~1019) | Prevents deleting last entry, auto-switches to nearest date |
| 5 | Replace `prompt()` add with styled date picker | `app.js:991-999` | `<input type="date">` in a modal overlay with CREATE ENTRY + TODAY buttons |
| 6 | Add "CREATE DIARY NODE" quick action | `app.js:1222-1238` | 4th card in Dashboard Quick Actions grid |
| 7 | Add Diary Nodes stat card to dashboard | `app.js:1180-1201` | New card showing `diaryCount` |
| 8 | Add Diary Nodes row to sidebar vault status | `app.js:1254-1281` | New row under "Video Exported" |

---

## Design Notes

### Top Navbar Tab
- The `Diary` tab uses the same styling as all other nav tabs
- It sits between `Video_Enc` and `Terminal` — logically grouping creation tools before utility tools
- Clicking it calls `switchTab('diary')` which already has a handler — **zero new JS routing needed**

### Date-Indexed Unlock View
- Instead of dumping all text at once, the unlock shows compact date rows with metadata (word count, size)
- Each row has a **▶ / ▼ toggle arrow** for expand/collapse
- **EXPAND ALL** / **COLLAPSE ALL** buttons at the bottom for power users
- The `formatDisplayDate()` helper is reused to show human-readable dates like "Tuesday, 04 March 2026"

### CRUD Operations
- **Create**: `addDiaryEntry()` now shows a proper styled modal with `<input type="date">` instead of a browser `prompt()`
- **Read**: Clicking a date in the diary tab opens the inline editor (existing behavior, preserved)
- **Update**: The `saveDiaryEntry()` button persists changes to `diaryState` + `localStorage` (existing behavior, preserved)
- **Delete**: New `deleteDiaryEntry()` with confirmation dialog, prevents orphaning the diary by blocking deletion of the last entry

### localStorage Persistence
- All CRUD operations save to `localStorage` via `ts64_diary_draft` key (existing pattern)
- Delete operations also update localStorage immediately after removing the entry
