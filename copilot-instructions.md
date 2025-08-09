# Luxeimo 3D Library Viewer – Build Instructions (Copilot Reference)

Authoring guide for implementing a high‑performance browser for 3D assets, materials, and textures inspired by Quixel Bridge & Poly Haven. This document defines goals, architecture, data formats, UI components, performance tactics, and incremental delivery steps so an AI assistant (or any developer) can confidently extend the project.

---
## 1. Product Goals
- Fast browse & search across tens of thousands of assets (sub‑second perceived response for common actions).
- Consistent UX for Assets (models), Materials, Textures, plus future categories (HDRIs, decals, etc.).
- Offline-capable metadata (JSON) + progressive fetching of previews and heavy files.
- Version awareness: each asset can have multiple versions; latest surfaced by default; history view on demand.
- Extensible: easy to plug in new metadata fields & processing pipelines.
- Accessible & responsive: keyboard navigation, ARIA roles, mobile & desktop layouts.

## 2. Tech Stack (Initial Web Implementation)
Core (no build complexity to start):
- HTML5 + Bootstrap 5 (layout, responsive grid, utility classes) + small custom SCSS.
- Vanilla ES Modules (ES2020+). Avoid frameworks early; optionally add React/Vue once core stabilized. Provide adapter layer so migration is low effort.
- Web Components (optional) for reusable UI primitives (`<asset-card>`, `<filter-panel>`, `<virtual-grid>`).
- IndexedDB (client) for metadata caching + versioning; LocalStorage only for light prefs.
- Service Worker for caching static assets + stale‑while‑revalidate metadata.
- Optional enhancements later: WASM (e.g., Draco / meshopt decompression), WebGL preview (USD/GLTF viewer) or USD via WebGPU when feasible.

## 3. High-Level Architecture
```
/public              (static hosting root)
  index.html
  assets/            (web app static assets: css, js, icons)
  data/              (served JSON metadata shards & indices)
/src
  core/              (data layer: fetch, cache, index, search)
  ui/                (components, templates, theming)
  features/          (domain-specific modules: assets, materials, textures)
  util/              (helpers: events, virtual list, workers)
  sw.js              (service worker)
  main.js            (bootstrap / app entry)
/scripts             (build / preprocessing scripts e.g., metadata indexer)
```

### Runtime Layers
1. Data Sources: Static JSON (asset_info.json per asset), aggregated shard indices (category-level). Future: HTTP API.
2. Index & Cache: Load lightweight master index (id, name, category, tags, thumbnail path, type, version dates) first. Detailed metadata deferred until detail panel opens.
3. UI State Store: Simple event emitter + derived selectors (no heavy state lib initially). Provide global `AppState` object.
4. Presentation: Virtualized grid renders only visible cards. Filters update derived list; diffing minimal DOM changes.

## 4. Performance & Scalability Strategies
- Sharded indices: Split large catalogs by first 2 chars of short id or by category to keep each JSON under ~250KB. Lazy load on demand.
- Virtualization: Windowing for grid & list using IntersectionObserver + manual scroll math. Target < 150 DOM asset cards at any time.
- Image strategy: Provide multiple sizes (thumb: 256px, tile: 512px). Use `<img loading="lazy" decoding="async" srcset="...">`. Pre-generate WebP/AVIF + fallback JPEG.
- Debounced search (150ms) & filter recalculations using pre-tokenized fields.
- Client-side full text: Build a flattened lowercase string field per asset (name+tags+category). Use simple inverted index map token -> Set(ids).
- Background parsing: Web Worker for building search index + heavy JSON parsing to keep main thread responsive.
- Caching: Service worker caches shards; ETag or hash filenames for cache bust. IndexedDB stores processed index + version stamp (schemaVersion + buildHash). On mismatch trigger re-sync.
- Progressive detail: Only load version history, material graphs, texture resolutions when user opens detail drawer.
- Batch DOM updates with `requestAnimationFrame`.

## 5. Accessibility & Usability
- Keyboard navigation: Arrow keys move focus in grid, Enter opens detail, `/` focuses search box.
- ARIA roles: `role="grid"`, each card `role="gridcell"` + `aria-label` with asset name.
- Focus ring visible; high contrast mode supported with CSS vars.
- Provide skeleton loaders (CSS shimmer) for perceived speed.

