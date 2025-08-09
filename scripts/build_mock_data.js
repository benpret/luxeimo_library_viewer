#!/usr/bin/env node
// Build mock large dataset for performance testing
// Usage: node scripts/build_mock_data.js > public/data/index_root.json

const categories = ['furniture','metal','nature','fabric','plastic','stone','wood'];
const types = ['asset','material','texture'];
const base = [];
let idCounter = 0;

function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function pad(num,len=8){ return num.toString(16).padStart(len,'0'); }
function makeName(cat){
  const nouns = ['Chair','Table','Rock','Panel','Lamp','Surface','Set','Shelf','Door','Plant','Cushion'];
  const adj = ['Modern','Classic','Large','Small','Polished','Raw','Rough','Soft','Hard','Stylized'];
  return `${rand(adj)} ${rand(nouns)}`;
}
for (let i=0;i<5000;i++) {
  const category = rand(categories);
  const type = rand(types);
  const hex = pad(++idCounter) + pad(Math.random()*0xffffffff>>>0);
  const displayName = makeName(category);
  base.push({
    id: hex,
    displayName,
    slug: displayName.toLowerCase().replace(/[^a-z0-9]+/g,'_'),
    type,
    category,
    tags: [category, type],
    autoTags: ['auto','tag'],
    thumb: `https://via.placeholder.com/512x384.png?text=${encodeURIComponent(displayName)}`,
    latestVersion: '001',
    updated: `2025-08-${String((i%28)+1).padStart(2,'0')}`
  });
}

const out = { schemaVersion:1, generated: new Date().toISOString(), items: base };
process.stdout.write(JSON.stringify(out,null,2));
