#!/usr/bin/env python3
"""
本番(tabidokoiko.com)の実測（2026-11-17・本番を main から作り直した後）。読み取りのみ。
 全ページ: 本番のHTML == 手元の dist
 (a) PR表記・お問い合わせの導線  (b) 転送ページ4件  (c) 確認日  (d) 送迎の削除  (e) title/description 20ページ
 (f) 檜枝岐温泉・支笏湖いとう温泉の画像とクレジット  (g) main の 11/6〜11/10 のコミットを1つずつ
結果は logs/verify_20261117/result.json
"""
import json, re, html, sys, hashlib, urllib.request, urllib.parse, concurrent.futures as cf, subprocess, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(R)
BASE = 'https://tabidokoiko.com'
UA = {'User-Agent': 'Mozilla/5.0 verifyProdMerge'}

def get(url, binary=False):
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                b = r.read(); return r.status, (b if binary else b.decode('utf-8', 'replace')), r.headers.get('content-type', '')
        except urllib.error.HTTPError as e:
            return e.code, '', ''
        except Exception:
            pass
    return 0, '', ''

def local(path):
    p = 'dist' + path + ('index.html' if path.endswith('/') else '')
    return open(p, encoding='utf-8').read() if os.path.exists(p) else None

def txt(h):  # タグを外して実体参照を戻す（文の有無を見る用）
    return html.unescape(re.sub(r'<[^>]+>', '', h))

res = {}
# ---- 全ページの一致
paths = []
for root, _, files in os.walk('dist'):
    for f in files:
        if f == 'index.html':
            p = os.path.relpath(root, 'dist'); paths.append('/' if p == '.' else '/' + p + '/')
paths.sort()
prod = {}
def fetch_page(p):
    s, t, _ = get(BASE + urllib.parse.quote(p, safe="/%"))
    return p, s, t
import pickle
CACHE = os.environ.get('VERIFY_CACHE')
if CACHE and os.path.exists(CACHE):
    prod = pickle.load(open(CACHE, 'rb'))
else:
    with cf.ThreadPoolExecutor(8) as ex:
        for p, s, t in ex.map(fetch_page, paths):
            prod[p] = (s, t)
    if CACHE: pickle.dump(prod, open(CACHE, 'wb'))
diff = [p for p in paths if prod[p][0] != 200 or prod[p][1] != local(p)]
res['全ページ'] = {'検査': len(paths), 'HTTP200': sum(1 for p in paths if prod[p][0] == 200), '手元のdistと一致': len(paths) - len(diff), '不一致': diff[:10]}

# ---- (a) PR表記・お問い合わせの導線
PR = '広告（アフィリエイト）を含みます'
dest_paths = [p for p in paths if p.startswith('/destinations/') and p != '/destinations/']
withlink = [p for p in paths if 'rakuten' in prod[p][1] or 'jalan.net' in prod[p][1] or 'valuecommerce' in prod[p][1]]
res['a'] = {
    'PR表記あり(本番の全ページ)': sum(1 for p in paths if PR in prod[p][1]),
    'アフィリエイトのリンクがあるページ': len(withlink),
    'リンクがあるのにPR表記なし': [p for p in withlink if PR not in prod[p][1]][:5],
    'sponsored の rel あり': sum(1 for p in paths if 'sponsored' in prod[p][1]),
    '「誤りを知らせる」リンク(旅先・ハブ・応援割系)': sum(1 for p in paths if '誤りを知らせる' in prod[p][1]),
    '/contact/ へのリンクがあるページ': sum(1 for p in paths if 'href="/contact/' in prod[p][1]),
    '/contact/ HTTP': prod['/contact/'][0],
    'affiliate_click の計測あり': sum(1 for p in paths if 'affiliate_click' in prod[p][1]),
}

# ---- (b) 転送ページ
mv = {}
for id_, to in [('ohara-2', 'ohara'), ('dazaifu-2', 'dazaifu'), ('hokkaido-furano-2', 'furano'), ('osorezan-area', 'osorezan')]:
    p = f'/destinations/{id_}/'; s, t = prod[p]
    mv[id_] = {'HTTP': s, '転送先': f'/destinations/{to}/' in t and 'http-equiv="refresh"' in t, 'distと一致': t == local(p),
               '旧ページ(おすすめ観光スポット3選)のまま': '観光スポット3選' in t and 'http-equiv="refresh"' not in t}
res['b'] = mv

# ---- (c) 確認日
src = open('src/data/ouenWari.ts', encoding='utf8').read()
def iso(s): m = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日', s); return f'{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}'
slugs = [(m.start(), m.group(1)) for m in re.finditer(r"slug:\s*'([^']+)'", src)]
pf = src.index('export const PARENT_FACTS'); sc = src.index('export const SCHEMES')
def dates(a, b): return sorted({m.group(2) for m in re.finditer(r"checked:\s*(['\"])([^'\"]+)\1", src[a:b]) if '年' in m.group(2)})
c = {}
exp = {'/ouen-wari/': dates(pf, sc)}
for i, (pos, slug) in enumerate(slugs):
    end = slugs[i + 1][0] if i + 1 < len(slugs) else len(src); exp[f'/{slug}/'] = dates(pos, end)
