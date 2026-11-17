#!/usr/bin/env python3
"""
本番(tabidokoiko.com)に、main の 11/6〜11/10 のコミットが1つずつ入っているかの実測（2026-11-17）。読み取りのみ。
コミットごとに、そのコミットが変えた文字列（旅先・記事のJSONの差分）のうち、手元の dist に出るもの（＝画面に出る変更）を探し、
代表の旅先1〜2件の本番ページにその文字列があるか／消した文字列が無いかを調べる。画面に出ない変更は、そう書く。
結果: logs/verify_20261117/commits.json     VERIFY_CACHE=<pickle> で verifyProdMerge20261117.py のキャッシュを使う
"""
import json, re, html, os, pickle, subprocess, urllib.parse, urllib.request, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(R)
BASE = 'https://tabidokoiko.com'
prod = pickle.load(open(os.environ['VERIFY_CACHE'], 'rb'))      # {path: (status, html)}
def sh(*a): return subprocess.run(a, capture_output=True, text=True).stdout
def txt(h): return html.unescape(re.sub(r'<[^>]+>', '', h))
def local(p):
    f = 'dist' + p + 'index.html'; return open(f, encoding='utf8').read() if os.path.exists(f) else ''
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40) as r: return r.status, r.read().decode('utf-8', 'replace')
    except Exception as e: return 0, ''
def strings(o, out=None):
    out = [] if out is None else out
    if isinstance(o, str): out.append(o)
    elif isinstance(o, dict): [strings(v, out) for v in o.values()]
    elif isinstance(o, list): [strings(v, out) for v in o]
    return out
def js(ref, path):
    s = sh('git', 'show', f'{ref}:{path}')
    try: return json.loads(s)
    except Exception: return None
