// 診断「あなたに似合う旅先は？」の計算（2026-11-17）。ブラウザ（/quiz/）と、分布検査（scripts/quizDistribution.mjs）・audit が同じこの関数を使う。
// 入力は src/data/quizDestinations.json の項目（id・name・prefecture・tags・weight・stayAllowed・url）だけ。そこから先は、この中で tags などから導く。
// 回答はこの中だけで計算する。送信も保存もしない。同じ回答なら必ず同じ結果（点 → 主テーマの一致 → weight → id の順で決める）。

export const STAYS = ['日帰りで', '1泊で', '2泊以上で'];
const STAY_KEYS = { '日帰りで': ['daytrip'], '1泊で': ['1night'], '2泊以上で': ['2night', '3night+'] };
export const AREAS = ['北海道・東北', '関東', '中部', '関西', '中国・四国', '九州・沖縄', 'どこでもよい'];
const AREA_OF_PREF = {};
const put = (area, list) => list.forEach((p) => { AREA_OF_PREF[p] = area; });
put('北海道・東北', ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県']);
put('関東', ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県']);
put('中部', ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県']);
put('関西', ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県']);
put('中国・四国', ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県']);
put('九州・沖縄', ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']);
export const areaOf = (pref) => AREA_OF_PREF[pref] || null;

export const THEMES = ['温泉', '街並み', '絶景', '島や海', '食べもの', '歴史や寺社'];
const THEME_TAGS = {
  '温泉': ['温泉', '秘湯', '湯治', '一軒宿'],
  '街並み': ['街歩き', '古い町並み', '城下町', '港町', '昭和レトロ', '古民家', '街'],
  '絶景': ['絶景', '渓谷', '滝', '山', '高原', '湖', '夕日', '夜景', '紅葉', '棚田'],
  '島や海': ['海', '離島', '島', '漁村', '灯台'],
  '食べもの': ['グルメ', '海鮮', '蕎麦'],
  '歴史や寺社': ['歴史', '寺社', '城', '世界遺産', '歴史建築', '伝統'],
};
const QUIET = ['秘境', '秘湯', '一軒宿', '湯治', '山村', '漁村'], LIVE = ['グルメ', '街歩き', '夜景'];
const WALK = ['登山', '山', '渓谷', '滝', '街歩き', '高原'], REST = ['温泉', '湯治', 'リゾート', '一軒宿', '秘湯'];
const MOUNT = ['山', '渓谷', '滝', '高原', '清流', '川'], SEA = ['海', '離島', '島', '湖', '灯台', '漁村'];
const STAYY = ['一軒宿', '湯治', '温泉', '秘湯'], OUTING = ['街歩き', 'グルメ'];

const cnt = (tags, list) => list.reduce((n, t) => n + (tags.includes(t) ? 1 : 0), 0);
const sign = (a, b) => (a > b ? 1 : a < b ? -1 : 0);

/** 質問（上から順に出す）。kind: stay・area は絞り込み、ほかは重みづけ。 */
export const QUESTIONS = [
  { key: 'stay', kind: 'filter', text: '今回の旅の長さは？', options: STAYS },
  { key: 'area', kind: 'filter', text: '行ってみたい方面は？', options: AREAS },
  { key: 'theme1', kind: 'score', text: '旅でいちばん楽しみにしたいのは？', options: THEMES },
  { key: 'theme2', kind: 'score', text: 'もうひとつ足すなら？', options: THEMES },
  { key: 'quiet1', kind: 'score', text: '過ごしたい空気は？', options: ['静かなところ', 'にぎやかなところ', 'どちらでも'] },
  { key: 'walk1', kind: 'score', text: '旅先ではどれくらい歩きたい？', options: ['たくさん歩きたい', '少しでいい', 'どちらでも'] },
  { key: 'pop1', kind: 'score', text: '行き先の選び方は？', options: ['名の知れたところ', '人の少ないところ', 'どちらでも'] },
  { key: 'view', kind: 'score', text: '窓の外に見えてほしいのは？', options: ['山や川', '海や湖', '街の灯り', 'こだわらない'] },
  { key: 'quiet2', kind: 'score', text: '夜の過ごし方は？', options: ['しんとした夜', '街に出る夜', 'どちらでも'] },
  { key: 'walk2', kind: 'score', text: '坂道や山道は？', options: ['平気', '平らな道がいい', 'どちらでも'] },
  { key: 'inn', kind: 'score', text: '宿での時間は？', options: ['宿でゆっくり', '外を歩き回る', 'どちらでも'] },
  { key: 'pop2', kind: 'score', text: '写真で見たことのある景色と、まだ知らない景色なら？', options: ['見たことのある景色', 'まだ知らない景色', 'どちらでも'] },
];
export const SCORE_QUESTIONS = QUESTIONS.filter((q) => q.kind === 'score');

/** 旅先ごとの導出値（tags・weight・県から）。list は src/data/quizDestinations.json の配列 */
export function prepare(list) {
  const ws = list.map((d) => d.weight);
  const wmin = Math.min(...ws), wmax = Math.max(...ws);
  return list.map((d) => {
    const t = d.tags || [];
    const tm = {}; let primary = null, best = 0;
    for (const th of THEMES) { tm[th] = Math.min(cnt(t, THEME_TAGS[th]), 2); if (tm[th] > best) { best = tm[th]; primary = th; } }
    const m = cnt(t, MOUNT), s = cnt(t, SEA);
    const view = m > s ? '山や川' : s > m ? '海や湖' : (t.includes('夜景') || t.includes('街歩き') ? '街の灯り' : null);
    return {
      ...d, _area: areaOf(d.prefecture), _tm: tm, _primary: primary,
      _quiet: sign(cnt(t, QUIET), cnt(t, LIVE)), _walk: sign(cnt(t, WALK), cnt(t, REST)), _view: view,
      _inn: sign(cnt(t, STAYY), cnt(t, OUTING)),
      _pop: wmax > wmin ? Math.round(((d.weight - wmin) / (wmax - wmin)) * 2) : 1,   // 0（穴場）〜2（定番）
    };
  });
}

/** 絞り込み（泊・方面）。stay・area は選択肢の文言 */
export function filterPool(prepped, stay, area) {
  const keys = STAY_KEYS[stay] || [];
  return prepped.filter((d) => d.stayAllowed.some((k) => keys.includes(k)) && (area === 'どこでもよい' || d._area === area));
}

const themePts = (d, theme, w) => w * (3 * (d._primary === theme ? 1 : 0) + (d._tm[theme] > 0 ? 1 : 0));
/** 質問 key ごとの、その旅先の点（選択肢の文言 opt に対して） */
export function pointsFor(d, key, opt) {
  switch (key) {
    case 'theme1': return themePts(d, opt, 2);
    case 'theme2': return themePts(d, opt, 1);
    case 'quiet1': case 'quiet2': return (opt === '静かなところ' || opt === 'しんとした夜' ? 2 : opt === 'にぎやかなところ' || opt === '街に出る夜' ? -2 : 0) * d._quiet;
    case 'walk1': case 'walk2': return (opt === 'たくさん歩きたい' || opt === '平気' ? 2 : opt === '少しでいい' || opt === '平らな道がいい' ? -2 : 0) * d._walk;
    case 'pop1': case 'pop2': return opt === '名の知れたところ' || opt === '見たことのある景色' ? 2 * (d._pop - 1) : opt === '人の少ないところ' || opt === 'まだ知らない景色' ? 2 * (1 - d._pop) : 0;
    case 'view': return opt === d._view ? 2 : 0;
    case 'inn': return (opt === '宿でゆっくり' ? 2 : opt === '外を歩き回る' ? -2 : 0) * d._inn;
    default: return 0;
  }
}
const maxPts = (d, q) => Math.max(...q.options.map((o) => pointsFor(d, q.key, o)));

/** 同点のときの並び: 主テーマの一致（テーマ1が2・テーマ2が1）→ weight → id。tie='weight' は段階1の決め方（比較用） */
function tieKey(d, ans, tie) {
  const th = tie === 'weight' ? 0 : (d._primary === ans.theme1 ? 2 : 0) + (d._primary === ans.theme2 ? 1 : 0);
  return th;
}
export function rank(cands, answers, tie = 'theme') {
  const scored = cands.map((d) => {
    let sc = 0;
    for (const q of SCORE_QUESTIONS) if (answers[q.key] != null) sc += pointsFor(d, q.key, answers[q.key]);
    return { d, sc, th: tieKey(d, answers, tie) };
  });
  scored.sort((a, b) => b.sc - a.sc || b.th - a.th || b.d.weight - a.d.weight || (a.d.id < b.d.id ? -1 : a.d.id > b.d.id ? 1 : 0));
  return scored;
}

/** 「のこり◯か所」: 残りの質問でどう答えても1位に届かない旅先を除いた数。answers は答えた重みづけ質問だけ入っている */
export function remainingCount(cands, answers) {
  const open = SCORE_QUESTIONS.filter((q) => answers[q.key] == null);
  let best = -Infinity; const cur = [];
  for (const d of cands) { let sc = 0; for (const q of SCORE_QUESTIONS) if (answers[q.key] != null) sc += pointsFor(d, q.key, answers[q.key]); cur.push(sc); if (sc > best) best = sc; }
  let n = 0;
  cands.forEach((d, i) => { let up = cur[i]; for (const q of open) up += maxPts(d, q); if (up >= best) n++; });
  return n;
}

/** 結果: 1位1つ＋次点3つ。answers は全部の質問の答え（stay・area を含む）。絞り込みで空なら null */
export function result(prepped, answers, tie = 'theme') {
  const cands = filterPool(prepped, answers.stay, answers.area);
  if (!cands.length) return null;
  const r = rank(cands, answers, tie);
  return { top: r[0].d, next: r.slice(1, 4).map((x) => x.d), poolSize: cands.length, tiedAtTop: r.length > 1 && r[1].sc === r[0].sc };
}
