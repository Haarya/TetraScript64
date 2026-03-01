# Fixing Video Encryption & Decryption Bugs — Complete Plan

> **Date:** 2026-03-02  
> **Status:** Ready to implement  
> **Scope:** All video encrypt/decrypt paths across Terminal, Video Tab, and Drag-and-Drop

---

## Root Cause Analysis

After auditing every video-related code path in `app.js`, there are **3 distinct bugs**, each with a different root cause. They compound on each other to make video encryption feel completely broken.

---

### Bug 1: `showSaveFilePicker` — "Must be handling a user gesture"

**Error:**
```
Encryption Fault: Failed to execute 'showSaveFilePicker' on 'Window':
Must be handling a user gesture to show a file picker.
```

**Where it happens:**
- **Video Tab → Drop Zone** (`handleMediaFile` at line ~592)  
  When a user **drops** a video file onto the Video tab, the `ondrop` handler calls `handleMediaFile()` which immediately calls `showSaveFilePicker()`. However, Chrome considers the `drop` event as a **transient user activation** that expires very quickly. If the browser is busy (large file, slow system), the gesture may expire before `showSaveFilePicker` is called.
  
- **Video Tab → Restore Zone** (`handleVideoRestoreDrop` / `handleVideoRestoreInputChange`)  
  When dropping a `.ts64vid` file, the code calls `showSaveFilePicker` for the decrypted output. Same gesture-expiry issue.

**Why:** Chrome's File System Access API requires a **fresh, non-expired** user gesture. The gesture from `ondrop` or `onchange` events is "transient" — it expires after a single async tick or ~5 seconds. Any `await` call between the gesture and `showSaveFilePicker` kills it.

**Current state of the code:**  
- The **handleMediaFile video encryption path** (line ~596) already correctly calls `showSaveFilePicker` first ✅
- The **handleMediaFile .ts64vid decryption path** (line ~454) already correctly calls `showSaveFilePicker` first ✅
- The **terminal `stash_video` command** (line ~1395) already correctly calls it immediately after `fileInput.onchange` ✅
- The **terminal drag-and-drop for video** (line ~1702) uses old v1 `encryptData`/Blob fallback, so does NOT call `showSaveFilePicker` at all — it uses `<a>.click()` download instead. No bug here, but uses wrong encryption format.

**So where is the actual bug?** The error in the screenshot appears to happen when:
1. The user triggers drag-and-drop on the Video tab and Chrome's gesture expires before the picker shows
2. OR a browser that doesn't support File System Access API tries to call it anyway

**Fix:** For the Blob fallback path (`!supportsStreamSave`), we never call `showSaveFilePicker`, so that's fine. The remaining risk is gesture expiry. We must ensure `showSaveFilePicker` is called **synchronously** — no `await` before it.

---

### Bug 2: `unlock TS64-20VB-J402` — "No data found for key 20VB"

**Error:**
```
Access Denied: No data found for key 20VB.
```

**Where it happens:**  
- **Terminal `unlock` command** (line ~1477)

**Why:** Videos encrypted with `stash_video` or the Video tab are **never stored in IndexedDB**. They are streamed directly to a `.ts64vid` file on disk. The `unlock` command looks up `TS64_STASH_20VB` in IndexedDB, finds nothing, and reports "No data found".

This is **by design** — videos bypass IndexedDB to avoid RAM/storage limits. But the user has no way to decrypt a `.ts64vid` file from the terminal using `unlock`. They can only use drag-and-drop on the Video tab.

**Current mitigation:** A help message was added saying "drag and drop the `.ts64vid` file". But this is a bad UX — the user expects `unlock` to work.

**Fix:** Add a new terminal command `unlock_video` that:
1. Opens a file picker for the user to select their `.ts64vid` file
2. Reads the encrypted header + chunks from the file
3. Decrypts chunk-by-chunk
4. Either streams the decrypted video to disk (File System Access API) or creates an in-page `<video>` player

---

### Bug 3: `unlock TS64-A7K4-BXCN` — "Incorrect key or corrupted payload"

**Error:**
```
Access Denied: Incorrect key or corrupted payload.
```

**Where it happens:**  
- **Terminal `unlock` command** fallback path (line ~1560)

