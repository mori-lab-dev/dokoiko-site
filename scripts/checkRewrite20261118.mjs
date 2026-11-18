#!/usr/bin/env node
/**
 * checkRewrite20261118.mjs — 文体の書き直しの試作（logs/style_trial_20261118/rewrites/<id>.<A|B>.json）の機械検査（2026-11-18）。サイトのファイルは読むだけ。
 *   ① 数字（全角を含む。NFKC・桁区切りの「,」を除く）の集合が、単位ごと（lead・各節の body・tips・各 spot の説明）に元と変わらない。増えた数字は不合格。消えた数字は、removed[].numbers に理由つきで記録があるものだけ
 *   ② 固有名詞（カタカナ・漢字2字以上・英字2字以上のまとまり）が増えない（新しい語が、元のページ全体の文字列の一部であること）。消えた語は一覧にする（不合格にはしない）
 *   ③ 禁止語: 既存の定型句（NG_PHRASES）・推測語（NG_HEDGE＋でしょう）・体験談の語・二人称・結論語（行きたい・おすすめ 等）・断定（必ず・絶対）・誇張（元より増えた最上級・評価語）が0件
 *   ④ 文字数が元の±20%以内（ページの書き直した部分の合計）。単位ごとの増減も出す
 *   ⑤ 見出し・リンク・画像・宿のカード・注意書きの構造が変わらない（節の数・見出し・info・imageAlt/画像の欄・spot の名前や画像の欄・modelCourse・bestSeason が元と同一。書き直す欄以外の差が0）
 *   ⑥ 同じ文末（最後の2文字）が3文以上続かない（単位ごと）
 *   参考（不合格にしない）: 平均の文の長さ・40〜60字の割合・過去形の文末（〜た。）の数
 * usage: node scripts/checkRewrite20261118.mjs [rewrites のフォルダ]   終了コード: 1つでも落ちれば 1
 */