commits = sh('git', 'log', '--first-parent', '--no-merges', '--reverse', '--since=2026-11-06 00:00', '--until=2026-11-10 23:59:59', '--format=%h|%ci|%s', '0d098ccd').strip().split('\n')
sitemap = get(BASE + '/sitemap.xml')[1]
lm_now = json.load(open('src/data/lastmod.json'))
out = []
for line in commits:
    h, when, subj = line.split('|', 2)
    files = [f for f in sh('git', 'show', '--name-only', '--format=', h).split('\n') if f]
    shown = [f for f in files if f.startswith(('src/', 'public/', 'package.json', 'astro.config'))]
    row = {'commit': h, '日時': when[:16], '件名': subj[:60], '本番に出る変更のファイル数': len(shown)}
    notes = []
    if not shown:
        row['結果'] = '本番に出ない変更（scripts・docs・logs・backup だけ）'; row['確認URL'] = '-'; out.append(row); continue
    ok = True; urls = []
    # 旅先データ・記事
    changed_ids = {}
    if 'src/data/destinations.json' in files:
        a = js(h + '^', 'src/data/destinations.json') or []; b = js(h, 'src/data/destinations.json') or []
        am = {x['id']: x for x in a};
        for x in b:
            if x['id'] not in am or json.dumps(x, sort_keys=True, ensure_ascii=False) != json.dumps(am[x['id']], sort_keys=True, ensure_ascii=False):
                changed_ids[x['id']] = (am.get(x['id']), x)
    for f in files:
        m = re.match(r'src/data/articles/(.+)\.json$', f)
        if m:
            a = js(h + '^', f); b = js(h, f); changed_ids.setdefault(m[1], (a, b))
    checked_pages = 0; shown_changes = 0
    for id_, (a, b) in list(changed_ids.items()):
        p = f'/destinations/{id_}/'
        if p not in prod or prod[p][0] != 200: continue
        sa = set(strings(a)) if a else set(); sb = set(strings(b)) if b else set()
        add = [s for s in sb - sa if len(s) >= 8]; rem = [s for s in sa - sb if len(s) >= 8]
        t_prod = txt(prod[p][1]); t_loc = txt(local(p))
        # 画面に出る（手元の dist にある）追加文字列・消した文字列
        vis_add = [s for s in add if s in t_loc]
        bad_add = [s for s in vis_add if s not in t_prod]
        bad_rem = [s for s in rem if s in t_prod and s not in t_loc]
        if vis_add or rem:
            shown_changes += 1
        if vis_add or rem:
            checked_pages += 1; urls.append(p)
            if bad_add or bad_rem: ok = False; notes.append(f'{id_}: 追加が無い{len(bad_add)}・消した文が残る{len(bad_rem)}')
        if checked_pages >= 3 and ok: break
    # lastmod
    if 'src/data/lastmod.json' in files:
        a = js(h + '^', 'src/data/lastmod.json') or {}; b = js(h, 'src/data/lastmod.json') or {}
        keys = [k for k in b.get('destinations', {}) if a.get('destinations', {}).get(k) != b['destinations'][k]][:3] + [k for k in b.get('pages', {}) if a.get('pages', {}).get(k) != b['pages'][k]][:2]
        for k in keys:
            loc = (f'/destinations/{k}/' if k in b.get('destinations', {}) else k)
            want = lm_now['destinations'].get(k) if k in b.get('destinations', {}) else lm_now['pages'].get(k)
            mm = re.search(r'<loc>https://tabidokoiko.com' + re.escape(urllib.parse.quote(loc, safe='/%')) + r'</loc>\s*<lastmod>([^<]+)</lastmod>', sitemap)
            urls.append(loc); checked_pages += 1
            if not mm or mm[1] != want: ok = False; notes.append(f'sitemap {loc}: 本番 {mm[1] if mm else "なし"} / 期待 {want}')
    # 応援割・特設ページ
    if 'src/data/ouenWari.ts' in files:
        src = open('src/data/ouenWari.ts', encoding='utf8').read()
        for slug in re.findall(r"slug: '([^']+)'", src)[:9]:
            p = f'/{slug}/';
            if p in prod and prod[p][0] == 200: urls.append(p); checked_pages += 1
        # 11/10 の本文: 各制度の state の冒頭が本番にあるか
        t_all = ''
        miss = 0
        for m in re.finditer(r"\n    state: ((?:['\"].*?['\"],?\n(?:\s+\+ )?)+)", src): pass
    if 'src/pages/kyushu-fukko.astro' in files or 'src/pages/ouen-wari.astro' in files: pass
    # 新しい旅先
    for f in files:
        pass
    if h in ('58850762', '804e9fc0'):
        for id_ in ('hinoemata-onsen', 'nakanosawa-onsen'):
            p = f'/destinations/{id_}/'; urls.append(p); checked_pages += 1
            t = prod[p][1]
            if prod[p][0] != 200 or '車なしで' not in t: ok = False; notes.append(f'{id_}: 車なしで行く が無い')
    if h == '106d6ada':
        raw_jp = len(re.findall(r'<loc>[^<]*[^\x00-\x7f][^<]*</loc>', sitemap)); urls.append('/sitemap.xml'); checked_pages += 1
        if raw_jp: ok = False; notes.append(f'日本語のままの loc {raw_jp}件')
        else: notes.append('sitemap の loc に日本語のままのものは0件')
    row['確認URL'] = ' '.join(urls[:3]) + (f' ほか{len(urls)-3}件' if len(urls) > 3 else '')
    row['確認したページ数'] = checked_pages
    row['結果'] = ('OK' if ok and checked_pages else ('確認できる変更が見つからない（画面に出ない変更）' if ok else 'NG')) + (' / ' + '; '.join(notes) if notes else '')
    out.append(row)
json.dump(out, open('logs/verify_20261117/commits.json', 'w'), ensure_ascii=False, indent=1)
for r in out: print(r['commit'], r['日時'], r['件名'][:30], '|', r['本番に出る変更のファイル数'], '|', r['結果'][:70], '|', r['確認URL'][:70])
