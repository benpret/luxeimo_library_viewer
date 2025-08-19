import { VirtualGrid } from './virtual-grid.js';

// Simple global state
const State = {
  items: [],
  filtered: [],
  types: new Set(),
  filters: { types: new Set(), query: '', sort: 'name', semantic: false },
  indexLoaded: false,
  folderTree: null,
  currentFolder: '', // path prefix filter (relDir startsWith)
};

const el = {
  searchInput: document.getElementById('searchInput') || null,
  categoryFilters: document.getElementById('categoryFilters') || null, // repurposed as folder tree container
  typeFilters: document.getElementById('typeFilters') || null,
  sortSelect: document.getElementById('sortSelect') || null,
  statusBar: document.getElementById('statusBar') || { textContent:'' },
  grid: document.getElementById('virtualGrid') || null,
  drawer: document.getElementById('detailDrawer') || { classList: { add(){}, remove(){} } },
  drawerBody: document.getElementById('detailBody') || { innerHTML:'' },
  drawerTitle: document.getElementById('detailTitle') || { textContent:'' },
  closeDetail: document.getElementById('closeDetail') || null,
  toggleTheme: document.getElementById('toggleTheme') || null,
  semanticToggle: document.getElementById('semanticToggle') || null,
  sidebar: document.getElementById('sidebar') || { classList:{ add(){}, remove(){}, toggle(){} } },
  sidebarToggle: document.getElementById('sidebarToggle') || null,
  openSettings: document.getElementById('openSettings') || null,
  settingsPanel: document.getElementById('settingsPanel') || { classList:{ add(){}, remove(){}, contains(){ return false; } } },
  closeSettings: document.getElementById('closeSettings') || null,
  cancelSettings: document.getElementById('cancelSettings') || null,
  settingsForm: document.getElementById('settingsForm') || null,
  libraryRootInput: document.getElementById('libraryRootInput') || null,
  settingsMessage: document.getElementById('settingsMessage') || { classList:{ add(){}, remove(){} } },
  quickFilters: document.getElementById('quickFilters') || null,
  thumbSizeGroup: document.getElementById('thumbSizeGroup') || null,
};

// Grid
const grid = new VirtualGrid({
  container: el.grid,
  scrollParent: document.getElementById('gridContainer'),
  renderItem: asset => createAssetCard(asset),
  itemMinWidth: 280,
  itemHeight: 280,
  gap: 6,
  overscanRows: 2,
  square: true
});

// Init
bootstrap();

async function bootstrap() {
  focusSearchHotkey();
  themeInit();
  wireEvents();
  loadIndexRoot();
  loadSettings();
}

function focusSearchHotkey() {
  window.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== el.searchInput) {
      e.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
    }
  });
}

function themeInit() {
  const current = localStorage.getItem('theme');
  if (current) document.documentElement.dataset.theme = current;
  el.toggleTheme.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  });
}

function wireEvents() {
  el.searchInput.addEventListener('input', debounce(e => {
    State.filters.query = e.target.value.trim().toLowerCase();
    applyFilters();
  }, 150));
  el.sortSelect.addEventListener('change', () => { State.filters.sort = el.sortSelect.value; applyFilters(); });
  el.semanticToggle.addEventListener('change', () => { State.filters.semantic = el.semanticToggle.checked; applyFilters(); });
  el.closeDetail.addEventListener('click', () => closeDetail());
  el.sidebarToggle?.addEventListener('click', () => { el.sidebar.classList.toggle('open'); });
  // Close sidebar on outside click (mobile)
  document.addEventListener('click', e => {
    if (window.innerWidth < 900 && el.sidebar.classList.contains('open')) {
      if (!el.sidebar.contains(e.target) && e.target !== el.sidebarToggle) el.sidebar.classList.remove('open');
    }
  });
  window.addEventListener('hashchange', () => routeFromHash());
  window.addEventListener('resize', debounce(()=> grid.refreshLayout(), 150));
  el.openSettings?.addEventListener('click', () => openSettings());
  el.closeSettings?.addEventListener('click', () => closeSettings());
  el.cancelSettings?.addEventListener('click', () => closeSettings());
  el.settingsForm?.addEventListener('submit', e => { e.preventDefault(); saveSettings(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.settingsPanel.classList.contains('hidden')) closeSettings(); });
  // Keyboard navigation in grid
  document.addEventListener('keydown', e => handleGridNavigation(e));
  // Thumbnail size controls
  if (el.thumbSizeGroup) {
  el.thumbSizeGroup.querySelectorAll('.ts-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.thumbSizeGroup.querySelectorAll('.ts-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const size = parseInt(btn.dataset.size,10);
        updateThumbSize(size);
      });
    });
  // Sync active to current grid size
  const active = el.thumbSizeGroup.querySelector(`.ts-btn[data-size="${grid.itemMinWidth}"]`);
  if (active) { el.thumbSizeGroup.querySelectorAll('.ts-btn').forEach(b=>b.classList.remove('active')); active.classList.add('active'); }
  }
}

