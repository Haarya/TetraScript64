# 🚀 TetraScript64 — Deployment Guide

> **Last Updated:** March 4, 2026  
> **Stack:** Pure static site (HTML + JS + CDN Tailwind) — no build step required  
> **Deploy Directory:** `website/` (contains `index.html`, `app.js`, `logo.png`)

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Option 1: GitHub Pages (Recommended)](#option-1-github-pages-recommended)
4. [Option 2: Vercel](#option-2-vercel)
5. [Option 3: Netlify](#option-3-netlify)
6. [Option 4: Cloudflare Pages](#option-4-cloudflare-pages)
7. [Option 5: Firebase Hosting](#option-5-firebase-hosting)
8. [Custom Domain Setup](#custom-domain-setup)
9. [Important Security Notes](#important-security-notes)
10. [Troubleshooting](#troubleshooting)

---

## Overview

TetraScript64 is a **zero-knowledge, client-side-only** encryption vault. The entire application runs in the browser with:

- **No backend** — everything is local (IndexedDB, Web Crypto API, localStorage)
- **No build step** — no `npm run build`, no bundler, no compilation needed
- **3 files** — `index.html`, `app.js`, `logo.png`
- **CDN dependencies** — Tailwind CSS and Google Fonts are loaded from CDN

This means deployment is as simple as serving static files from any web host.

### ⚠️ HTTPS Requirement

The Web Crypto API (`crypto.subtle`) **requires HTTPS or localhost**. Your deployment **must** be served over HTTPS — all the platforms listed below do this automatically.

---

## Pre-Deployment Checklist

Before deploying, verify the following:

- [ ] All files in `website/` are present: `index.html`, `app.js`, `logo.png`
- [ ] No sensitive data is hardcoded in `app.js` (there shouldn't be — it's zero-knowledge)
- [ ] JavaScript syntax is valid:
  ```bash
  node -c website/app.js
  ```
  *(No output = no errors)*
- [ ] The site works locally via a local server (e.g., VS Code Live Server on `http://localhost:5500`)
- [ ] Git repository is clean and pushed:
  ```bash
  git status
  git push origin main
  ```

---

## Option 1: GitHub Pages (Recommended)

**Best for:** Direct deployment from your existing GitHub repo. Free, simple, reliable.

### Steps

1. **Go to your repository on GitHub:**
   ```
   https://github.com/Haarya/TetraScript64
   ```

2. **Navigate to Settings → Pages:**
   - Click on **Settings** tab in the repository
   - Scroll down and click **Pages** in the left sidebar

3. **Configure the source:**
   - Under **"Build and deployment"**, select:
     - **Source:** `Deploy from a branch`
     - **Branch:** `main`
     - **Folder:** `/website`
   - Click **Save**

4. **Wait for deployment:**
   - GitHub Actions will automatically build and deploy your site
   - This takes 1-3 minutes on the first deploy
   - You can monitor progress in the **Actions** tab

5. **Access your site:**
   ```
   https://haarya.github.io/TetraScript64/
   ```

### Updating After Changes

Every time you push to `main`, GitHub Pages will automatically redeploy:

```bash
git add .
git commit -m "Update description"
git push origin main
```

No additional action needed — the update goes live within 1-2 minutes.

---

## Option 2: Vercel

**Best for:** Instant deployments, preview URLs for each commit, excellent CDN.

### Steps

1. **Go to [vercel.com](https://vercel.com) and sign in with GitHub**

2. **Import your repository:**
   - Click **"Add New…" → Project**
   - Select `Haarya/TetraScript64`

3. **Configure the project:**
   - **Framework Preset:** `Other`
   - **Root Directory:** `website`
   - **Build Command:** *(leave empty — no build needed)*
   - **Output Directory:** `.` (dot — serve root of `website/`)

4. **Click "Deploy"**

5. **Your site will be live at:**
   ```
   https://tetra-script64.vercel.app
   ```
   *(or similar auto-generated name)*

### Vercel CLI (Alternative)

```bash
npm i -g vercel
cd website
vercel
```

Follow the prompts. Vercel will detect it as a static site automatically.

---

## Option 3: Netlify

**Best for:** Drag-and-drop deployment, instant rollbacks, form handling if needed later.

### Method A: Drag and Drop (Quickest)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag your entire `website/` folder into the browser
3. Done — your site is live immediately

### Method B: Git Integration

1. **Go to [netlify.com](https://netlify.com) and sign in with GitHub**

2. **Add new site → Import an existing project:**
   - Select `Haarya/TetraScript64`

3. **Configure build settings:**
   - **Base directory:** `website`
   - **Build command:** *(leave empty)*
   - **Publish directory:** `website`

4. **Click "Deploy site"**

5. **Your site will be live at:**
   ```
   https://tetrascript64.netlify.app
   ```

### Netlify CLI (Alternative)

```bash
npm i -g netlify-cli
cd website
netlify deploy --prod --dir=.
```

---

## Option 4: Cloudflare Pages

**Best for:** Global edge CDN, excellent performance, free SSL, unlimited bandwidth.

### Steps

1. **Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create**

2. **Connect to Git:**
   - Select `Haarya/TetraScript64`

3. **Configure build:**
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `website`

4. **Click "Save and Deploy"**

5. **Your site will be live at:**
   ```
   https://tetrascript64.pages.dev
   ```

### Wrangler CLI (Alternative)

```bash
npm i -g wrangler
cd website
wrangler pages deploy .
```

---

## Option 5: Firebase Hosting

**Best for:** If you're already in the Google/Firebase ecosystem.

### Steps

1. **Install Firebase CLI:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login and initialize:**
   ```bash
   firebase login
   cd C:\Users\AARYA\Desktop\TetraScript
   firebase init hosting
   ```

3. **When prompted:**
   - **Public directory:** `website`
   - **Single-page app:** `No`
   - **Overwrite index.html:** `No`

4. **Deploy:**
   ```bash
   firebase deploy --only hosting
   ```

5. **Your site will be live at:**
   ```
   https://tetrascript64.web.app
   ```

---

## Custom Domain Setup

All platforms above support custom domains. The general process:

### 1. Buy a Domain
Use a registrar like [Namecheap](https://namecheap.com), [Google Domains](https://domains.google), or [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/).

### 2. Add DNS Records

| Type  | Name    | Value                          |
|-------|---------|--------------------------------|
| CNAME | `www`   | `haarya.github.io` (for GH Pages) |
| A     | `@`     | `185.199.108.153` (GitHub Pages IP) |
| A     | `@`     | `185.199.109.153` |
| A     | `@`     | `185.199.110.153` |
| A     | `@`     | `185.199.111.153` |

*(IPs vary by platform — each platform provides specific instructions)*

### 3. Configure on the Platform
- **GitHub Pages:** Settings → Pages → Custom domain → enter your domain
- **Vercel:** Project Settings → Domains → Add
- **Netlify:** Site Settings → Domain management → Add custom domain
- **Cloudflare:** Custom domains tab in Pages dashboard

### 4. Wait for SSL
All platforms provision free SSL certificates automatically. This may take up to 24 hours but usually completes in minutes.

---

## Important Security Notes

### What TetraScript64 Guarantees

| Feature | Status |
|---------|--------|
| Zero server contact for encryption | ✅ Guaranteed by design |
| All crypto operations in-browser | ✅ Web Crypto API |
| No data ever leaves the client | ✅ IndexedDB + localStorage only |
| HTTPS for crypto API access | ✅ All platforms provide this |
| No analytics or tracking | ✅ No third-party scripts (except Tailwind CDN) |

### Security Considerations for Deployment

1. **HTTPS is mandatory** — all listed platforms provide this automatically
2. **Tailwind CSS CDN** — the only external request. If you want full isolation:
   - Download Tailwind CSS and serve it locally instead of using `cdn.tailwindcss.com`
3. **No server-side code** — there's nothing to exploit on the backend because there is no backend
4. **Subresource Integrity (SRI)** — consider adding SRI hashes to CDN script tags for production

### Optional: Self-Bundle Tailwind for Full Isolation

If you want zero external CDN calls:

```bash
npm install -D tailwindcss
npx tailwindcss -i ./input.css -o ./tailwind.min.css --minify
```

Then replace the CDN `<script>` in `index.html` with a local `<link>` to `tailwind.min.css`.

---

## Troubleshooting

### "Crypto API not available"
- **Cause:** Site is being served over HTTP instead of HTTPS
- **Fix:** Ensure your deployment platform has SSL enabled (all listed platforms do this by default)

### "Page shows blank / JS errors"
- **Cause:** Wrong root directory configured
- **Fix:** Make sure the deploy directory points to `website/` (not the repo root)

### "Styles not loading"
- **Cause:** Tailwind CDN blocked by network/firewall
- **Fix:** Try a different network, or self-bundle Tailwind (see above)

### "GitHub Pages shows 404"
- **Cause:** Branch or folder misconfigured
- **Fix:** Settings → Pages → ensure Branch is `main` and Folder is `/website`

### "Changes not appearing after push"
- **Cause:** Browser cache or CDN cache
- **Fix:** Hard refresh (`Ctrl+Shift+R`) or wait 2-3 minutes for CDN propagation

### "IndexedDB quota exceeded"
- **Cause:** Browser storage limits (usually 50-80% of available disk)
- **Fix:** This is a client-side limit, not a deployment issue. Users can clear old stashes with `purge`

---

## Platform Comparison

| Feature | GitHub Pages | Vercel | Netlify | Cloudflare Pages | Firebase |
|---------|-------------|--------|---------|-----------------|----------|
| **Cost** | Free | Free | Free | Free | Free (Spark) |
| **Custom Domain** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Auto SSL** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Auto Deploy on Push** | ✅ | ✅ | ✅ | ✅ | Manual |
| **Preview URLs** | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Global CDN** | ✅ | ✅ | ✅ | ✅ (best) | ✅ |
| **Bandwidth** | 100GB/mo | 100GB/mo | 100GB/mo | Unlimited | 10GB/mo |
| **Setup Difficulty** | Easy | Easy | Easiest | Easy | Medium |

### Recommendation

For TetraScript64, **GitHub Pages** is the simplest since your code is already on GitHub. Just flip the switch in Settings → Pages and you're live.

If you want preview URLs for each PR or faster global CDN, go with **Vercel** or **Cloudflare Pages**.

---

## Quick Deploy Checklist

```
1. ✅ Verify files: website/index.html, website/app.js, website/logo.png
2. ✅ Syntax check: node -c website/app.js
3. ✅ Push to GitHub: git push origin main
4. ✅ Go to GitHub → Settings → Pages
5. ✅ Set Branch: main, Folder: /website
6. ✅ Wait 2 min → visit https://haarya.github.io/TetraScript64/
7. ✅ Test: stash, export, unlock, diary features
```