## 6. Data Schemas
### 6.1 Asset Metadata (asset_info.json)
```json
{
  "schemaVersion": 1,
  "id": "be122b74169eb8203c290e8573634373cf7dc11584adea334beca97a72f730da",  // long hash
  "shortId": "be122b74",
  "slug": "tbl_dng_set",                     // path-safe base name
  "displayName": "Table Dining Set",
  "type": "asset",                          // asset | material | texture | (future: hdri, decal, vegetation)
  "category": "furniture",                  // high-level folder
  "subCategory": "tables",                  // optional
  "tags": ["table", "dining", "set"],
  "createdBy": "N/A",
  "createdDate": "2025-08-06",
  "license": "internal",                   // or cc0, proprietary, etc.
  "versions": [
    {
      "version": "001",
      "date": "2025-08-06",
      "notes": "Initial asset creation.",
      "usd": "v001/tbl_dng_set_be122b74.usd",
      "previewImages": ["v001/previews/preview_01.jpg"],
      "sourceFiles": ["v001/source/tbl_dng_set_v001.max"],
      "materials": ["unq_fab_dc30e494"],
      "polyCount": 15234,
      "fileSizeBytes": 1048576
    }
  ],
  "thumbnails": {
    "small": "v001/previews/preview_01_256.jpg",
    "medium": "v001/previews/preview_01_512.jpg"
  },
  "metrics": {
    "downloads": 0,
    "favorites": 0
  }
}
```

### 6.2 Material Instance (shared) Example
```json
{
  "schemaVersion": 1,
  "id": "stl_scr_3004fdb5",
  "type": "material",
  "category": "metal",
  "displayName": "Stainless Steel Scratched",
  "tags": ["metal", "stainless", "scratched"],
  "textureSet": {
    "resolutions": ["1k", "4k"],
    "maps": {
      "baseColor": {"1k": "textures/t_stl_scr_3004fdb5_diffuse_1k.png", "4k": "textures/t_stl_scr_3004fdb5_diffuse_4k.png"},
      "normal": {"1k": "textures/t_stl_scr_3004fdb5_normal_1k.png", "4k": "textures/t_stl_scr_3004fdb5_normal_4k.png"},
      "roughness": {"1k": "textures/t_stl_scr_3004fdb5_roughness_1k.png", "4k": "textures/t_stl_scr_3004fdb5_roughness_4k.png"},
      "height": {"1k": "textures/t_stl_scr_3004fdb5_height_1k.png", "4k": "textures/t_stl_scr_3004fdb5_height_4k.png"},
      "opacity": {"1k": "textures/t_stl_scr_3004fdb5_opacity_1k.png", "4k": "textures/t_stl_scr_3004fdb5_opacity_4k.png"}
    }
  },
  "usd": "stl_scr_3004fdb5.usd",
  "thumbnails": {"small": "preview_256.jpg", "medium": "preview_512.jpg"}
}
```

### 6.3 Index Shard Schema
```json
{
  "schemaVersion": 1,
  "generated": "2025-08-09T12:00:00Z",
  "category": "furniture",
  "items": [
    {"id":"be122b74","displayName":"Table Dining Set","slug":"tbl_dng_set","type":"asset","category":"furniture","tags":["table","dining"],"thumb":"assets/furniture/tbl_dng_set_5ee69972/v002/previews/preview_01_256.jpg","latestVersion":"002","updated":"2025-08-08"}
  ],
  "hash": "<content-hash>"
}
```

## 7. Naming Conventions
- Folders: lowercase, underscores for readability: `tbl_dng_set_5ee69972`.
- Short IDs: first 8 hex chars of SHA256 (or any collision-resistant hash of canonical slug + salt).
- Thumbnails: `<base>_<size>.jpg` where size ∈ {256,512}.
- Versioned asset USD: `<slug>_<shortId>_v###.usd` (or `<slug>_v###.usd` if id already in folder name) – pick one pattern and enforce.
- Texture maps: `t_<shortId>_<map>_<res>.png` (map e.g., diffuse|basecolor, normal, roughness, height, opacity; use consistent canonical set).