function loadSettings() {
  const root = localStorage.getItem('libraryRoot') || 'C:\\ImerzaLibrary';
  el.libraryRootInput && (el.libraryRootInput.value = root);
  updateStatusSuffix(root);
}

function saveSettings() {
  const val = el.libraryRootInput.value.trim();
  if (val) {
    localStorage.setItem('libraryRoot', val);
    updateStatusSuffix(val);
    el.settingsMessage.classList.remove('d-none');
    setTimeout(()=> { el.settingsMessage.classList.add('d-none'); closeSettings(); }, 800);
  }
}

function updateStatusSuffix(rootPath) {
  // Append root path (shortened) to status bar for context
  if (!el.statusBar) return;
  const base = (el.statusBar.textContent||'').split(' | ')[0];
  const short = rootPath.length > 30 ? '…' + rootPath.slice(-28) : rootPath;
  el.statusBar.textContent = `${base} | Root: ${short}`;
}

function openSettings() { el.settingsPanel.classList.remove('hidden'); el.libraryRootInput.focus(); }
function closeSettings() { el.settingsPanel.classList.add('hidden'); }

async function loadIndexRoot() {
  try {
    const start = performance.now();
  const res = await fetch('data/index_root.json', { cache:'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  let text = await res.text();
  let root;
  try { root = JSON.parse(text); }
  catch(parseErr) { throw new Error('JSON parse error: ' + parseErr.message + (text.slice(0,40)?' (first chars: '+text.slice(0,120).replace(/\s+/g,' ')+'...)':'')); }
    // For prototype, root already contains items (mock). Real impl: multiple shards.
    State.items = root.items || [];
    State.indexLoaded = true;
  buildFacetSets();
  buildFolderTree(); // sets State.folderTree for folder navigation
  buildQuickFilters();
  renderFolderTree();
  renderFacetFilters(); // only renders legacy category checkboxes if no folder tree
    applyFilters();
    const dur = (performance.now() - start).toFixed(1);
    const rootInfo = root.sourceRoot ? ` | Src: ${truncatePath(root.sourceRoot)}` : '';
    el.statusBar.textContent = `Loaded ${State.items.length.toLocaleString()} items in ${dur}ms${rootInfo}`;
    if (!State.items.length) {
      el.statusBar.textContent += ' (No assets found - run build_index_from_library script)';
    }
  } catch (err) {
    console.error('Index load failed:', err);
    el.statusBar.textContent = 'Failed to load index';
    // Surface brief diagnostic after a short delay
    setTimeout(()=> { el.statusBar.textContent = 'Failed to load index - ' + (err.message||'error'); }, 400);
  }
}

function buildFacetSets() {
  State.types.clear();
  for (const it of State.items) if (it.type) State.types.add(it.type);
}

// ---------------- Folder Tree ----------------
function buildFolderTree() {
  // Build hierarchical directory structure from relDir segments, EXCLUDING final asset folder
  const root = { name: 'root', path: '', children: new Map(), depth:0, count:0 };
  for (const it of State.items) {
    if (!it.relDir) continue;
    const segments = it.relDir.split('/');
    if (segments.length < 2) continue; // skip assets with no parent folder depth
    const upTo = segments.slice(0, -1); // drop last asset folder segment
    let node = root; let accum = '';
    for (const seg of upTo) {
      accum = accum ? accum + '/' + seg : seg;
      if (!node.children.has(seg)) node.children.set(seg, { name: seg, path: accum, children: new Map(), depth: node.depth+1, count:0 });
      node = node.children.get(seg);
    }
  }
  // Second pass: accumulate counts (number of assets whose relDir is under each folder path)
  for (const it of State.items) {
    if (!it.relDir) continue;
    const segments = it.relDir.split('/');
    if (segments.length < 2) continue;
    const upTo = segments.slice(0,-1);
    let accum=''; let node = root;
    for (const seg of upTo) {
      accum = accum ? accum + '/' + seg : seg;
      const child = node.children.get(seg);
      if (!child) break; // safety
      child.count++;
      node = child;
    }
    root.count++; // total asset count reference (if needed)
  }
  State.folderTree = root;
}

function renderFolderTree() {
  if (!el.categoryFilters) return;
  const container = el.categoryFilters;
  // Clear previous content & detach old listeners by cloning
  const clone = container.cloneNode(false);
  container.parentNode.replaceChild(clone, container);
  el.categoryFilters = clone;
  const containerRef = el.categoryFilters;
  containerRef.innerHTML = '';
  const treeEl = document.createElement('div');
  treeEl.className = 'folder-tree';

  function createNodeEl(node) {
    if (node.name === 'root') {
      const rootEl = document.createElement('div');
      rootEl.className = 'ft-root';
      rootEl.innerHTML = `<div class="ft-node ft-all ${State.currentFolder?'':'active'}" data-path="">All Folders</div>`;
      node.children && [...node.children.values()].sort((a,b)=> a.name.localeCompare(b.name,undefined,{sensitivity:'base'})).forEach(ch=> rootEl.appendChild(createNodeEl(ch)));
      return rootEl;
    }
    const hasChildren = node.children && node.children.size>0;
    const wrapper = document.createElement('div');
    wrapper.className = 'ft-branch collapsed'; // start collapsed
    const isActive = State.currentFolder === node.path;
    wrapper.innerHTML = `
      <div class="ft-node ${hasChildren?'has-children':''} ${isActive?'active':''}" data-path="${node.path}" title="${node.path}">
        ${hasChildren?'<span class="ft-expander" aria-hidden="true"></span>':'<span class="ft-leaf-dot" aria-hidden="true"></span>'}
        <span class="ft-label">${node.name}</span>
        <span class="ft-count" aria-label="${node.count} items">${node.count}</span>
      </div>`;
    if (hasChildren) {
      const kids = document.createElement('div');
      kids.className = 'ft-children';
      [...node.children.values()].sort((a,b)=> a.name.localeCompare(b.name,undefined,{sensitivity:'base'})).forEach(ch=> kids.appendChild(createNodeEl(ch)));
      wrapper.appendChild(kids);
    }
    return wrapper;
  }

  treeEl.appendChild(createNodeEl(State.folderTree));
  containerRef.appendChild(treeEl);

  // Event delegation
  containerRef.addEventListener('click', e => {
    const expander = e.target.closest('.ft-expander');
    const nodeEl = e.target.closest('.ft-node');
    if (!nodeEl) return;
    if (expander) { nodeEl.parentElement.classList.toggle('collapsed'); return; }
    // If clicked node has children, toggle expand instead of filtering when modifier not held
    if (nodeEl.parentElement?.classList.contains('ft-branch') && nodeEl.parentElement.querySelector('.ft-children')) {
      if (!e.altKey && !e.metaKey && !e.ctrlKey && nodeEl.dataset.path) {
        nodeEl.parentElement.classList.toggle('collapsed');
      }
    }
    const path = nodeEl.dataset.path || '';
    State.currentFolder = (State.currentFolder === path) ? '' : path;
    applyFilters();
    // Update active classes
    containerRef.querySelectorAll('.ft-node').forEach(n=> n.classList.toggle('active', n.dataset.path===State.currentFolder || (!State.currentFolder && n.classList.contains('ft-all'))));
  }, { once:false });
}

function buildQuickFilters() {
  if (!el.quickFilters) return;
  const chips = [
  { id:'all', label:'All', action: () => { State.filters.types.clear(); applyFilters(); highlightChip('all'); } },
    { id:'assets', label:'Assets', action: () => { State.filters.types = new Set(['asset']); applyFilters(); highlightChip('assets'); } },
    { id:'materials', label:'Materials', action: () => { State.filters.types = new Set(['material']); applyFilters(); highlightChip('materials'); } },
    { id:'textures', label:'Textures', action: () => { State.filters.types = new Set(['texture']); applyFilters(); highlightChip('textures'); } },
    { id:'recent', label:'Recent', action: () => { State.filters.sort = 'updated'; el.sortSelect.value='updated'; applyFilters(); highlightChip('recent'); } }
  ];
  el.quickFilters.innerHTML = chips.map(c => `<button type="button" data-chip="${c.id}" class="qf-chip" id="qf-${c.id}">${c.label}</button>`).join('');
  chips.forEach(c => {
    const btn = document.getElementById('qf-'+c.id);
    btn.addEventListener('click', c.action);
  });
  highlightChip('all');
}

function highlightChip(id) {
  el.quickFilters.querySelectorAll('.qf-chip').forEach(ch => ch.classList.toggle('active', ch.dataset.chip===id));
}

function renderFacetFilters() { // only type filters retained (currently none in sidebar)
  if (!el.typeFilters) return;
  el.typeFilters.innerHTML='';
  [...State.types].sort().forEach(type => {
    const id = `type-${type}`;
    const div = document.createElement('div');
    div.className = 'form-check form-check-sm';
    div.innerHTML = `<input class="form-check-input" type="checkbox" id="${id}" data-type="${type}"><label class="form-check-label small" for="${id}">${type}</label>`;
    div.querySelector('input').addEventListener('change', e => { if (e.target.checked) State.filters.types.add(type); else State.filters.types.delete(type); applyFilters(); });
    el.typeFilters.appendChild(div);
  });
}

function applyFilters() {
  const { query, types, sort } = State.filters;
  let list = State.items;
  // Folder path filter
  if (State.currentFolder) list = list.filter(i => i.relDir && i.relDir.startsWith(State.currentFolder));
  if (types.size) list = list.filter(i => types.has(i.type));
  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean);
    list = list.filter(i => {
      const hay = (i.displayName + ' ' + (i.tags || []).join(' ')).toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }
  // Sorting
  list = [...list];
  const dir = sort.startsWith('-') ? -1 : 1;
  const key = sort.replace(/^-/,'');
  list.sort((a,b) => {
    if (key === 'updated') return dir * ((b.updated || '')).localeCompare(a.updated || '');
    return dir * a.displayName.localeCompare(b.displayName);
  });
  State.filtered = list;
  grid.setItems(State.filtered);
  el.statusBar.textContent = `${State.filtered.length.toLocaleString()} results`;
}

function createAssetCard(asset) {
  const div = document.createElement('button');
  div.className = 'asset-card text-start';
  div.setAttribute('type','button');
  div.dataset.id = asset.id || asset.shortId;
  div.tabIndex = 0;
  const safeName = asset.displayName?.replace(/"/g,'&quot;') || '';
  div.innerHTML = `
    <div class="asset-thumb-wrapper ${asset.thumb ? '' : 'skeleton'}">
      ${asset.thumb ? `<img loading="lazy" decoding="async" src="${asset.thumb}" alt="${safeName}">` : ''}
      <div class="thumb-name-bar" aria-hidden="true">${safeName}</div>
    </div>`;
  div.addEventListener('click', () => openDetail(asset));
  return div;
}

function renderTagPills(asset) {
  const manual = asset.tags || [];
  const ai = asset.autoTags || [];
  return [...manual.slice(0,3).map(t => `<span class="tag">${t}</span>`), ...ai.slice(0,2).map(t => `<span class="tag tag-ai" title="AI tag">${t}</span>`)].join('');
}

async function openDetail(asset) {
  el.drawerTitle.textContent = asset.displayName;
  el.drawerBody.innerHTML = '<div class="small text-muted">Loading metadata…</div>';
  el.drawer.classList.add('open');
  // Fetch full asset_info.json to enrich details (materials, versions, etc.)
  try {
    if (asset.relDir) {
      const res = await fetch('/' + asset.relDir + '/asset_info.json');
      if (res.ok) {
        const full = await res.json();
        asset._fullMeta = full;
      }
    }
  } catch(e){ /* ignore, fallback to minimal */ }
  el.drawerBody.innerHTML = detailTemplate(asset);
  const dirBtn = document.getElementById('openDirBtn');
  if (dirBtn) {
    dirBtn.addEventListener('click', async () => {
      dirBtn.disabled = true;
      try {
          const sel = document.getElementById('versionSelect');
          let rel = dirBtn.dataset.rel;
          const chosen = sel ? sel.value : null;
          if (chosen) {
            const folder = /^v\d{3}$/i.test(chosen) ? chosen.toLowerCase() : ('v'+chosen.toLowerCase());
            if (!rel.toLowerCase().endsWith('/'+folder)) rel = rel + '/' + folder;
          }
          const resp = await fetch(`/api/openDir?rel=${encodeURIComponent(rel)}`);
          if (!resp.ok) {
            console.warn('Open directory failed', resp.status, rel);
            dirBtn.textContent = 'Open Failed';
            setTimeout(()=> dirBtn.textContent='Open Directory', 1200);
          } else {
            dirBtn.textContent = 'Opened';
            setTimeout(()=> dirBtn.textContent='Open Directory', 800);
          }
      } finally { dirBtn.disabled = false; }
    });
  }
  // Wire browse buttons for materials
    document.querySelectorAll('.mat-browse').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await fetch(`/api/openDir?rel=${encodeURIComponent(btn.dataset.rel)}`); }
        finally { btn.disabled = false; }
      });
    });
    // Wire ID copy button
    document.querySelectorAll('.id-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idVal = btn.dataset.id;
        if (!idVal) return;
        try { await navigator.clipboard.writeText(idVal); } catch(e) { /* ignore */ }
        const orig = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(()=> { btn.textContent = orig; btn.classList.remove('copied'); }, 900);
      });
    });
    // Tag click -> add to search box (avoid duplicates) and apply filters
    el.drawerBody.querySelectorAll('.tags-wrap .tag').forEach(tagEl => {
      tagEl.addEventListener('click', () => {
        const val = tagEl.textContent.trim();
        if (!val) return;
        const current = el.searchInput.value.trim();
        const tokens = current.split(/\s+/).filter(Boolean);
        if (!tokens.map(t=>t.toLowerCase()).includes(val.toLowerCase())) tokens.push(val);
        el.searchInput.value = tokens.join(' ');
        State.filters.query = el.searchInput.value.toLowerCase();
        applyFilters();
        el.searchInput.focus();
      });
    });

    // Dynamic preview aspect: set container aspect-ratio to image's intrinsic ratio to avoid side bars
    const previewShell = el.drawerBody.querySelector('.preview-shell');
    const imgEl = previewShell?.querySelector('img');
    function adjustPreviewRatio() {
      if (!imgEl || !previewShell) return;
      const { naturalWidth: w, naturalHeight: h } = imgEl;
      if (!w || !h) return;
      const ratio = w / h;
      // Clamp ratio to sane bounds to prevent extreme layout issues
      const clamped = Math.min(Math.max(ratio, 0.5), 2.0);
      // Use rounded precision to reduce layout thrash
      previewShell.style.aspectRatio = clamped.toFixed(3);
      previewShell.classList.toggle('square', Math.abs(1 - clamped) < 0.08);
    }
    if (imgEl) {
      if (imgEl.complete) adjustPreviewRatio(); else imgEl.addEventListener('load', adjustPreviewRatio, { once:true });
    }
}

