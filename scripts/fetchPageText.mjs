#!/usr/bin/env node
// 指定URLの表示テキスト(コメント・script・style除去)を出力する。--grep 正規表現 で一致箇所の前後だけ表示（2026-10-14・応援割の確認用）
import iconv from 'iconv-lite';
const args = process.argv.slice(2);
const url = args[0];
const gi = args.indexOf('--grep');
const re = gi >= 0 ? new RegExp(args[gi + 1], 'g') : null;
const max = Number(args.includes('--max') ? args[args.indexOf('--max') + 1] : 3000);
const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'ja' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
const buf = Buffer.from(await r.arrayBuffer());
let html = buf.toString('utf8');
if (/charset=["']?shift_jis/i.test(html.slice(0, 2000))) html = iconv.decode(buf, 'Shift_JIS');
const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
  .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|dd|dt)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/[ \t　]+/g, ' ').replace(/\n\s*\n+/g, '\n');
console.log(`## ${r.status} ${r.url} (${text.length}字) endedクラス(コメント除く): ${(html.replace(/<!--[\s\S]*?-->/g, '').match(/class="[^"]*is-ended/g) || []).length}`);
if (re) { let m, n = 0; while ((m = re.exec(text)) && n++ < 40) console.log('..' + text.slice(Math.max(0, m.index - 60), m.index + 120).replace(/\n/g, ' ')); }
else console.log(text.slice(0, max));
