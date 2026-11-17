// 診断の共有画像の「中身のハッシュ」（2026-11-18）。scripts/buildQuizOgAll.mjs（画像を作る）と scripts/auditQuiz.mjs（古い画像を見つける）が同じ式を使う。
import crypto from 'node:crypto';
export const ACCOUNT = '@mori__lab';
export const OG_VERSION = 1;   // 画像の見た目を変えたら上げる
/** 画像の中身（旅先名・県名・win・点の位置・アカウント名・地図・版）のハッシュ。これが変わったら画像を作り直す */
export const contentHash = (d, map) => crypto.createHash('sha1').update(JSON.stringify([OG_VERSION, d.name, d.prefecture, d.win, d.x, d.y, ACCOUNT, map.frames.map((f) => f.path)])).digest('hex').slice(0, 12);