## 8. UI Components (Initial Set)
| Component | Purpose | Key Props / Attributes |
|-----------|---------|------------------------|
| App Shell | Layout wrapper (header, sidebar, content) | none |
| SearchBar | Typeahead terms & tag suggestions | `value`, events: `search` |
| FilterPanel | Category, Type, Tags, Resolution filters | binds to AppState filters |
| VirtualGrid | Windowed rendering of `AssetCard` items | `items[]`, `itemHeight`, `columns` |
| AssetCard | Thumbnail, name, type badge, favorite button | `data-id`, dataset with short metadata |
| DetailDrawer | Slide-over with full metadata & version list | `assetId` |
| Breadcrumbs | Navigation path | `segments[]` |
| TagPill | Visual tag element | `label` |
| SortControl | Sort by name/date/popularity | `sortKey` |
| LazyImage | Wrapper for responsive & lazy loading images | `src`, `srcset`, `sizes` |

### Component Guidelines
- All components emit custom events for decoupled state updates.
- Use CSS variables for theming: `--color-bg`, `--color-surface`, etc.
- Provide light & dark theme toggles (persist in localStorage).

## 9. Interaction Flows
1. App Load:
   - Fetch root manifest `data/index_root.json` (list categories + shard URLs + hash).
   - Render empty grid skeleton.
   - Load first shard (e.g., popular or default category) + build search index asynchronously.
2. Scroll:
   - VirtualGrid calculates visible range -> updates card elements.
3. Search:
   - Debounce input -> look up token sets intersection -> update VirtualGrid dataset.
4. Open Detail:
   - Preload medium thumbnail(s), fetch asset_info.json, display metadata; allow version selection; optionally preview USD/Material.

## 10. Filtering & Search Implementation Sketch
```js
// tokens: Map<string, Set<id>> built in worker
function search(tokensMap, queryTokens) {
  if (!queryTokens.length) return allIds;
  return queryTokens
    .map(t => tokensMap.get(t) || new Set())
    .reduce((acc, set) => acc.filter(id => set.has(id)), [...allIds]);
}
```
- Normalize tokens: lowercase, remove punctuation, simple stemming (optional later).
- Tags filter: Intersect with precomputed tag->ids map.
- Category filter: applied first to narrow candidate set.

## 11. Service Worker Strategy
- Precache: core shell (HTML, CSS, JS entry) + root manifest.
- Runtime cache: `data/*.json` (stale-while-revalidate), `thumbs/*` (cache-first, purge via hash in filename or periodic LRU cleanup in IndexedDB meta table).
- Version bump: `CACHE_VERSION` constant; update triggers old cache cleanup.

## 12. Progressive Enhancement Roadmap
| Phase | Deliverable | Notes |
|-------|-------------|-------|
| 1 | Static prototype with hardcoded list | Validate layout & virtualization baseline |
| 2 | Sharded JSON loading + search + filters | Performance instrumentation |
| 3 | Detail drawer + version history | Include preview carousel |
| 4 | Service worker + offline metadata | Add update notifications |
| 5 | Material & texture dedicated views | Shared component reuse |
| 6 | WebGL/USD preview (if feasible) | Fallback to still images |
| 7 | Authentication (if needed) | Gate internal assets |
| 8 | Upload/admin tooling | Validate & generate metadata shards |

## 13. Build / Tooling (Optional Enhancements)
- Add Vite for bundling once modules grow; support code splitting.
- SCSS compilation; PostCSS autoprefixer.
- Preprocessing script to generate indices:
  - Traverse library, read each `asset_info.json`.
  - Normalize fields, compute tokens, output shards + root manifest.
- Linting: ESLint + Prettier.
- Testing: Vitest/Jest for logic, Playwright for virtualization & accessibility regression.

## 14. Index Generation Script (Pseudo)
```python
# scripts/build_indices.py
for category in categories:
  items = []
  for asset in walk(category):
    meta = load_json(asset/"asset_info.json")
    items.append(minify(meta))  # keep only frequently needed fields
  write_json(f"public/data/index_{category}.json", shard(items))
write_json("public/data/index_root.json", root_manifest())
```
Minify retains: id, shortId, displayName, slug, type, category, tags, thumb, latestVersion, updated.

## 15. Security / Integrity
- Hash filenames (content digest) or include `hash` field in each shard for tamper detection.
- Validate `schemaVersion` before ingest; if mismatch log & skip.

## 16. Error Handling Strategy
- Central `notifyError(err, context)` -> logs to console + optional toast.
- Fallback images if thumbnail fails (`onerror` swap to placeholder). Maintain metric counters.
- If shard fails to load: show retry banner with exponential backoff.

## 17. Metrics & Instrumentation
- Basic performance marks: time to first render, time to interactive, shard fetch durations.
- Count search queries, opened details (anonymous, no PII) stored locally first.

