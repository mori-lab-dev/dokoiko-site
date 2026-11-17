// 診断の選択肢の線画アイコン（2026-11-18）。すべて自作のインラインSVG（24×24・線だけ）。外部の画像・フォント・ライブラリは使わない。
// 実在の鉄道会社・車両・駅名標などは描かない。キーは選択肢の文言（quizEngine.js の QUESTIONS の options）。
const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>';
const moon = '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>';
const moons = '<path d="M16 15.5A6 6 0 0 1 8.5 8a6 6 0 1 0 7.5 7.5z"/><path d="M18 4v4M16 6h4"/>';
const pin = '<path d="M12 21s6-5.600 6-10.500a6 6 0 0 0-12 0C6 15.400 12 21 12 21z"/><circle cx="12" cy="10.500" r="2"/>';
const globe = '<circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c2.500 2.500 2.500 14.500 0 17M12 3.500c-2.500 2.500-2.500 14.500 0 17"/>';
const hotspring = '<path d="M4 13h16a8 6 0 0 1-16 0z"/><path d="M8.500 4c-1.500 1.500 1.500 2.500 0 4M12.500 4c-1.500 1.500 1.500 2.500 0 4M16.500 4c-1.500 1.500 1.500 2.500 0 4"/>';
const town = '<path d="M3 20V11l4-3 4 3v9M11 20v-7l5-4 5 4v7M2 20h20"/><path d="M6 14h2M15 15h2"/>';
const view = '<path d="M2 19l6.500-10 4 6 2.500-3.500L22 19z"/><circle cx="17.500" cy="6" r="1.800"/>';
const island = '<path d="M3 17c2 1.500 4 1.500 6 0s4-1.500 6 0 4 1.500 6 0M3 21c2 1.500 4 1.500 6 0s4-1.500 6 0 4 1.500 6 0"/><path d="M9 14c0-3 1.500-5 4-5 0 2.500-1.500 4.500-4 5zM11 14V7"/>';
const food = '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M14 3l-3 7M17 4l-4 6"/>';
const shrine = '<path d="M3 6c3 1.500 15 1.500 18 0M5 9h14M7 9v11M17 9v11M12 9v3"/>';
const leaf = '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 10-9"/>';
const spark = '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>';
const night = '<path d="M17.500 13.500A6.500 6.500 0 0 1 10 6a6.500 6.500 0 1 0 7.500 7.500z"/><path d="M5 20h14"/>';
const lantern = '<path d="M9 4h6M8 7h8v8H8zM12 15v3M10 21h4"/><path d="M8 11h8"/>';
const feet = '<ellipse cx="8.500" cy="9" rx="2.200" ry="3.500"/><ellipse cx="15.500" cy="15" rx="2.200" ry="3.500"/>';
const bench = '<path d="M4 11h16M5 11v-3h14v3M6 11v7M18 11v7M4 15h16"/>';
const trail = '<path d="M4 20l5-7 3 3 4-8 4 4"/><path d="M3 20h18"/>';
const flat = '<path d="M3 15h18M3 19h18"/><path d="M6 11l3-3 3 3M12 8h0"/>';
const flag = '<path d="M6 21V4M6 5h11l-2.500 3.500L17 12H6"/>';
const person = '<circle cx="12" cy="8" r="3.500"/><path d="M5 20c0-4 3-6.500 7-6.500s7 2.500 7 6.500"/>';
const photo = '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.800"/><path d="M4 17l5-4 4 3 3-2 4 3"/>';
const unknown = '<circle cx="12" cy="12" r="8.500"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.8.400-1 .9-1 1.700M12 16.500h.01"/>';
const waves = '<path d="M3 9c2 1.500 4 1.500 6 0s4-1.500 6 0 4 1.500 6 0M3 14c2 1.500 4 1.500 6 0s4-1.500 6 0 4 1.500 6 0M3 19c2 1.500 4 1.500 6 0s4-1.500 6 0 4 1.500 6 0"/>';
const mountRiver = '<path d="M2 14l6-8 4.500 6L15 9l7 5"/><path d="M3 19c2 1.500 4 1.500 6 0s4-1.500 6 0 4 1.500 6 0"/>';
const cityLights = '<path d="M5 21V9h6v12M13 21V4h6v17M3 21h18"/><path d="M7.500 12h1M7.500 15h1M15.500 8h1M15.500 11h1M15.500 14h1"/>';
const either = '<path d="M4 9h14l-3-3M20 15H6l3 3"/>';
const asterisk = '<path d="M12 4v16M5 8l14 8M19 8L5 16"/>';
const inn = '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5"/>';
const walker = '<circle cx="13" cy="5" r="2"/><path d="M13 8v6l-3 6M13 14l4 6M13 10l-4 2M13 10l3 3"/>';

export const ICONS = {
  '日帰りで': sun, '1泊で': moon, '2泊以上で': moons,
  '北海道・東北': pin, '関東': pin, '中部': pin, '関西': pin, '中国・四国': pin, '九州・沖縄': pin, 'どこでもよい': globe,
  '温泉': hotspring, '街並み': town, '絶景': view, '島や海': island, '食べもの': food, '歴史や寺社': shrine,
  '静かなところ': leaf, 'にぎやかなところ': spark, 'しんとした夜': night, '街に出る夜': lantern,
  'たくさん歩きたい': feet, '少しでいい': bench, '平気': trail, '平らな道がいい': flat,
  '名の知れたところ': flag, '人の少ないところ': person, '見たことのある景色': photo, 'まだ知らない景色': unknown,
  '山や川': mountRiver, '海や湖': waves, '街の灯り': cityLights, 'こだわらない': asterisk,
  '宿でゆっくり': inn, '外を歩き回る': walker, 'どちらでも': either,
};
export const iconSvg = (label) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[label] || either}</svg>`;
