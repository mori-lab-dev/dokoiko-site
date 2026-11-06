// 旅先の description に書かれた宿の送迎の文を、公式で確認した内容に合わせる（2026-11-06）。
// featured_stay の送迎（applyStayShuttleCheck.mjs）と食い違う文・公式に無い語（無料・約N分・本数・予約の期限）だけを直す。新しい事実は足さない。
// 公式サイトで確認できなかった宿の文は触らない。自動で作ったメタ description（seo.auto）に同じ語があれば同じように直す。
// 使い方: node scripts/fixStayShuttleInDescriptions.mjs [--dry]   何度流しても同じ結果になる
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';
import { checkDesc } from './descStyleCheck.mjs';

const dry = process.argv.includes('--dry');
const E = (id, from, to, why) => ({ id, from, to, why });
const EDITS = [
  E('fujikawaguchiko', '河口湖駅からの無料送迎バスがある。', '河口湖駅からの送迎がある。', '公式に送迎の「無料」の記載なし'),
  E('kakunodate', '茅葺古民家を移築した施設で、角館駅から送迎あり（要予約）。', '茅葺古民家を移築した施設だ。', '公式に角館駅発の送迎の記載なし（あるのは秋田空港からの有料専用タクシー）'),
  E('oboke', 'JR大歩危駅から無料送迎あり（1日1便・前日までに要予約）。', 'JR大歩危駅から送迎あり（1日1便・前日までに要予約）。', '公式に送迎の「無料」の記載なし（無料は駐車場のみ）'),
  E('ureshino-onsen', '嬉野温泉駅と嬉野バスセンターから2名以上で送迎を利用可能。', '嬉野温泉駅から無料の送迎を利用できる（要事前予約）。', '公式は嬉野温泉駅発・無料・事前予約。バスセンター・2名以上は記載なし'),
  E('gero-onsen', '下呂駅から無料送迎がある。', '下呂駅からシャトルバスがある。', '通常のシャトルバスに「無料」の記載なし'),
  E('shikotsu', '支笏湖畔バスターミナルからは無料送迎バスも出ている。', '支笏湖バスターミナルからは宿泊者専用の送迎バスも出ている（予約制）。', '公式は宿泊者専用・予約制。「無料」の記載なし'),
  E('ako', '赤穂駅から無料送迎バスで約15分、', '赤穂駅から無料送迎バスが出ていて、', '公式に「約15分」の記載なし'),
  E('minami-sanriku', '仙台駅東口から宿泊者向けの無料送迎バスが出ている（前日15時までに要予約）。', '仙台駅から宿泊者向けの無料送迎バスが出ている。', '公式に「東口」「前日15時まで」の記載なし'),
  E('fukaura', 'ウェスパ椿山駅からの送迎バスを運行しており（要予約）、', 'ウェスパ椿山駅からの送迎バスを運行しており（普通列車は要予約）、', '公式はリゾートしらかみ号は予約不要・普通列車は要予約'),
  E('gen_青森_黄金崎不老不死温泉', 'ウェスパ椿山駅で、宿の送迎あり（要予約）。', 'ウェスパ椿山駅で、宿の送迎あり（普通列車は要予約）。', '公式はリゾートしらかみ号は予約不要・普通列車は要予約'),
  E('gen_栃木_中禅寺温泉', '東武日光駅から無料シャトルバスあり（要予約）。', '東武日光駅から無料シャトルバスあり（予約不要）。', '公式に「ご予約は不要」'),
  E('gen_栃木_那須温泉郷', '那須塩原駅から無料送迎を利用すると便利で、', '那須塩原駅から送迎バスを利用すると便利で、', '公式に送迎の「無料」の記載なし'),
  E('gen_栃木_那須温泉郷', '那須塩原駅西口から無料送迎が出ている。', '那須塩原駅西口から送迎が出ている（完全予約制）。', '公式に送迎の「無料」の記載なし。完全予約制'),
  E('gen_群馬_万座温泉', 'バスターミナルからの送迎も約5分で運行している。', 'バスターミナルからの送迎も運行している。', '公式に「約5分」の記載なし'),
  E('matsunoyama-onsen', 'まつだい駅からの送迎は要予約で15:21発の1便がある。', 'まつだい駅からの送迎は、15:21着の電車に合わせた1便がある（要事前相談）。', '公式は「15:21着の電車に合わせた1便」「事前にご相談ください」'),
  E('oyu-onsen-akita', '鹿角花輪駅からの無料送迎もある（2名以上）。', '十和田南駅と高速けまないバス停からの無料送迎もある（予約制・原則2名以上）。', '公式の発着地は十和田南駅・高速けまないバス停。予約制'),
  E('takarakawa-onsen', '水上駅からは送迎バスで約35分。', '上毛高原駅と水上駅から無料送迎がある（要予約）。', '公式に「約35分」の記載なし。無料・要予約・上毛高原駅発着が公式にある'),
  E('yunokami-onsen', '新白河駅から無料の送迎バスが1日1本出る。', '新白河駅から無料の送迎バスが出る（前日までに要予約）。', '公式に「1日1本」の記載なし。前日までに予約'),
  E('fukue-island', '福江港と五島つばき空港から無料の送迎がある。', '福江港や五島つばき空港からはタクシーを手配できる。', '公式FAQは「送迎サービスは行っておりません」'),
  E('hayakawa', '送迎バスが1日1便出ており、', '送迎バスが出ており、', '公式に「1日1便」の記載なし'),
  E('ibusuki-onsen', '指宿駅から無料送迎（定時運行・予約不要）が出ている。', '指宿駅から無料送迎（1日3便）が出ている。', '公式は1日3便。「予約不要」の明記なし（状況により予約制）'),
  E('itsukushima', '宮島桟橋からの送迎バスもある。', '宮島桟橋からの送迎もある。', '公式に「送迎バス」の語なし'),
];

const FILE = path.join(root, 'src/data/destinations.json');
const dests = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
let applied = 0, already = 0, metaFixed = 0; const stop = [], broke = [];
for (const e of EDITS) {
  const d = byId.get(e.id); if (!d) { stop.push(`${e.id}: 旅先なし`); continue; }
  const n = d.description.split(e.from).length - 1;
  if (n === 1) {
    const next = d.description.replace(e.from, () => e.to);
    const r = checkDesc(next, e.id); const r0 = checkDesc(d.description, e.id);
    if (r0.ok && !r.ok) { broke.push(`${e.id}: ${r.issues.join(' / ')}`); continue; }
    d.description = next; applied++;
    if (d.seo?.auto && d.seo.description?.includes(e.from)) { d.seo.description = d.seo.description.replace(e.from, () => e.to); metaFixed++; }
  } else if (n === 0 && d.description.includes(e.to)) already++;
  else stop.push(`${e.id}: from が ${n} か所`);
}
console.log(`編集 ${EDITS.length}件: 適用 ${applied} / 適用済み ${already} / メタも直した ${metaFixed} / 止まった ${stop.length} / 基準に落ちる ${broke.length}`);
for (const s of [...stop, ...broke]) console.log('  ' + s);
if (stop.length || broke.length) process.exit(1);
if (dry) process.exit(0);
fs.writeFileSync(FILE, JSON.stringify(dests, null, 2) + '\n');
fs.mkdirSync(path.join(root, 'backup/stay_shuttle_20261106'), { recursive: true });
fs.writeFileSync(path.join(root, 'backup/stay_shuttle_20261106/description_edits.json'), JSON.stringify(EDITS, null, 2) + '\n');
console.log('書き込み完了');
