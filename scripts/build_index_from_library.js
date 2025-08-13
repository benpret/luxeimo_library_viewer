#!/usr/bin/env node
/*
 Scans a local asset library directory structure to build index_root.json
 Usage (PowerShell):
   node scripts/build_index_from_library.js -r "C:/ImerzaLibrary" -o public/data/index_root.json

 It looks for asset_info.json files anywhere under the root.
 Produces a flat items array with minimal fields for fast loading.
*/
const fs = require('fs');
const path = require('path');

function parseArgs(){
  const args = process.argv.slice(2);
  const opts = { root: null, out: 'public/data/index_root.json', prefix: '' };
  for (let i=0;i<args.length;i++) {
    const a = args[i];
    if ((a==='-r'||a==='--root') && args[i+1]) { opts.root = args[++i]; continue; }
    if ((a==='-o'||a==='--out') && args[i+1]) { opts.out = args[++i]; continue; }
    if ((a==='-p'||a==='--prefix') && args[i+1]) { opts.prefix = args[++i]; continue; }
  }
  if(!opts.root) { console.error('Missing --root path'); process.exit(1);} 
  return opts;
}

function walk(dir, cb){
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, cb);
    else if (e.isFile() && e.name === 'asset_info.json') cb(full);
  }
}

function loadJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')); }
  catch(err){ console.warn('Failed to parse', file, err.message); return null; }
}

function minify(meta, filePath, root, prefix='') {
  if (!meta) return null;
  const relDir = path.relative(root, path.dirname(filePath)).replace(/\\/g,'/');
  const latest = (meta.versions||[]).slice(-1)[0] || {};
  // Prefer higher-res thumbnail (512) if available
  const thumb =
    meta.thumbnails?.medium || // 512
    meta.thumbnails?.large  || // fallback up if present
    meta.thumbnails?.small  || // last resort (256)
    (latest.previewImages ? latest.previewImages[0] : null);
  const prefixAdj = prefix ? prefix.replace(/\/$/,'') + '/' : '';
  // Consolidate tags: legacy meta.tags + userTags + aiTags (dedup, preserve order: tags -> userTags -> aiTags)
  const baseTags = Array.isArray(meta.tags) ? meta.tags : [];
  const userTags = Array.isArray(meta.userTags) ? meta.userTags : [];
  const aiTags = Array.isArray(meta.aiTags) ? meta.aiTags : [];
  const seen = new Set();
  const tags = [];
  for (const list of [baseTags, userTags, aiTags]) {
    for (const t of list) {
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(t);
    }
  }
  return {
    id: meta.id || meta.shortId || path.basename(relDir),
    displayName: meta.displayName || meta.name || meta.slug || path.basename(relDir),
    slug: meta.slug || path.basename(relDir),
    type: meta.type || 'asset',
    category: meta.category || relDir.split('/')[0] || 'uncategorized',
    tags,
  relDir,
    thumb: thumb ? prefixAdj + relDir + '/' + thumb : null,
    latestVersion: latest.version || null,
  versions: Array.isArray(meta.versions) ? meta.versions.map(v=>v.version).filter(Boolean) : [],
    updated: latest.date || meta.createdDate || null
  };
}

function normalizeRoot(input) {
  // Accept forms like C:/ImerzaLibrary, C:\\ImerzaLibrary, /c/ImerzaLibrary
  let r = input.trim().replace(/^"|"$/g,'');
  // Fix accidental duplicate drive prefix e.g., C:\C:\ImerzaLibrary
  r = r.replace(/^(?:([A-Za-z]):\\)\1:/, '$1:');
  // Replace forward slashes with backslashes for Windows consistency
  if (/^[A-Za-z]:\//.test(r)) r = r.replace(/\//g,'\\');
  return r;
}

function main(){
  const { root, out, prefix } = parseArgs();
  const norm = normalizeRoot(root);
  const absRoot = path.resolve(norm);
  if (!fs.existsSync(absRoot)) {
    console.error('Root does not exist:', absRoot);
    console.error('Tip: Ensure the path is accessible and escaped properly. Example:');
    console.error('  node scripts/build_index_from_library.js -r "C:/ImerzaLibrary"');
    process.exit(1);
  } 
  const items = [];
  console.log('Scanning', absRoot);
  walk(absRoot, file => {
    const meta = loadJsonSafe(file);
    const min = minify(meta, file, absRoot, prefix);
    if (min) items.push(min);
  });
  items.sort((a,b)=> a.displayName.localeCompare(b.displayName));
  const output = { schemaVersion:1, generated: new Date().toISOString(), sourceRoot: absRoot, prefix, items };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(output,null,2));
  console.log('Wrote', out, 'items:', items.length);
}

if (require.main === module) main();
