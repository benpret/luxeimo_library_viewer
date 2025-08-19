# Luxeimo Asset Library Toolkit – Unified Architecture & Implementation Guide

This document supersedes the earlier single-page "Viewer" spec and re-architects the project as a multi-interface **Toolkit** (CLI + Web UI + future Qt UI) for creating, indexing, browsing, enriching and distributing very large 3D asset, material, and texture libraries (tens of thousands of items). It draws inspiration from high‑scale DAM (Digital Asset Management) systems while remaining installable and performant on an individual artist’s workstation.

---
## 0. Strategic Objectives
1. Local-first install: Artists download a packaged toolkit (zip/installer) and point it at a shared library root (network share, replicated object storage, or Perforce workspace) with minimal config.
2. Scalable metadata + fast search: Sub‑second query + scroll for 50k+ assets using sharded indices, incremental caching, and vector + keyword hybrid search.
3. Multi-interface parity: Core logic (schemas, indexing, search, enrichment) lives in a reusable library consumed by CLI, Web UI, and (future) Qt desktop UI.
4. Safe multi‑user authoring: Clear separation between read-only consumers and authorized editors (write roles) via policy & manifest signing.
5. Extensible AI enrichment pipeline (captioning, tagging, embeddings) fully offline or hybrid‑cloud pluggable.
6. Content-addressable + version-aware storage model to avoid duplication, enable dedupe, and support immutable history with lightweight pointers.

---
## 1. High-Level Layering
```
┌─────────────────────────────┐
│        Presentation         │  Web UI (current), Qt UI (planned), headless exports
├───────────┬─────────────────┤
│  Adapters │ (web, qt, cli)  │  Thin wrappers mapping user actions to core API
├───────────┴─────────────────┤
│        Core Library         │  (indexing, search, tagging, schemas, validation)
├─────────────────────────────┤
│   Storage Abstraction       │  (local FS, Perforce, S3/GCS, Artifactory, Perforce-like)
├─────────────────────────────┤
│     Build / AI Pipelines    │  (thumbnail gen, AI tags, embeddings, QC)
├─────────────────────────────┤
│        System Services      │  (auth policy, cache, lock mgmt, integrity hashes)
└─────────────────────────────┘
```

---
## 2. Proposed Repository Structure (Monorepo)
```
/toolkit_core/               # Language-agnostic schemas & docs (JSON Schema, .md)
  schemas/
  vocab/
  examples/

/python_toolkit/             # Core Python implementation (indexing, AI, CLI bindings)
  toolkit_lib/
    indexing/
    search/
    storage/
      backends/ (fs, s3, perforce_stub, perforce_live)
    ai/
    models/  (pydantic schemas)
    util/
  cli/
    cli.py
  tests/

/web_app/                    # Current viewer (evolves toward modular components)
  public/
  src/                       # (future: TypeScript, build system)
    core/ (fetch adapters -> storage gateway API)
    components/
    workers/

/qt_app/                     # (future) PySide6 / Qt for desktop rich tools
  src/

/scripts/                    # Cross-interface build helpers (generate shards, migrate)

/packaging/                  # Installer manifests, build scripts

/docs/                       # Additional architecture, ADRs

README.md
copilot-instructions.md      # (this file)
```

Minimal initial migration step: keep existing `public/` where it is, but new work targets `/web_app/` while we gradually move assets. A backward compatibility symlink or small proxy can forward old paths.

---
## 3. Multi-Interface Design
| Interface | Primary Use | Notes |
|-----------|-------------|-------|
| CLI       | Index build, validation, AI enrichment, batch ops | Must run headless & scriptable in CI/CD |
| Web UI    | Fast browse, search, preview, light metadata insight | Already prototyped; will call a local `storage-gateway` layer |
| Qt UI     | Heavy editing: batch tag curation, visual diff, version promotion | Shares Python core modules |

Adapters present a stable **Core API** surface: `IndexManager`, `SearchService`, `AssetResolver`, `AuthPolicy`, `AIPipeline`.

---
## 4. Storage & Versioning Strategy (Evaluation)
We need global access + role-based write control + efficient large binary handling.

### 4.1 Candidates
| Option | Pros | Cons | Recommended Role |
|--------|------|------|------------------|
| Perforce (Helix) | Battle-tested for large binaries, fine-grained locking, partial sync | License cost, heavy client workflow for casual users, metadata coupling | Good if studio already standardized on P4; use for authoritative write store |
| Git LFS | Familiar workflow, free basics | Poor at tens of thousands of large revisions (clone cost, history weight) | Not ideal for main binary store |
| S3 / Object Storage + CDN | Scales cheaply, global replication, lifecycle policies | Need custom metadata & permissions layer, eventual consistency | Primary binary blob store (content-addressable) |
| Artifactory / Nexus | Built-in metadata, permissioning | Complexity & cost, less tailored to 3D asset semantics | Optional for packaged derivatives |
| Perforce + S3 Hybrid | Use P4 for working sources; publish processed/optimized variants to S3 | Complexity, dual sources of truth | Viable transitional strategy |