import fs from 'fs'; import path from 'path';
import { NG_PHRASES, NG_HEDGE } from './descStyleCheck.mjs';
const DIR = process.argv[2] || 'logs/style_trial_20261118/rewrites';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dests = J('src/data/destinations.json');
const nfkc = (s) => String(s ?? '').normalize('NFKC');
const NUM = (s) => new Set((nfkc(s).replace(/(\d),(\d)/g, '$1$2').match(/\d+(?:\.\d+)?/g) || []));
const NOUN = /[゠-ヿ]{2,}|[一-鿿々]{2,}|[A-Za-z]{2,}/g;
const nouns = (s) => new Set(nfkc(s).replace(/\d+(?:\.\d+)?/g, ' ').match(NOUN) || []);
const HEDGE = [...NG_HEDGE, 'でしょう', 'だろう'];
const EXP = /私|僕|行ってみ|実際に|来てよかった|思った。|感じた|気づいた|実感した|知った。|聞いた|買った|泊まった/;   // 体験談の語。文末の過去形の体験（歩いた。見た。など）は EXP_END で見る
const EXP_END = /(歩い|見|登っ|入っ|食べ|飲ん|乗っ|座っ|着い|訪れ|行っ|立っ)た。?$/;
const SECOND = /あなた|みてください|てください|してみて/;
const CONCL = /行きたい|おすすめ|オススメ|お勧め|行くべき|行こう|訪れたい/;
const ASSERT = /必ず|絶対/;
const SUPER = ['日本一', '世界一', '最大', '最高', '唯一', '一番', '最も', '絶景', '必見', '魅力', '癒', '思わず', '素晴らしい', '感動', '圧巻', '贅沢', '絶品', 'たまらない'];
const sig = (s) => { const t = s.replace(/[。」）)\s]+$/g, ''); return t.slice(-2); };
const sentencesOf = (t) => String(t).split(/[\n]+/).flatMap((l) => l.split(/(?<=。)/)).map((x) => x.trim()).filter(Boolean);
const res = []; let anyFail = false;
for (const f of fs.readdirSync(DIR).filter((x) => /\.[AB]\.json$/.test(x)).sort()) {
  const rw = J(path.join(DIR, f)); const id = rw.id; const art = J(`src/data/articles/${id}.json`); const d = dests.find((x) => x.id === id);
  const fails = { '①数字': [], '②固有名詞': [], '③禁止語': [], '④文字数': [], '⑤構造': [], '⑥文末': [] }; const info = { 消えた固有名詞: [], 消えた数字_記録あり: [], 単位ごとの文字数: [], 過去形の文末: 0, 平均の文の長さ: 0, '40〜60字の割合': 0 };
  // 単位
  const units = [{ k: 'lead', o: art.lead, n: rw.lead }]; art.sections.forEach((s, i) => units.push({ k: `節${i + 1} body`, o: s.body, n: rw.sections?.[i]?.body })); units.push({ k: 'tips', o: art.tips, n: rw.tips });
  for (const sp of d.spots || []) units.push({ k: `spot「${sp.name}」`, o: sp.description, n: rw.spots?.[sp.name] });
  const allowed = new Set((rw.removed || []).flatMap((r) => r.numbers || []).map(String));
  const pageText = nfkc([art.lead, ...art.sections.flatMap((s) => [s.title, s.body, s.info]), art.tips, art.bestSeason, ...Object.values(art.modelCourse || {}), d.description, ...(d.spots || []).flatMap((s) => [s.name, s.description]), d.name].join('\n'));
  let oLen = 0, nLen = 0; const allS = [];
  for (const u of units) {
    if (typeof u.n !== 'string') { fails['⑤構造'].push(`${u.k}: 書き直しの欄がない`); continue; }
    // ①
    const on = NUM(u.o), nn = NUM(u.n); for (const x of nn) if (!on.has(x)) fails['①数字'].push(`${u.k}: 数字が増えた ${x}`);
    for (const x of on) if (!nn.has(x)) { if (allowed.has(x)) info.消えた数字_記録あり.push(`${u.k}: ${x}`); else fails['①数字'].push(`${u.k}: 数字が消えた ${x}（記録なし）`); }
    // ②
    for (const w of nouns(u.n)) if (!pageText.includes(w)) fails['②固有名詞'].push(`${u.k}: 新しい語 ${w}`);
    const nsN = nouns(u.n); for (const w of nouns(u.o)) if (!nfkc(u.n).includes(w)) info.消えた固有名詞.push(`${u.k}: ${w}`);
    // ③
    const t = nfkc(u.n), to = nfkc(u.o);
    for (const p of NG_PHRASES) if (t.includes(p)) fails['③禁止語'].push(`${u.k}: 定型句 ${p}`);
    for (const p of HEDGE) if (t.includes(p)) fails['③禁止語'].push(`${u.k}: 推測語 ${p}`);
    for (const x of sentencesOf(u.n)) if (EXP_END.test(x)) fails['③禁止語'].push(`${u.k}: 体験談の文末 「${x.slice(-14)}」`);
    for (const [re, lab] of [[EXP, '体験談'], [SECOND, '二人称'], [CONCL, '結論語'], [ASSERT, '断定']]) { const m = t.match(re); if (m) fails['③禁止語'].push(`${u.k}: ${lab} 「${m[0]}」`); }
    for (const w of SUPER) if (t.split(w).length - 1 > to.split(w).length - 1) fails['③禁止語'].push(`${u.k}: 誇張・評価語が増えた 「${w}」`);
    // ④
    oLen += nfkc(u.o).replace(/\s/g, '').length; nLen += t.replace(/\s/g, '').length; info.単位ごとの文字数.push(`${u.k}: ${nfkc(u.o).replace(/\s/g, '').length}→${t.replace(/\s/g, '').length}`);
    // ⑥
    const ss = sentencesOf(u.n); allS.push(...ss); let run = 1; for (let i = 1; i < ss.length; i++) { run = sig(ss[i]) === sig(ss[i - 1]) ? run + 1 : 1; if (run >= 3) { fails['⑥文末'].push(`${u.k}: 「${sig(ss[i])}」で3文以上続く（…${ss[i].slice(-12)}）`); break; } }
  }
  const ratio = (nLen - oLen) / oLen; if (Math.abs(ratio) > 0.2) fails['④文字数'].push(`ページ合計 ${oLen}→${nLen}（${(ratio * 100).toFixed(1)}%）`);
  // ⑤ 構造: 書き直す欄を空にして、元と同一か
  const blank = (a) => { const x = JSON.parse(JSON.stringify(a)); x.lead = ''; x.tips = ''; x.sections.forEach((s) => { s.body = ''; }); return JSON.stringify(x); };
  const rebuilt = JSON.parse(JSON.stringify(art)); rebuilt.lead = rw.lead; rebuilt.tips = rw.tips; (rw.sections || []).forEach((s, i) => { if (rebuilt.sections[i]) rebuilt.sections[i].body = s.body; });
  if ((rw.sections || []).length !== art.sections.length) fails['⑤構造'].push(`節の数 ${art.sections.length}→${(rw.sections || []).length}`);
  if (blank(rebuilt) !== blank(art)) fails['⑤構造'].push('見出し・info・画像・modelCourse などに差');
  const spotNames = Object.keys(rw.spots || {}); if (JSON.stringify(spotNames.sort()) !== JSON.stringify((d.spots || []).map((s) => s.name).sort())) fails['⑤構造'].push('spot の名前が違う');
  for (const k of Object.keys(rw)) if (!['id', 'variant', 'lead', 'sections', 'tips', 'spots', 'removed'].includes(k)) fails['⑤構造'].push(`余計な欄 ${k}`);
  for (const s of rw.sections || []) for (const k of Object.keys(s)) if (k !== 'body') fails['⑤構造'].push(`節の余計な欄 ${k}`);
  info.平均の文の長さ = +(allS.reduce((t, s) => t + s.length, 0) / allS.length).toFixed(1); info['40〜60字の割合'] = +(allS.filter((s) => s.length >= 40 && s.length <= 60).length / allS.length * 100).toFixed(0); info.過去形の文末 = allS.filter((s) => /[たっ]た?。$|した。$|った。$|いた。$|れた。$|んだ。$/.test(s) && /た。$/.test(s)).length; info.文の数 = allS.length; info.文字数の増減_パーセント = +(ratio * 100).toFixed(1);
  const ng = Object.values(fails).some((v) => v.length); if (ng) anyFail = true;
  res.push({ ファイル: f, ページ: id, 合否: ng ? '不合格' : '合格', 落ちた件数: Object.fromEntries(Object.entries(fails).map(([k, v]) => [k, v.length])), 落ちた内容: Object.fromEntries(Object.entries(fails).filter(([, v]) => v.length)), 参考: info });
}
fs.writeFileSync(path.join(DIR, '..', 'check_result.json'), JSON.stringify(res, null, 1));
for (const r of res) console.log(r.合否, r.ファイル, JSON.stringify(r.落ちた件数), `増減${r.参考.文字数の増減_パーセント}% 文${r.参考.文の数} 平均${r.参考.平均の文の長さ}字 40-60字${r.参考['40〜60字の割合']}% 過去形${r.参考.過去形の文末}`);
for (const r of res) for (const [k, v] of Object.entries(r.落ちた内容)) for (const x of v.slice(0, 8)) console.log('  ', r.ファイル, k, x);
process.exit(anyFail ? 1 : 0);
