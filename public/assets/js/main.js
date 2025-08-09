import { VirtualGrid } from './virtual-grid.js';

// Simple global state
const State = {
  items: [],
  filtered: [],
  categories: new Set(),
  types: new Set(),
  filters: { categories: new Set(), types: new Set(), query: '', sort: 'name', semantic: false },
  indexLoaded: false,
};

const el = {
  searchInput: document.getElementById('searchInput'),
  categoryFilters: document.getElementById('categoryFilters'),
  typeFilters: document.getElementById('typeFilters'),
  sortSelect: document.getElementById('sortSelect'),
  statusBar: document.getElementById('statusBar'),
  grid: document.getElementById('virtualGrid'),
  drawer: document.getElementById('detailDrawer'),
  drawerBody: document.getElementById('detailBody'),
  drawerTitle: document.getElementById('detailTitle'),
  closeDetail: document.getElementById('closeDetail'),
  toggleTheme: document.getElementById('toggleTheme'),
  semanticToggle: document.getElementById('semanticToggle'),
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  openSettings: document.getElementById('openSettings'),
  settingsPanel: document.getElementById('settingsPanel'),
  closeSettings: document.getElementById('closeSettings'),
  cancelSettings: document.getElementById('cancelSettings'),
  settingsForm: document.getElementById('settingsForm'),
  libraryRootInput: document.getElementById('libraryRootInput'),
  settingsMessage: document.getElementById('settingsMessage'),
};

// Grid
const grid = new VirtualGrid({
  container: el.grid,
  scrollParent: document.getElementById('gridContainer'),
  renderItem: asset => createAssetCard(asset),
  itemMinWidth: 200,
  itemHeight: 240,
  gap: 12,
  overscanRows: 2
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
  window.addEventListener('hashchange', () => routeFromHash());
  window.addEventListener('resize', debounce(()=> grid.refreshLayout(), 150));
  el.openSettings?.addEventListener('click', () => openSettings());
  el.closeSettings?.addEventListener('click', () => closeSettings());
  el.cancelSettings?.addEventListener('click', () => closeSettings());
  el.settingsForm?.addEventListener('submit', e => { e.preventDefault(); saveSettings(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.settingsPanel.classList.contains('hidden')) closeSettings(); });
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
  const base = el.statusBar.textContent.split(' | ')[0];
  const short = rootPath.length > 30 ? '…' + rootPath.slice(-28) : rootPath;
  el.statusBar.textContent = `${base} | Root: ${short}`;
}

function openSettings() { el.settingsPanel.classList.remove('hidden'); el.libraryRootInput.focus(); }
function closeSettings() { el.settingsPanel.classList.add('hidden'); }

async function loadIndexRoot() {
  try {
    const start = performance.now();
    const res = await fetch('data/index_root.json');
    const root = await res.json();
    // For prototype, root already contains items (mock). Real impl: multiple shards.
    State.items = root.items || [];
    State.indexLoaded = true;
    buildFacetSets();
    renderFacetFilters();
    applyFilters();
    const dur = (performance.now() - start).toFixed(1);
    el.statusBar.textContent = `Loaded ${State.items.length.toLocaleString()} items in ${dur}ms`;
  } catch (err) {
    console.error(err);
    el.statusBar.textContent = 'Failed to load index';
  }
}

function buildFacetSets() {
  State.categories.clear();
  State.types.clear();
  for (const it of State.items) {
    if (it.category) State.categories.add(it.category);
    if (it.type) State.types.add(it.type);
  }
}

function renderFacetFilters() {
  el.categoryFilters.innerHTML = '';
  [...State.categories].sort().forEach(cat => {
    const id = `cat-${cat}`;
    const div = document.createElement('div');
    div.className = 'form-check form-check-sm';
    div.innerHTML = `<input class="form-check-input" type="checkbox" id="${id}" data-cat="${cat}"><label class="form-check-label small" for="${id}">${cat}</label>`;
    div.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) State.filters.categories.add(cat); else State.filters.categories.delete(cat); applyFilters();
    });
    el.categoryFilters.appendChild(div);
  });
  el.typeFilters.innerHTML = '';
  [...State.types].sort().forEach(type => {
    const id = `type-${type}`;
    const div = document.createElement('div');
    div.className = 'form-check form-check-sm';
    div.innerHTML = `<input class="form-check-input" type="checkbox" id="${id}" data-type="${type}"><label class="form-check-label small" for="${id}">${type}</label>`;
    div.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) State.filters.types.add(type); else State.filters.types.delete(type); applyFilters();
    });
    el.typeFilters.appendChild(div);
  });
}

function applyFilters() {
  const { query, categories, types, sort } = State.filters;
  let list = State.items;
  if (categories.size) list = list.filter(i => categories.has(i.category));
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
  div.innerHTML = `
    <div class="asset-thumb-wrapper ${asset.thumb ? '' : 'skeleton'}">
      ${asset.thumb ? `<img loading="lazy" decoding="async" src="${asset.thumb}" alt="${asset.displayName}">` : ''}
    </div>
    <div class="asset-meta">
      <div class="asset-name" title="${asset.displayName}">${asset.displayName}</div>
      <div class="asset-tags">${renderTagPills(asset)}</div>
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
  // In real impl, fetch full asset_info.json here
  setTimeout(() => {
    el.drawerBody.innerHTML = detailTemplate(asset);
  }, 100); // simulate latency
}

function detailTemplate(a) {
  return `<div>
    <div class="ratio ratio-4x3 mb-2" style="background:#222;">
      ${a.thumb ? `<img src="${a.thumb}" alt="${a.displayName}" style="object-fit:contain;">` : ''}
    </div>
    <h3>${a.displayName}</h3>
    <p class="small text-muted mb-1">Category: ${a.category || '—'} | Type: ${a.type || '—'}</p>
    <p class="small">ID: <code>${a.id || a.shortId}</code></p>
    ${a.tags?.length ? `<div class="mb-2"><strong>Tags:</strong> ${a.tags.map(t=>`<span class=tag>${t}</span>`).join(' ')}</div>`:''}
    ${a.autoTags?.length ? `<div class="mb-2"><strong>AI Tags:</strong> ${a.autoTags.map(t=>`<span class='tag tag-ai' title='AI generated'>${t}</span>`).join(' ')}</div>`:''}
    <div class="mt-3">
      <button class="btn btn-sm btn-primary" disabled>Download (stub)</button>
    </div>
  </div>`;
}

function closeDetail() { el.drawer.classList.remove('open'); }

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); }; }

function routeFromHash() { /* reserved for future deep-linking */ }

// Mock service worker registration placeholder
if ('serviceWorker' in navigator) {
  // navigator.serviceWorker.register('sw.js'); // add once sw exists
}
