// 優先ページ129のうち未検証126ページの入力（文の一覧）を作り、文数で均等に18組へ分ける（2026-11-18）
import fs from 'fs';
const D='logs/priority_fix_20261118';
const pages=JSON.parse(fs.readFileSync('logs/merge_20261118/pages.json','utf8')).filter(p=>p.表示_累計>=3);
const units=JSON.parse(fs.readFileSync('logs/audit_sample_20261118/units.json','utf8'));
const dests=new Map(JSON.parse(fs.readFileSync('src/data/destinations.json','utf8')).map(d=>[d.id,d]));
const done=new Set(['suo-oshima','isawa-onsen','ikoma-kogen']);
const list=[];
for(const p of pages){ if(done.has(p.id)) continue; const us=units.filter(u=>u.page===p.id); const d=dests.get(p.id);
 const obj={id:p.id,旅先ページ:d?.name,県:d?.prefecture||d?.pref,表示累計:p.表示_累計,文の数:us.length,文:us.map((u,i)=>({番号:i+1,種類:u.種類,場所:u.where,文:u.文}))};
 fs.writeFileSync(`${D}/inputs/page_${p.id}.json`,JSON.stringify(obj,null,1)); list.push(obj);}
const zero=list.filter(o=>!o.文の数).map(o=>o.id);fs.writeFileSync(`${D}/zero_pages.json`,JSON.stringify(zero));list.splice(0,list.length,...list.filter(o=>o.文の数));
list.sort((a,b)=>b.文の数-a.文の数);
const N=18, bins=Array.from({length:N},()=>({ids:[],n:0}));
for(const o of list){const b=bins.reduce((m,x)=>x.n<m.n?x:m);b.ids.push(o.id);b.n+=o.文の数;}
bins.forEach((b,i)=>fs.writeFileSync(`${D}/batches/batch_${i+1}.json`,JSON.stringify(b)));
console.log('pages',list.length,'sentences',list.reduce((s,o)=>s+o.文の数,0),'per batch',bins.map(b=>b.n+'/'+b.ids.length).join(' '));
console.log('0文のページ',list.filter(o=>!o.文の数).map(o=>o.id));
