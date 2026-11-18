// 適用確認の例外（allowlist）を作る（2026-11-18）。洗い出しの候補を人が1件ずつ読み、問題でないと判断した理由を付けたものだけ。再生成する場合は、候補が全部ここに理由つきで載ることを確かめる。
import fs from 'fs';
import { findB } from './lib/priorityGap20261118.mjs';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dl = J('src/data/destinations.json'); const dests = new Map(dl.map((d) => [d.id, d])); const arts = new Map(); for (const d of dl) { const f = `src/data/articles/${d.id}.json`; if (fs.existsSync(f)) arts.set(d.id, J(f)); }
const edits = ['d', 'e', 'g', 'h'].flatMap((x) => J(`scripts/data/mergeFactFixes20261118${x}.json`).fixes.flatMap((f) => f.edits));
const REASON = {
  'gen_群馬_万座温泉': '別の施設・別の項目（日帰り入浴の料金の目安）で、置換した営業時間とは別の事実',
  'gen_茨城_常磐神社': '義烈館の入館料（公式も大人300円で一致）。置換したのは偕楽園の入園料で、別の施設',
  'ginzan-onsen': 'モデルコースの「15:00 チェックイン」は、公式のチェックイン開始 14:00 より後で矛盾しない／本文の「14:00から」は置換後の値',
  'makurazaki': 'モデルコースの「17:00 帰路」は、薩摩酒造（9:00〜16:00）の見学（15:00）より後の行程で、営業時間と矛盾しない',
  'minamiosumi': '別の項目（園地の営業時間 7:00〜22:00）で、置換した駐車場の閉門時間とは別の事実',
  'mishima-yamaguchi': 'モデルコースの「萩港7時台発」は、公式に7時台の便が無い（既知）。時刻を外すと「発」だけが残るため、規則（P3）で時刻を残している。行程案として据え置き',
  'niyodogawa': 'モデルコースの「10:00 にこ淵」は行程案。置換したのは説明の見頃の時間帯で、行程の時刻とは別',
  'shirahone-onsen': '置換後の値そのもの（新しい値に旧い値の数字が含まれる）／別の施設の営業時間',
  'tarama-island': '置換後の値そのもの（新しい文に同じ語・数字が含まれる）',
};
const b = findB({ dests, arts, edits }); const out = { a: [{ page: 'gen_栃木_川俣温泉', n: 20, 理由: '判定は「確認できず（記載なし）」だが、文に数字が無い（「周囲」を距離の語として誤検出）。数字を含む句・文だけを削除する方針なので、触らない' }], b: [] };
for (const g of b) { const r = REASON[g.page]; if (!r) { console.error('理由なし（人が読んで判断する）:', g.page, g.置換, g.残っている文); process.exitCode = 1; continue; } out.b.push({ page: g.page, 置換: g.置換, 残っている文: g.残っている文, 理由: r }); }
fs.writeFileSync('logs/priority_gap_20261118/allowlist.json', JSON.stringify(out, null, 1)); console.log('allowlist a', out.a.length, 'b', out.b.length);