## 18. Theming & Styling Notes
- Use CSS variables and a minimal BEM naming for custom classes.
- Card layout: fixed aspect ratio box (e.g., 4:3) using padding hack or `aspect-ratio` property.
- Hover overlay: quick actions (favorite, download, copy path).

## 19. AI Tagging & Semantic Enrichment
Automatic AI-driven tagging of assets from preview images improves discoverability and enables semantic search beyond manual metadata.

### 19.1 Goals
- Auto-generate descriptive, consistent tags (object class, material types, style adjectives, color palette, environment context, usage verbs) from existing preview images.
- Produce a natural-language caption that can seed manual curation.
- Support semantic (vector) search: user can type "rusty industrial chair" and retrieve results even if exact tags missing.
- Keep manual control: distinguish human vs AI tags; allow accept/reject & lock tags from overwrite.

### 19.2 Pipeline (Offline Build Step)
1. Discovery: For each asset choose canonical preview (first image or highest resolution). Optionally fuse multiple previews.
2. Preprocess: Resize longest side to 512 px, convert to sRGB JPEG/WebP, remove transparency.
3. Vision Models:
  - Caption: BLIP2 / Florence-2 (or fallback BLIP base) -> raw caption text.
  - Embedding: CLIP (e.g., ViT-B/32) via `open_clip` -> 512D vector; store reduced (PCA 64D) for client if needed.
  - Optional: Color extraction (k-means in LAB) -> top 3 named colors (map LAB -> nearest web color name set).
4. Tag Extraction:
  - Normalize caption (lowercase, remove stopwords) & run keyword matcher against controlled vocabulary (maintain `vocab_tags.json`).
  - Add high-confidence zero-shot labels: compute cosine similarity between embedding and candidate label prompts ("a photo of a wooden chair", etc.). Threshold (e.g., >0.28) with top-k (<=10).
  - Add color tags (e.g., `color:warm_brown`).
5. Scoring & Dedup: Merge manual tags (weight 1.0) and AI (weight 0.7). If conflicts (manual negative list), drop AI tag.
6. Persist:
  - Extend `asset_info.json` minimal diff: add `autoTags` (array), `aiCaption` (string), optional `embeddingId`.
  - Store embeddings separately in shard file: `data/embeddings/<prefix>.bin` (float32) + `data/embeddings/index_manifest.json` mapping shortId -> offset.
7. Quality Assurance: Flag low-confidence (score < threshold); surface in an admin review UI.

### 19.3 Data Schema Additions
```json
{
  "autoTags": ["chair", "office", "leather", "modern", "black", "metal_frame"],
  "aiCaption": "modern black leather office chair with metal frame",
  "embeddingId": "be122b74"  // matches shortId or separate numeric index
}
```
Keep `autoTags` separate from manual `tags` to allow selective merging at index generation.

### 19.4 Index Generation Changes
- During build, merge `tags` + (approved) `autoTags` into search token set.
- Shard embeddings parallel to metadata shards (same prefix) to load only needed subsets for semantic search.
- Provide a reduced `vector16` (quantized 16D or 32D) inside index shard for quick approximate ranking; full embedding used server/offline.

### 19.5 Semantic Search (Client)
Basic approach (lightweight):
1. On first semantic search use WASM or JS implementation of cosine similarity over reduced vectors.
2. Text query -> embed (optional: call lightweight hosted embedding API or precomputed label expansion) -> compare to in-memory reduced vectors of currently loaded shard(s).
3. Blend scores with keyword search: `score = 0.6*keywordRank + 0.4*semanticRank` (tunable).

Fallback: If embedding assets not loaded yet, show keyword-only results & background-load vectors.

### 19.6 Tooling (Python Example Requirements)
`pip install pillow torch torchvision open_clip_torch scikit-learn` (exact pinned versions in a future `requirements.txt`).

Pseudo snippet:
```python
import open_clip, torch, PIL.Image as Image
model, preprocess, _ = open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')
tokenizer = open_clip.get_tokenizer('ViT-B-32')
img = preprocess(Image.open(preview_path)).unsqueeze(0)
with torch.no_grad():
   emb = model.encode_image(img).float()
   emb /= emb.norm(dim=-1, keepdim=True)
```