### 4.2 Recommended Baseline
1. **Content Addressable Blob Store** (e.g., S3 bucket `assets-blobs`): object key = `<algo>/<first2>/<hash>` (e.g., `sha256/be/bed91f...`).
2. **Logical Asset Folder Manifest**: lightweight JSON referencing blob hashes + semantic filenames.
3. **Immutable Versions**: Each version JSON carries hash of all referenced blobs + derived `versionHash`; latest pointer stored in index.
4. **Metadata Index Shards**: Pre-built & deployed to CDN edge; consumers only need shard pull (no heavy repo sync).
5. **Write Flow**: Author uploads new blobs -> verify dedupe -> generate version manifest -> sign & submit -> indexing job updates shards and publishes new root manifest with changed hash.

### 4.3 Role & Access Model
| Role | Capabilities |
|------|--------------|
| Viewer | Read shards, fetch thumbnails, download published versions |
| Contributor | Propose new versions (staged), run local validation & AI tagging, upload blobs |
| Curator | Approve versions, manage tags, merge AI -> manual |
| Admin | Schema evolution, retention policies, revoke blobs |

Authorization mediated by a local policy file or JWT tokens if a central service emerges.

---
## 5. Performance & Indexing
| Concern | Approach |
|---------|----------|
| Search 50k+ | Token inverted index + optional Bloom filters per shard; Web Worker build; semantic vectors (PCA/IVF) lazily loaded |
| Render | Virtual grid (<=150 DOM nodes) + adaptive thumbnail sizing + requestIdleCallback hydration |
| Network | Shards ~100–250KB gzip; root manifest small (< 50KB) containing shard descriptors (category, count, hash) |
| Cache | Service Worker + IndexedDB storing processed tokens + revisionKey; invalidates on root manifest hash change |
| Memory | Keep only active shard objects + eviction of least recently viewed categories |

Sharding dimension: primary by `category` OR by hash prefix for heavily skewed categories; store mapping in root manifest.

---
## 6. Core Schemas (Unified)
### 6.1 Asset (version-agnostic header)
```jsonc
{
  "schemaVersion": 2,
  "id": "sha256:be122b74...",        // optional full hash or logical UUID
  "shortId": "be122b74",
  "slug": "tbl_dng_set",
  "type": "asset",                    // asset | material | texture | hdri | decal | vegetation
  "category": "furniture",
  "tags": ["table","dining"],
  "ai": { "autoTags": ["chair"], "caption": "modern dining set", "embeddingId": "be122b74" },
  "versions": [ /* lightweight entries (see below) */ ],
  "latestVersion": "002"
}
```
### 6.2 Version Entry
```jsonc
{
  "version": "002",
  "created": "2025-08-10T12:00:00Z",
  "author": "userA",
  "usd": { "blob": "sha256:...", "path": "tbl_dng_set_be122b74_v002.usd" },
  "preview": { "small": "v002/previews/preview_01_256.jpg", "medium": "v002/previews/preview_01_512.jpg" },
  "sources": [ { "type": "max", "blob": "sha256:..." } ],
  "metrics": { "polyCount": 15234, "fileSizeBytes": 1048576 },
  "materialsLocal": ["mat_local_01"],
  "materialsShared": ["stl_scr_3004fdb5"],
  "integrity": { "versionHash": "sha256:..." }
}
```
### 6.3 Shard Manifest
```jsonc
{
  "schemaVersion": 2,
  "shardId": "category:furniture",
  "generated": "2025-08-15T09:12:00Z",
  "itemCount": 4231,
  "items": [ { "id":"be122b74","displayName":"Table Dining Set","category":"furniture","tags":["table","dining"],"thumb":".../preview_01_256.jpg","latestVersion":"002","updated":"2025-08-14" } ],
  "hash": "sha256:...",
  "vectors": { "dim": 32, "file": "embeddings/furniture_vec32.bin" }
}
```

---
## 7. AI & Semantic Layer (Incremental)
Phases: (1) read-only AI tags -> (2) curator merge -> (3) semantic blend search -> (4) approximate NN acceleration (e.g. IVF/ANNoy) -> (5) local on-device embedding optional.

Blend scoring formula (initial): `score = 0.65 * keywordScore + 0.35 * semanticScore` with fallback to keyword only if vectors absent.