**Why:** This happens for audio/video that was encrypted using the **old v1 single-blob format** via the terminal drag-and-drop handler (line ~1687-1721). The drag-and-drop handler **still uses the legacy `encryptData()` function** — it stores the entire file as a single encrypted Uint8Array blob in IndexedDB with key `TS64_STASH_{id}`.

When `unlock` runs, it:
1. Checks `metaCheck` — finds a raw Uint8Array (not {v:2} object), so `isV2` = false
2. Falls into the legacy branch at line ~1560
3. Calls `decryptData(payload, pwd, false)` — this **should** work for v1 data
4. BUT — the stored value was a `Uint8Array` written by `encryptData()`. When IndexedDB retrieves it, it may come back as an `ArrayBuffer` or `Uint8Array`. The `decryptData` function expects either a string (base64) or a buffer-like object. It should handle both.

The actual failure mechanism: `decryptData` creates `new Uint8Array(bundleData)` — if `bundleData` is already a `Uint8Array`, this works. If it's an `ArrayBuffer`, this also works. **However**, if the data was corrupted during storage (e.g., the file was too large and got truncated), OR the password doesn't match, the AES-GCM decryption fails silently and returns `null`.

**Most likely cause:** The terminal drag-and-drop audio/video handler uses `file.arrayBuffer()` to load the ENTIRE file into RAM, then encrypts it all at once. For files >50-100MB, this can fail silently (out-of-memory) or produce corrupt data. This is the same original bug we were trying to fix with chunking!

**Fix:** The terminal drag-and-drop handler must use the same v2 chunked format as everything else. This handler was reverted to old v1 code by the user, which reintroduced this bug.

---

## Complete Fix Plan

### Step 1: Unify terminal drag-and-drop to v2 format

**File:** `app.js` lines ~1687-1721 (terminal drag-and-drop audio/video handlers)

**Problem:** Uses old v1 `encryptData()` which loads entire file into RAM and stores as single blob.

**Change:**
- **Audio drag-drop:** Replace the v1 `encryptData(ab, pwd)` call with the same v2 chunked encryption used by `stash_audio` (header + chunks + metadata in IndexedDB).
- **Video drag-drop:** Replace the v1 `encryptData(ab, pwd)` + Blob download with the same v2 chunked stream encryption used by `stash_video` (header written to file, chunks streamed to file via Blob fallback since drag-drop has no user gesture for `showSaveFilePicker`).

**Expected result:** All audio and video encrypted from all entry points use the same v2 format. `unlock` can decode audio. Videos produce valid `.ts64vid` files.

---

### Step 2: Add `unlock_video` terminal command for .ts64vid decryption

**File:** `app.js`, add new command handler between `unlock` and `export`

**Problem:** `unlock` cannot decrypt `.ts64vid` files because they aren't in IndexedDB.

**Change:** Add a new command `unlock_video` that:
1. Shows a "SELECT .ts64vid FILE" button (like `stash_video` shows "SELECT VIDEO FILE")
2. When user clicks and selects a `.ts64vid` file, prompt for the decryption key
3. Read the 28-byte header from the file, extract salt, derive key
4. Stream-decrypt chunks from the file
5. Build a Blob from decrypted data and either:
   - Show an inline `<video>` player, OR
   - Trigger a download of the decrypted video
6. Use Blob fallback (no `showSaveFilePicker`) since the user gesture from the button click will be consumed by the file input

**Expected result:** Users can decrypt `.ts64vid` files entirely from the terminal.

---

### Step 3: Update `unlock` command to handle .ts64vid suggestions better

**File:** `app.js` line ~1560

**Problem:** When `unlock` finds no data, it shows a text message. But the user also sees "Incorrect key or corrupted payload" for v1 data that may have been corrupted.

**Change:**
- When `!payload` (no data found): display a clear message with instructions mentioning the new `unlock_video` command
- When `decryptData` returns null (wrong key/corrupt): keep the existing error, but add a note: "If this was a large file encrypted via drag-and-drop, the data may be corrupted. Re-encrypt using `stash_audio` or `stash_video` for reliable large-file support."

---

