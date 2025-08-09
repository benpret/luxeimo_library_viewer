# Luxeimo Library Viewer (Prototype)

Prototype static web app for browsing large 3D asset/material/texture libraries.

## Features (Current)
- Bootstrap 5 responsive shell with sidebar filters
- VirtualGrid placeholder (renders up to 1000 items; next step: true windowing)
- Search (string contains) + category/type filters + basic sort
- Detail drawer (mock data)
- Theme toggle (light/dark)
- Settings panel (⚙️) storing library root path in localStorage
- Mock dataset generator script (5k items)
 - Real library index builder script (scans `asset_info.json` files)
 - Tailwind + Bootstrap hybrid modern UI redesign
 - Windows launcher batch file `start_viewer.bat`

## Planned (Per `copilot-instructions.md`)
See detailed roadmap & architecture.

## Quick Start (Recommended: Node static server)
```powershell
# From repo root (installs serve on the fly and launches at http://localhost:5173)
npx serve public -l 5173
```
Then open: http://localhost:5173

### Alternative: Integrated Proxy Server (serves external library)
Use when your previews are outside `public/` (avoids copying or symlinks):
```powershell
node server.js --port 5173 --libraryRoot "C:/ImerzaLibrary"
```
This will first attempt to serve from `public/`, then fall back to the external library for paths like `/Assets/...` or `/mats/...`.

Alternative (VS Code Live Server): open `public/index.html` and click "Go Live".

## Regenerate Mock Data
```powershell
node scripts/build_mock_data.js > public/data/index_root.json
```

## Build Index From Real Library
Point to your local library root (e.g. `C:/ImerzaLibrary`).
```powershell
node scripts/build_index_from_library.js -r "C:/ImerzaLibrary" -o public/data/index_root.json
```
Then reload the app. Thumbnails will attempt to load relative to each asset folder; ensure your previews exist at the paths declared in `thumbnails.small/medium` or within latest version `previewImages`.

If your real library is OUTSIDE the `public/` directory, raw file paths will 404 when served by the simple static server because the browser can only fetch files under `public/`. Options:
1. Copy or symlink the previews directory tree into `public/Assets/…` (mirroring your library structure).
2. Provide a prefix subfolder when generating the index so thumbnails point at a mirrored folder under `public/`.
3. Run a small custom server that can proxy from a virtual URL path to your outside root (future enhancement).

Prefix example (if you sync previews into `public/library_mirror`):
```powershell
node scripts/build_index_from_library.js -r "C:/ImerzaLibrary" -p "library_mirror" -o public/data/index_root.json
```
This produces thumbnail URLs like `/library_mirror/.../preview_01_256.jpg` which will resolve if that mirror exists.

Windows symlink (needs admin or Developer Mode):
```powershell
New-Item -ItemType SymbolicLink -Path .\public\library_mirror -Target C:\ImerzaLibrary
```
Then regenerate the index with `-p library_mirror`.

## Next Development Steps (Actionable Roadmap)
1. Real virtualization
	- Replace placeholder grid with windowed recycler (target < 150 DOM nodes for 10k items).
	- Add dynamic measurement or fixed card height assumption.
2. Sharded loading
	- Split mock dataset into category shards: `index_furniture.json`, etc.
	- Lazy load shards when category filter toggled.
3. Service worker
	- Precache shell; stale-while-revalidate for shards; versioned cache key.
4. Detail fetch
	- Add per-asset `asset_info.json` mock; fetch on open; show versions list.
5. AI tagging pipeline scaffold (offline)
	- Python script to read previews -> generate `autoTags` + `aiCaption` (mock stub now).
6. Semantic search (phase 1)
	- Load reduced random vectors (placeholder) + implement cosine similarity path.
7. Admin tag review UI
	- Approve / reject AI tags; store approved tags merged into `tags`.
8. Metrics & perf instrumentation
	- Add `performance.mark` timings and simple overlay for FPS / items rendered.
9. Accessibility pass
	- aria roles, keyboard grid navigation, focus styles.
10. Testing
	- Add Jest/Vitest for search + filter logic; Playwright for visual regressions.

## License
Internal prototype.
