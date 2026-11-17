// 診断の共有画像の「中身のハッシュ」（2026-11-18）。scripts/buildQuizOgAll.mjs（画像を作る）と scripts/auditQuiz.mjs（古い画像を見つける）が同じ式を使う。
import crypto from 'node:crypto';
export const ACCOUNT = '@mori__lab';
export const OG_VERSION = 5;   // 2026-11-18: 縦書き・スタンプの地図・落款・バッジ。v3 は名前を控えめな大きさにし、地図を大きく寄せた。v4 は日本全体の点の地図（全1,191件の墨の点＋選ばれた1点の朱の輪）。v5 は塗りのある日本地図（陸の塗り・県境）・横長の落款   // 画像の見た目を変えたら上げる
/** 画像の中身（旅先名・県名・win・点の位置・アカウント名・地図・版）のハッシュ。これが変わったら画像を作り直す */
export const contentHash = (d, map) => crypto.createHash('sha1').update(JSON.stringify([OG_VERSION, d.name, d.prefecture, d.win, d.x, d.y, ACCOUNT, map.frames.map((f) => [f.path, f.pref])])).digest('hex').slice(0, 12);