### Step 4: Fix .ts64vid restore from Video Tab (Restore Zone)

**File:** `app.js` — `handleVideoRestoreDrop` and `handleVideoRestoreInputChange` (lines ~975-992)

**Problem:** When a user drops or selects a `.ts64vid` in the restore zone, it calls `handleMediaFile(file, 'video-restore-result', 'backup')`. Inside `handleMediaFile`, the `.ts64vid` backup path calls `prompt()` for the key and `showSaveFilePicker()` for the output. This works but has two issues:
1. `prompt()` is an ugly browser dialog — should use an inline input
2. The decrypted file is saved to disk but **not played inline** — user has to manually open it

**Change:**
- Replace `prompt()` with an inline password field rendered into the restore zone container
- After decryption, show an inline `<video>` player with the decrypted Blob URL **in addition to** offering a download button
- This lets users watch the video right on the page without needing to save and open separately

---

### Step 5: Update help text and instructions

**File:** `app.js` — help tab (renderHelpTab) and video tab instructions

**Changes:**
- Add `unlock_video` to the help tab command list
- Update the "HOW IT WORKS" section in the Video tab to mention `unlock_video` as the terminal alternative
- Update the video restore zone description to clearly explain the two decryption methods (drag-drop on video tab OR `unlock_video` in terminal)

---

### Step 6: Clean up legacy v1 fallback in `unlock`

**File:** `app.js` lines ~1560-1610 (the `else` branch in `unlock`)

**Problem:** The v1 legacy branch tries to auto-detect text vs audio vs video by trial-and-error. This is fragile and can produce confusing errors.

**Change:**
- Keep the v1 text detection (binary blocks test) as-is — it works for legacy text stashes
- Keep the v1 audio/video Blob auto-detection as-is — it works for legacy media
- Add a wrapper `try/catch` around the entire v1 branch that catches any unexpected error and shows a helpful message instead of a cryptic "corrupted payload"

---

## Summary of Changes

| # | What | Where | Fixes |
|---|------|-------|-------|
| 1 | Terminal drag-drop → v2 chunked format | Lines ~1687-1721 | Bug 3 (corrupt payload) |
| 2 | New `unlock_video` terminal command | New, after `unlock` | Bug 2 (no data found) |
| 3 | Better error messages in `unlock` | Lines ~1560-1566 | UX for Bug 2 |
| 4 | Video Tab restore → inline player + input | Lines ~453-525 | UX + Bug 1 |
| 5 | Help text updates | renderHelpTab + renderVideoTab | Documentation |
| 6 | Better v1 fallback error handling | Lines ~1560-1610 | Bug 3 edge cases |

---

## Implementation Order

1. **Step 1** first — this is the most critical fix (prevents new corrupted stashes)
2. **Step 2** next — gives users a way to decrypt videos from terminal
3. **Step 4** next — improves the Video tab restore experience  
4. **Step 3** then — better error messages
5. **Step 5** and **Step 6** last — polish

---

## Testing Checklist

After implementation, verify all of these scenarios:

- [ ] **Terminal `stash_video`** → Select video → Save picker appears → `.ts64vid` downloads → key shown
- [ ] **Terminal `unlock_video`** → Select `.ts64vid` → Enter key → Video plays inline OR downloads
- [ ] **Terminal `unlock`** with video key → Shows helpful message about using `unlock_video`
- [ ] **Terminal drag-drop video** → Video encrypts → `.ts64vid` downloads → key shown
- [ ] **Terminal drag-drop audio** → Audio encrypts as v2 chunks → `unlock` plays it
- [ ] **Terminal drag-drop `.ts64vid`** → Prompts for key → Decrypts and plays/downloads
- [ ] **Video Tab drop zone** → Drop video → Save picker or auto-download → key shown
- [ ] **Video Tab restore zone** → Drop `.ts64vid` → Inline key input → Decrypts → Video plays inline
- [ ] **Video Tab restore zone** → Select button → Choose `.ts64vid` → Same flow as above
- [ ] **No showSaveFilePicker errors** on any path
- [ ] **No "corrupted payload" errors** for freshly encrypted files
- [ ] **Legacy v1 stashes** still decrypt correctly via `unlock`
