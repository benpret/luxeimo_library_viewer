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

## Planned (Per `copilot-instructions.md`)
See detailed roadmap & architecture.

## Quick Start (Recommended: Node static server)
```powershell
# From repo root (installs serve on the fly and launches at http://localhost:5173)
npx serve public -l 5173
```
Then open: http://localhost:5173

Alternative (VS Code Live Server): open `public/index.html` and click "Go Live".

## Regenerate Mock Data
```powershell
node scripts/build_mock_data.js > public/data/index_root.json
```

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
