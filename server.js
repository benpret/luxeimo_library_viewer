#!/usr/bin/env node
/*
 Lightweight static + library proxy server.
 Serves ./public as the web root and optionally proxies asset files from an external
 library root (e.g., C:/ImerzaLibrary) when requests (e.g. /Assets/...) are not found in public.

 Usage:
   node server.js --port 5173 --libraryRoot "C:/ImerzaLibrary"

 Options:
   --port <number>          Port to listen on (default 5173)
   --libraryRoot <path>     Absolute path to asset library root (optional)
   --allowRootFallback      If set, ANY missing path will be attempted from libraryRoot.
                            Otherwise only paths beginning with /Assets or /mats etc.

 Security Notes:
   - Prevents path traversal (..)
   - Only serves files, no directory listings
*/
import { createServer } from 'http';
import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { port: 5173, libraryRoot: null, allowRootFallback: false };
  for (let i=0;i<args.length;i++) {
    const a = args[i];
    if (a === '--port' && args[i+1]) opts.port = parseInt(args[++i],10);
    else if (a === '--libraryRoot' && args[i+1]) opts.libraryRoot = normalizePath(args[++i]);
    else if (a === '--allowRootFallback') opts.allowRootFallback = true;
  }
  return opts;
}

function normalizePath(p){ return path.resolve(p.replace(/^"|"$/g,'')); }

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.avif':'image/avif', '.gif':'image/gif', '.svg':'image/svg+xml'
};

function etag(buf){ return 'W/"'+crypto.createHash('sha1').update(buf).digest('hex')+'"'; }

async function serveFile(res, file) {
  try {
    const data = await fsp.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', ext.match(/\.(?:png|jpe?g|webp|avif|gif)$/) ? 'public, max-age=86400' : 'no-cache');
    res.setHeader('ETag', etag(data));
    res.writeHead(200);
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') { res.writeHead(404); res.end('404'); }
    else { res.writeHead(500); res.end('500'); }
  }
}

async function fileExists(p){ try { const st = await fsp.stat(p); return st.isFile(); } catch { return false; } }

function isSafe(subPath) { return !subPath.split('\\').some(s => s==='..') && !subPath.split('/').some(s => s==='..'); }

function shouldTryLibrary(urlPath) {
  // Accept common top-level library folders (case-insensitive)
  // Includes: assets, materials, mats
  return /^(\/)(assets?|materials?|mats)\//i.test(urlPath);
}

async function handler(req, res, opts) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  // API: open directory
  if (urlPath.startsWith('/api/openDir')) {
    if (!opts.libraryRoot) { res.writeHead(400); return res.end('No libraryRoot configured'); }
    try {
      const u = new URL(req.url, 'http://localhost');
      const rel = (u.searchParams.get('rel')||'').replace(/^\/+/, '');
      if (!rel || rel.includes('..')) { res.writeHead(400); return res.end('Bad rel'); }
      const abs = path.join(opts.libraryRoot, rel);
      // Ensure path is within root
      if (!abs.startsWith(path.normalize(opts.libraryRoot))) { res.writeHead(400); return res.end('Out of root'); }
      // Prefer Windows explorer, else platform alternatives
      let cmd, args;
      if (process.platform === 'win32') { cmd = 'explorer'; args = [abs]; }
      else if (process.platform === 'darwin') { cmd = 'open'; args = [abs]; }
      else { cmd = 'xdg-open'; args = [abs]; }
      spawn(cmd, args, { detached:true, stdio:'ignore' }).unref();
      res.writeHead(200, { 'Content-Type':'application/json'});
      res.end(JSON.stringify({ ok:true }));
    } catch (e) {
      res.writeHead(500); res.end('openDir error');
    }
    return;
  }
  // Default file mapping
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  if (!isSafe(rel)) { res.writeHead(400); return res.end('Bad path'); }
  const publicDir = path.join(__dirname, 'public');
  const publicFile = path.join(publicDir, rel);
  if (await fileExists(publicFile)) return serveFile(res, publicFile);

  // Try library root if configured
  if (opts.libraryRoot && (opts.allowRootFallback || shouldTryLibrary(urlPath))) {
    const candidate = path.join(opts.libraryRoot, rel.replace(/^\/+/, '')); // remove leading slash
    if (await fileExists(candidate)) return serveFile(res, candidate);
  }

  // SPA fallback for root route requests without extension
  if (!path.extname(rel)) {
    const idx = path.join(publicDir, 'index.html');
    if (await fileExists(idx)) return serveFile(res, idx);
  }

  res.writeHead(404); res.end('404');
}

async function main() {
  const opts = parseArgs();
  if (opts.libraryRoot) {
    try { const st = await fsp.stat(opts.libraryRoot); if (!st.isDirectory()) throw new Error('not a dir'); }
    catch { console.error('Library root invalid:', opts.libraryRoot); opts.libraryRoot = null; }
  }
  const server = createServer((req,res)=> handler(req,res,opts));
  server.listen(opts.port, () => {
    console.log(`Server listening on http://localhost:${opts.port}`);
    console.log('Public root:', path.join(__dirname,'public'));
    if (opts.libraryRoot) console.log('Library root mounted (proxy):', opts.libraryRoot);
  });
}

main();