function detailTemplate(a) {
  // Determine relative dir (precomputed or inferred from thumb path)
  let relDir = a.relDir;
  if (!relDir && a.thumb) {
    const parts = a.thumb.split('/');
    const idx = parts.findIndex(p => /^v\d{3}$/i.test(p));
    if (idx > 0) relDir = parts.slice(0, idx).join('/');
  }
  const openBtn = relDir ? `<button class="btn btn-sm btn-outline-secondary" id="openDirBtn" data-rel="${relDir}">Open Directory</button>` : '';
  const tags = a.tags?.length ? `<div class="tags-wrap">${a.tags.map(t=>`<span class=tag>${t}</span>`).join('')}</div>` : '<div class="text-muted small">No tags</div>';
  const versions = a.versions && a.versions.length ? [...a.versions] : (a.latestVersion ? [a.latestVersion] : []);
  const sortedVersions = versions.sort((x,y)=> y.localeCompare(x,undefined,{numeric:true,sensitivity:'base'}));
  const versionSelect = sortedVersions.length ? `<div class="meta-tile"><span class="meta-label">Version</span><div class="version-select"><select id="versionSelect">${sortedVersions.map(v=>`<option value="${v}">${v}</option>`).join('')}</select></div></div>` : '';

  // Material listings (only for non-material assets when full meta present)
  let materialsSection = '';
  if (a.type !== 'material' && a._fullMeta && Array.isArray(a._fullMeta.versions) && a._fullMeta.versions.length) {
    const latestFull = a._fullMeta.versions[a._fullMeta.versions.length - 1];
    const localMats = Array.isArray(latestFull.localMaterials) ? latestFull.localMaterials : [];
    const sharedMats = Array.isArray(latestFull.sharedMaterials) ? latestFull.sharedMaterials : [];
    const matRows = [];
    // Helper to resolve relativePath to directory under library root (strip version folder & filename, normalize ..)
    function normalizePathFromAsset(relDirAsset, relPath) {
      if (!relPath) return null;
      const combined = [...(relDirAsset?relDirAsset.split('/'):[]), ...relPath.split('/')];
      const stack = [];
      for (const seg of combined) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { stack.pop(); continue; }
        stack.push(seg);
      }
      // Remove filename
      if (stack.length) stack.pop();
      // If last is version folder like v001 remove it too
      if (stack.length && /^v\d{3}$/i.test(stack[stack.length-1])) stack.pop();
      return stack.join('/');
    }
    localMats.forEach(m => {
      // Local materials may only have a name; directory is asset's relDir
      const dir = relDir || a.relDir;
      matRows.push(`<div class="mat-row"><span class="mat-name">${m.displayName || m.name || m}</span><span class="badge bg-secondary">Local</span> ${dir?`<button class="btn btn-xs btn-outline-secondary mat-browse" data-rel="${dir}">Browse</button>`:''}</div>`);
    });
    sharedMats.forEach(m => {
      const dir = normalizePathFromAsset(a.relDir, m.relativePath);
      matRows.push(`<div class="mat-row"><span class="mat-name">${m.displayName || m.name}</span><span class="badge bg-info">Shared</span> ${dir?`<button class="btn btn-xs btn-outline-secondary mat-browse" data-rel="${dir}">Browse</button>`:''}</div>`);
    });
    if (matRows.length) {
      materialsSection = `<div class="divider"></div><div><span class="meta-label" style="margin-bottom:.35rem;">Materials</span><div class="materials-list">${matRows.join('')}</div></div>`;
    }
  }
  const imgMarkup = a.thumb ? `<img src="${a.thumb}" alt="${a.displayName}">` : '<div class="text-muted small">No preview</div>';
  const fullBtn = a.thumb ? `<button type="button" id="fullPreviewBtn" class="preview-expand-btn" title="Open Full Preview" aria-label="Open Full Preview"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>` : '';
  const previewBlock = `<div class="preview-shell">${imgMarkup}${fullBtn}</div>`;
    return `<div class="detail-body-inner">
      <div class="sticky-actions no-meta">
        <div class="sa-buttons">
          <button class="btn btn-xs btn-primary" disabled>Download (stub)</button>
          ${openBtn}
        </div>
      </div>
      ${previewBlock}
    <div class="title-row"><h3 class="mb-1 mt-2" title="${a.displayName}">${a.displayName}</h3><button type="button" class="id-pill id-copy-btn" data-id="${(a.id||a.shortId)||''}" title="Copy ID ${(a.id||a.shortId)||''}">ID</button></div>
    <div class="small text-muted">${a.category || '—'} • ${a.type || '—'}</div>
      <div class="divider"></div>
    <div class="meta-grid">
        <div class="meta-tile"><span class="meta-label">Updated</span><span class="meta-value">${a.updated || '—'}</span></div>
        <div class="meta-tile"><span class="meta-label">Type</span><span class="meta-value">${a.type||'—'}</span></div>
        <div class="meta-tile"><span class="meta-label">Category</span><span class="meta-value">${a.category||'—'}</span></div>
        ${versionSelect}
      </div>
      <div class="divider"></div>
      <div>
        <span class="meta-label" style="margin-bottom:.35rem;">Tags</span>
        ${tags}
      </div>
      ${materialsSection}
    </div>`;
}