---
## 8. CLI Commands (Planned)
| Command | Purpose | Key Flags |
|---------|---------|-----------|
| `luxe index build` | Full (re)build shards | `--root`, `--out`, `--shard-strategy`, `--parallel` |
| `luxe index update` | Incremental update (detect changed manifests) | `--since`, `--watch` |
| `luxe validate` | Validate schema & integrity hashes | `--strict` |
| `luxe ai tag` | Run AI tagging pipeline | `--limit`, `--recompute` |
| `luxe ai embed` | Generate/reduce embeddings | `--dim 32` |
| `luxe serve` | Local dev server + API | `--port`, `--library-root` |
| `luxe export selection` | Bundle subset into zip/manifest | `--ids`, `--query` |

All commands rely on a shared config file (`luxe.config.json` or environment variables) plus optional `.env` overrides.

---
## 9. Web App Evolution
Current prototype stays functional; roadmap steps:
1. Introduce a thin `StorageGateway` module (switchable: local JSON -> future HTTP API).
2. Replace monolithic state object with small signal/store pattern (still no heavy framework needed initially).
3. Worker-based indexing (token map, tag map, vector normalization).
4. Service Worker & IndexedDB caching layer.
5. Detail panel enrichment: version switching, material navigation (no OS openDir, removed for security/portability).
6. Pluggable renderer slot for future 3D preview (GLTF/USD staging).

---
## 10. Qt UI (Future)
Focus: batch operations (retag, version promotion, conflict resolution). Shares Python `toolkit_lib`. Emits events over local websocket or direct in-process calls. Maintains parity with Web UI for visual previews (Qt OpenGL viewport or embedded web component via QWebEngine).

---
## 11. Error Handling & Telemetry
Central util: `reportError(context, error)` -> console + optional local log file (`logs/toolkit.log`). Add lightweight performance marks: *indexLoad*, *firstPaint*, *searchApply*.

---
## 12. Security & Integrity
| Mechanism | Detail |
|-----------|--------|
| Hashing | SHA256 for blobs + versionHash (Merkle of referenced blobs) |
| Manifest Signing (future) | Optional signature field for curated release bundles |
| Role Policy | JSON policy file mapping user/groups -> actions (validate at CLI & UI) |
| Path Safety | No direct OS path open from web UI (removed); CLI handles local ops |

---
## 13. Migration Plan from Current Prototype
| Step | Action |
|------|--------|
| 1 | Add new folder layout scaffolding (core, python_toolkit) |
| 2 | Extract existing indexing JS logic -> Python `toolkit_lib/indexing` parity |
| 3 | Generate shards via Python; web consumes them unchanged initially |
| 4 | Introduce worker-based search; deprecate linear scan |
| 5 | Add service worker + IndexedDB cache |
| 6 | Add CLI packaging + simple installer script |
| 7 | Introduce AI tagging pipeline (offline) |
| 8 | Implement semantic vector search (phase 1) |

---
## 14. Contributor Checklist
- [ ] Schema version bump evaluated (backwards compatibility note written)
- [ ] Shard hash updated & root manifest regenerated
- [ ] Performance regression (< 10% slower search) avoided or justified
- [ ] Accessibility audit (keyboard + ARIA grid) passes
- [ ] New CLI command has help text & dry-run mode
- [ ] AI pipeline outputs deterministic (seed set) or variability documented

---
## 15. FAQ (Updated)
**Q:** Why not only Perforce?  
**A:** Global performance + cost + casual contributor friction. Hybrid object storage reduces clone/sync overhead and allows CDN acceleration.

**Q:** How do we keep local cache fresh?  
**A:** Compare root manifest hash; if changed, invalidate dependent shard caches (indexed by hash) and re-fetch those shards only.

**Q:** How large can shards be?  
**A:** Target < 250KB gzip (≈5–8K minimal entries) to keep first meaningful paint fast; split if category grows beyond threshold.

**Q:** How do we store embeddings?  
**A:** Separate binary `.bin` (Float32 or quantized Int8) per shard; lazy load when semantic search toggled.

**Q:** Conflict resolution for concurrent version submissions?  
**A:** Deterministic version numbering (zero-padded incremental) + serverless lock file (atomic write) or later central coordination service.

---
## 16. Legacy Spec Reference
The previous single-interface viewer specification (virtual grid, initial schemas, AI tagging roadmap) remains valid for UI behavior and is retained conceptually. Implementation details are superseded where this document differs (e.g., schemaVersion=2, removal of OS directory open actions, content-addressable storage model).

---
## 17. Next Immediate Tasks
1. Add new directory scaffolding (empty placeholders + README stubs).
2. Extract current index build script logic into Python prototype (mirroring fields) while still supporting current JS script as fallback.
3. Introduce root manifest with shard descriptors (even if only one shard initially) to future-proof.
4. Insert worker stub in web app for future search index building.
5. Draft JSON Schemas for Asset v2, Shard v2, and Version entry.

---
## 18. License & Attribution
Internal prototype. Ensure third‑party assets respect original licensing; track license in schema per version when needed.

---
### End of File
