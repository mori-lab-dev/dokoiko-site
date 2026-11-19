// 公開前の確認（2026-11-19）: 配信リポの作業ツリー（これから公開するもの）と直前の公開（HEAD）の差が、想定した変更だけかを調べる。読み取りのみ。
//   想定: 段階2（応援割・車なし旅の確認日と4項目）・段階3（6ページが転送ページ・消えたページへのリンクが載るページ・診断・sitemap・一覧）・段階4（画像を外した旅先）
//   旅先ページは、想定した理由のあるものだけが変わっていること。変えてはいけない部分（canonical・PR表記・お問い合わせの導線・注意書き）は、編集したページで HEAD と同じであること。
import fs from 'fs'; import { execFileSync } from 'child_process';
const R = '../dokoiko'; const g = (...a) => execFileSync('git', ['-C', R, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const removed = J('backup/images_20261121/removed.json'); const retire = [];
const imgIds = new Set([...removed.外した.map((r) => r.key.split('|')[0]), ...removed.戻した.map((r) => r.id), 'chichijima', 'shiraishijima']); const retired = new Set(retire.map((r) => r.from)); const targets = new Set(retire.map((r) => r.to));
const carFree = new Set(['chikugogawa', 'kurokawa-k', 'niche_大分_3']);
const changed = g('-c', 'core.quotepath=off', 'status', '--porcelain').split('\n').filter(Boolean).map((l) => ({ st: l.slice(0, 2).trim(), f: l.slice(3).replace(/^"|"$/g, '') }));
const strip = (h) => h.replace(/astro-[a-z0-9]{8}/g, 'astro-X').replace(/_astro\/[^"' )]+/g, '_astro/X').replace(/<style[\s\S]*?<\/style>/g, '<style/>');
const ex = (h) => ({ canonical: (h.match(/<link[^>]+rel="canonical"[^>]*>/g) || []).join('|'), pr: (h.match(/PR/g) || []).length, contact: (h.match(/href="\/contact\/?"/g) || []).length, notice: (h.match(/data-fact-notice/g) || []).length });
const heroHref = [].filter((r) => r.種類 === 'ヒーロー').flatMap((r) => { const id = r.key.split('|')[0]; return [`href="/destinations/${id}/`, `href="/destinations/${encodeURIComponent(id)}/`]; });
const retiredHref = [...retired].flatMap((id) => [`href="/destinations/${id}/`, `href="/destinations/${encodeURIComponent(id)}/`]);
const cat = {}; const unexpected = []; const guard = [];
const add = (k, id) => (cat[k] ||= []).push(id);
for (const { st, f } of changed) {
  const m = f.match(/^destinations\/([^/]+)\/index\.html$/);
  if (!m) continue; const id = decodeURIComponent(m[1]);
  if (st === 'M' || st === 'A') { /* 下で判定 */ } else continue;
  let old = ''; try { old = g('show', `HEAD:${f}`); } catch { old = ''; } const now = fs.readFileSync(`${R}/${f}`, 'utf8');
  if (retired.has(id)) { add('段階3: 転送ページになった6ページ', id); continue; }
  if (imgIds.has(id)) { add('段階4: 画像を外した旅先', id); const a = ex(old), b = ex(now); for (const k of Object.keys(a)) if (a[k] !== b[k]) guard.push(`${id}: ${k}`); continue; }
  if (carFree.has(id)) { add('段階2: 車なし旅の確認日・4項目', id); const a = ex(old), b = ex(now); for (const k of Object.keys(a)) if (a[k] !== b[k]) guard.push(`${id}: ${k}`); continue; }
  if (retiredHref.some((h) => old.includes(h))) { add('段階3: 消えたページへのリンクが載っていたページ（リンクが外れた）', id); const a = ex(old), b = ex(now); for (const k of Object.keys(a)) if (a[k] !== b[k]) guard.push(`${id}: ${k}`); continue; }
  if (heroHref.some((h) => old.includes(h))) { add('段階4: ヒーロー画像を外した旅先（関）の近隣カードが載るページ（カードの画像が外れた）', id); const a = ex(old), b = ex(now); for (const k of Object.keys(a)) if (a[k] !== b[k]) guard.push(`${id}: ${k}`); continue; }
  if (strip(old) === strip(now)) { add('ビルドの識別子（CSS名）だけの変更', id); continue; }
  unexpected.push(id);
}
const others = changed.filter((c) => !c.f.startsWith('destinations/') && !c.f.startsWith('images/') && !c.f.startsWith('_astro')).map((c) => `${c.st} ${c.f}`);
const out = { 変わったファイル数: changed.length, 旅先ページの分類: Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, v.length])), 想定外の変更のある旅先ページ: unexpected, 変えてはいけない部分が変わったページ: guard, 旅先以外で変わったもの: others, 転送先のページ: [...targets] };
fs.writeFileSync('logs/identity_20261120/deploy_diff_20261121.json', JSON.stringify({ ...out, 分類の中身: cat }, null, 1)); console.log(JSON.stringify(out, null, 1));