function closeDetail() { el.drawer.classList.remove('open'); }

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); }; }

function routeFromHash() { /* reserved for future deep-linking */ }

// Mock service worker registration placeholder
if ('serviceWorker' in navigator) {
  // navigator.serviceWorker.register('sw.js'); // add once sw exists
}

function truncatePath(p){ return p && p.length>40 ? '…'+p.slice(-38) : p; }

function updateThumbSize(size) {
  grid.itemMinWidth = size;
  grid.itemHeight = size; // square mode
  grid.refreshLayout();
}

function handleGridNavigation(e) {
  const focusable = [...el.grid.querySelectorAll('.asset-card')];
  if (!focusable.length) return;
  const idx = focusable.indexOf(document.activeElement);
  const cols = grid.columns;
  let next = -1;
  switch(e.key) {
    case 'ArrowRight': next = idx < 0 ? 0 : Math.min(focusable.length-1, idx+1); break;
    case 'ArrowLeft': next = idx <= 0 ? 0 : idx-1; break;
    case 'ArrowDown': next = idx < 0 ? 0 : Math.min(focusable.length-1, idx+cols); break;
    case 'ArrowUp': next = idx < 0 ? 0 : Math.max(0, idx-cols); break;
    case 'Home': next = 0; break;
    case 'End': next = focusable.length-1; break;
    case 'Enter': if (document.activeElement && document.activeElement.classList.contains('asset-card')) { const id = document.activeElement.dataset.id; const asset = State.filtered.find(a => (a.id||a.shortId)==id); if (asset) openDetail(asset); } return;
    default: return;
  }
  if (next >= 0) {
    e.preventDefault();
    focusable[next].focus();
  }
}