for p, ds in exp.items():
    t = prod[p][1]
    got = sorted(set(re.findall(r'確認日[^<]{0,12}?(20\d\d年\d+月\d+日)', t)) | set(re.findall(r'data-checked="([^"]+)"', t)))
    nov17 = t.count('2026年11月17日'); nov4 = t.count('2026年11月4日')
    c[p] = {'データ上の確認日': ds, '本番に出る11月17日': nov17, '本番に出る11月4日': nov4, '本番に出る確認日の種類': sorted(set(re.findall(r'2026年11月\d+日', t)))[-3:]}
res['c'] = c
res['c_ouen'] = {'/ouen-wari/ の 2026年11月17日': prod['/ouen-wari/'][1].count('2026年11月17日'), '/ouen-wari/ の 2026年11月4日': prod['/ouen-wari/'][1].count('2026年11月4日')}

# ---- (d) 送迎: 11/9 と 11/6 に削除・変更した文が本番に無い
bd = json.load(open('backup/stay_shuttle_20261109/before_destinations.json'))
ba = json.load(open('backup/stay_shuttle_20261109/before_articles.json'))
sh = json.load(open('backup/stay_shuttle_20261109/before_after.json'))
cur = {x['id']: x for x in json.load(open('src/data/destinations.json'))}
def sents(s): return [x.strip() + '。' for x in re.split(r'。', s or '') if x.strip()]
removed = {}   # id -> [削除した文]
for id_ in sh['deleted']:
    b = bd.get(id_) or {}; c_ = cur.get(id_, {})
    cur_all = json.dumps(c_, ensure_ascii=False)
    gone = [s for s in sents(b.get('description')) if ('送迎' in s) and s not in cur_all]
    if id_ in ba and isinstance(ba[id_], dict):
        for v in json.dumps(ba[id_], ensure_ascii=False).split('。'):
            pass
    if gone: removed[id_] = gone
chg = {x['id']: x for x in sh['changes']}
f6 = json.load(open('backup/stay_free_20261106/before_after.json'))
d_in_prod, d_total, d_ids, d_bad = 0, 0, set(), []
for id_, gone in removed.items():
    t = txt(prod.get(f'/destinations/{id_}/', (0, ''))[1]); d_ids.add(id_)
    for s in gone:
        d_total += 1
        if s in t: d_bad.append((id_, s[:40]))
for x in sh['changes']:
    t = txt(prod.get(f"/destinations/{x['id']}/", (0, ''))[1]); d_ids.add(x['id']); d_total += 1
    if x.get('before') and x['before'] in t: d_bad.append((x['id'], x['before'][:40]))
    elif x.get('after') and x['after'] not in t: d_bad.append((x['id'], 'after が無い: ' + x['after'][:30]))
for x in f6:
    t = txt(prod.get(f"/destinations/{x['destId']}/", (0, ''))[1]); d_ids.add(x['destId'])
    if x['category'] == 'B':
        d_total += 1
        if x['before'] and x['before'] in t: d_bad.append((x['destId'], '11/6 B: ' + x['before'][:40]))
    elif x['category'] == 'C':
        d_total += 1
        if x['before'] and x['before'] in t: d_bad.append((x['destId'], '11/6 C: ' + x['before'][:40]))
res['d'] = {'11/9で文ごと削除した旅先': len(removed), '11/9で変更した項目': len(sh['changes']), '11/6の変更・削除の項目': len(f6),
            '確認した文の数': d_total, '確認した旅先ページ数': len(d_ids), '削除・変更前の文が本番に残っている': d_bad[:10], '件数(残っている)': len(d_bad)}

# ---- (e) 11/9 の title・description 20ページ
seo = json.load(open('logs/seo_changes_2026-11-09.json'))['items']
e_bad = []
for it in seo:
    t = prod.get(f"/destinations/{it['id']}/", (0, ''))[1]
    ti = html.unescape((re.search(r'<title>(.*?)</title>', t, re.S) or [None, ''])[1])
    de = html.unescape((re.search(r'<meta name="description" content="(.*?)"', t, re.S) or [None, ''])[1])
    if ti != it['after']['title'] or de != it['after']['description']: e_bad.append(it['id'])
res['e'] = {'対象': len(seo), '変更後の値と一致(title と description の両方)': len(seo) - len(e_bad), '不一致': e_bad}

# ---- (f) 画像とクレジット
f = {}
for id_ in ['hinoemata-onsen', 'gen_北海_支笏湖いとう温泉']:
    p = f'/destinations/{id_}/'; t = prod[p][1]; cr = cur[id_]['imageCredit']
    s, b, ct = get(BASE + urllib.parse.quote(f'/images/{id_}/main.jpg'), binary=True)
    lp = f'public/images/{id_}/main.jpg'
    f[id_] = {'ページHTTP': prod[p][0], '画像HTTP': s, 'content-type': ct, '画像のバイト数': len(b), '手元と同一': hashlib.sha256(b).hexdigest() == hashlib.sha256(open(lp, 'rb').read()).hexdigest(),
              'ページに画像のURL': f'/images/{id_.replace("gen_北海_","gen_%E5%8C%97%E6%B5%B7_")}/main.jpg' in t or f'/images/{id_}/main.jpg' in t,
              'クレジット(ライセンス)表示': cr['license'] in t, 'クレジット(撮影者)表示': cr['author'] in t, 'クレジット(出典URL)': cr['url'].split('/wiki/')[1][:20] in t, 'ライセンス': cr['license']}
res['f'] = f

json.dump({'prodPages': {p: prod[p][0] for p in paths[:0]}, **res}, open('logs/verify_20261117/result.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1)[:9000])