### 19.7 UI Integration
- Show AI tags with subtle icon (e.g., spark) & allow hover to accept (promote to manual) or remove.
- Provide toggle in filter panel: include/exclude AI tags.
- Semantic search toggle ("Semantic" pill) or automatic fallback if no keyword hits.
- Indicate confidence on hover (e.g., 0-1 scaled bar) for power users/admin.

### 19.8 Governance / Accuracy
- Maintain a blocklist of noisy tags (e.g., "object", "image").
- Log accepted vs rejected AI tags to refine thresholds.
- Retrain / re-run pipeline periodically (store `aiGeneratedAt` timestamp in metadata to schedule refresh when model upgrades).

### 19.9 Performance Considerations
- All heavy inference happens offline / build pipeline, not in browser (unless an optional on-device mode added later with WASM or WebGPU).
- Client only downloads small reduced vectors (e.g., 32 * 4 bytes = 128B per asset) — with 20k assets ~2.5MB compressed.
- Lazy-load vector shards only when user initiates semantic search or enables semantic filter.

### 19.10 Roadmap Inserts
- Phase 2.5: Initial AI tag generation & display (read-only).
- Phase 3.5: Admin review UI (approve/merge AI tags).
- Phase 5.5: Semantic vector search blending with keyword search.

### 19.11 Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Irrelevant / hallucinated tags | Thresholding + vocabulary whitelist + human review workflow |
| Large embedding payloads | Dimensionality reduction + sharding + compression |
| User distrust of AI labels | Visual distinction + ability to hide or promote |
| Model bias | Diverse training prompts, periodic evaluation, manual curation |
| Stale tags after asset updates | Store preview hash; if changed, invalidate and re-run tagging |

---
## 20. Future Integrations
- Drag+Drop into DCC tools (generate file URLs / local paths mapping).
- Direct copy path button (UNC path or relative repo path).
- Export selected assets as collection (zip) with manifest.
- Auth & role-based flags for internal vs external resources.

## 21. Minimal Initial Files (Targets)
```
public/
  index.html
  assets/css/main.css
  assets/js/main.js
  assets/js/virtual-grid.js
  data/index_root.json (stub)
src/
  (mirrors public js before build step exists)
```
`index.html` loads main.css + main.js; renders shell containers:
```html
<div id="app">
  <header><!-- search, filters toggle --></header>
  <aside id="filters"></aside>
  <main>
    <div id="grid" class="virtual-grid" role="grid" aria-rowcount="-1"></div>
  </main>
</div>
```

## 22. Definition of Done (Phase 1)
- Can load a stub index JSON with ≥ 5k mock items and scroll smoothly (60fps typical) in Chrome desktop.
- Search & category filter working on mock data (<200ms response for typical queries).
- Lighthouse Performance ≥ 85 on desktop.

## 23. Checklist for Contributors
- [ ] Confirm `schemaVersion` compatibility.
- [ ] Add/Update tests for new data parsing logic.
- [ ] Measure performance impact (scroll & search) if modifying VirtualGrid.
- [ ] Maintain accessibility (run axe / lighthouse). 
- [ ] Update indices if schema fields changed.

## 24. FAQ (Quick Answers)
Q: How do we add a new asset?  
A: Place new folder, create/validate `asset_info.json`. Run index build script; commit updated shards.

Q: How to bust caches after a metadata change?  
A: Rebuild indices; root manifest hash changes; service worker sees new hash and refreshes shards.

Q: How to ensure smooth scrolling with thousands of items?  
A: Only render visible + buffer items (window). Avoid heavy box-shadows; minimize reflow by fixed card dimensions.

---
## 25. Next Concrete Tasks (Immediate)
1. Create initial `public/index.html`, `assets/js/main.js`, `assets/js/virtual-grid.js`, `assets/css/main.css` with placeholder virtualization logic.
2. Add mock `data/index_root.json` + one shard `data/index_furniture.json` (generated synthetically).
3. Implement basic search + category filtering.
4. Add skeleton loaders & lazy image component.

---
## 26. Suggested Minimal VirtualGrid API
```js
const grid = new VirtualGrid({
  container: document.getElementById('grid'),
  itemHeight: 240,
  minColumnWidth: 200,
  renderItem: (asset) => assetCardTemplate(asset)
});

grid.setItems(items); // items: array of {id, displayName, thumb, ...}
```
Grid recalculates columns on resize; stores scrollTop -> visible range.

---
## 27. License & Attribution
Internal usage; ensure third‑party assets follow their original licenses. Keep license field inside metadata.

---
### End of File