// Full Preview Feature
function deriveFullPreviewCandidates(asset) {
  if (!asset.thumb) return [];
  const t = asset.thumb;
  const m = t.match(/^(.*\/preview_01)(?:_(\d+))?\.(png|jpe?g|webp)$/i);
  if (m) {
    const base = m[1];
    const ext = m[3];
    const list = [`${base}.${ext}`];
    if (ext.toLowerCase() !== 'png') list.push(`${base}.png`);
    return list;
  }
  // Generic fallback: strip _256/_512 before extension
  const stripped = t.replace(/_(256|512)(?=\.[a-z]+$)/i, '');
  return [stripped];
}

function openFullPreview(asset) {
  const existing = document.getElementById('fullPreviewOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'fullPreviewOverlay';
  overlay.className = 'preview-overlay';
  overlay.innerHTML = `<div class="preview-modal"><button class="close-preview" id="closeFullPreview" aria-label="Close full preview">×</button><div class="preview-img-wrap loading"><div class="spinner small"></div></div></div>`;
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
  }
  function escHandler(e){ if (e.key==='Escape') close(); }
  document.addEventListener('keydown', escHandler);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#closeFullPreview').addEventListener('click', close);

  const wrap = overlay.querySelector('.preview-img-wrap');
  const candidates = deriveFullPreviewCandidates(asset);
  if (!candidates.length) {
    wrap.classList.remove('loading');
    wrap.innerHTML = '<div class="text-muted small">No preview available</div>';
    return;
  }
  let idx = 0;
  const img = new Image();
  img.alt = asset.displayName || 'Preview';
  img.onload = () => {
    wrap.classList.remove('loading');
    wrap.innerHTML = '';
    wrap.appendChild(img);
  };
  img.onerror = () => {
    idx++;
    if (idx < candidates.length) {
      img.src = candidates[idx];
    } else {
      wrap.classList.remove('loading');
      wrap.innerHTML = '<div class="text-danger small">Failed to load full preview</div>';
    }
  };
  img.src = candidates[idx];
}

// Hook full preview button when detail loads (augment openDetail logic via MutationObserver alternative could be overkill)
const originalOpenDetail = openDetail;
openDetail = async function(asset){
  await originalOpenDetail(asset);
  const fp = document.getElementById('fullPreviewBtn');
  if (fp) fp.addEventListener('click', () => openFullPreview(asset));
};
