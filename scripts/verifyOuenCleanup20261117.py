#!/usr/bin/env python3
"""
本番(tabidokoiko.com)の実測（2026-11-17・福岡・佐賀・長崎・大分の取り直しの反映後）。読み取りのみ。
  1. 全ページ: HTTP 200・手元の dist と一致
  2. 反映の前後: 前（VERIFY_CACHE=反映前の本番HTMLの写し）と後で、HTMLが変わったページ（想定: 応援割の5ページだけ）
  3. 応援割の各ページの項目（data-fact）を1つずつ、前後で比べる: 更新対象でない項目の本文は同じ・更新対象は想定の本文になっている
  4. 更新した項目の数が、いまの公式（CSV・PDFを取り直して数えた値）と一致している
結果: logs/verify_20261117/cleanup_result.json
usage: VERIFY_CACHE=<pickle> python3 scripts/verifyOuenCleanup20261117.py
"""
import os, re, json, html, csv, io, pickle, subprocess, urllib.request, urllib.parse, concurrent.futures as cf
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(R)
BASE = 'https://tabidokoiko.com'; UA = {'User-Agent': 'Mozilla/5.0 verifyOuenCleanup'}
def get(url, binary=False):
    for _ in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                b = r.read(); return r.status, (b if binary else b.decode('utf-8', 'replace'))
        except urllib.error.HTTPError as e: return e.code, (b'' if binary else '')
        except Exception: pass
    return 0, (b'' if binary else '')
def local(p):
    f = 'dist' + p + 'index.html'; return open(f, encoding='utf8').read() if os.path.exists(f) else None
before = pickle.load(open(os.environ['VERIFY_CACHE'], 'rb'))
paths = sorted(before)
after = {}
def fetch(p): s, t = get(BASE + urllib.parse.quote(p, safe='/%')); return p, s, t
with cf.ThreadPoolExecutor(8) as ex:
    for p, s, t in ex.map(fetch, paths): after[p] = (s, t)
res = {}
res['全ページ'] = {'検査': len(paths), 'HTTP200': sum(1 for p in paths if after[p][0] == 200), '手元のdistと一致': sum(1 for p in paths if after[p][1] == local(p)),
                 '不一致': [p for p in paths if after[p][1] != local(p)][:8]}
changed = [p for p in paths if before[p][1] != after[p][1]]
res['反映の前後でHTMLが変わったページ'] = changed
# ---- 項目（data-fact）
def facts(t):
    out = []
    for m in re.finditer(r'<li class="(?:kf|ow)-fact"[^>]*data-checked="([^"]+)"[^>]*>(.*?)</li>', t, re.S):
        lab = re.search(r'class="(?:kf|ow)-fact-label"[^>]*>(.*?)</span>', m[2], re.S); bod = re.search(r'class="(?:kf|ow)-fact-body"[^>]*>(.*?)</span>', m[2], re.S)
        if lab and bod: out.append((html.unescape(re.sub(r'<[^>]+>', '', lab[1])).strip(), html.unescape(re.sub(r'<[^>]+>', '', bod[1])).strip(), m[1]))
    return out
targets = json.load(open('logs/ouen_cleanup_20261117/before_after.json'))
tgt = {(x['slug'], x['item']) for x in targets}
body_changed = {(x['slug'], x['item']) for x in targets if x['before_body'] != x['after_body']}
slugs = ['kagoshima-oen', 'kagoshima-fukko', 'fukuoka-oen', 'miyazaki-oen', 'kumamoto-oen', 'saga-oen', 'nagasaki-oen', 'oita-oen']
unchanged_bad = []; target_bad = []; n_before = 0; n_same = 0; n_date_only = 0; n_body_changed_ok = 0
for sl in slugs:
    p = f'/{sl}/'; fb = {}; fa = {}
    for lab, bod, chk in facts(before[p][1]): fb[lab] = (bod, chk)
    for lab, bod, chk in facts(after[p][1]): fa[lab] = (bod, chk)
    for lab, (bod, chk) in fb.items():
        n_before += 1
        isT = (sl, lab) in tgt
        if lab not in fa: unchanged_bad.append((sl, lab, '後に無い')); continue
        if not isT:
            if fa[lab][0] == bod and fa[lab][1] == chk: n_same += 1
            else: unchanged_bad.append((sl, lab, '更新対象でないのに変わった'))
        elif (sl, lab) in body_changed:
            exp = next(x for x in targets if x['slug'] == sl and x['item'] == lab)['after_body']
            exp = html.unescape(json.loads(exp[exp.index(':') + 1:].strip().rstrip(',')) if exp.startswith('body:') else exp)
            if fa[lab][0] == exp and fa[lab][1] == '2026-11-17': n_body_changed_ok += 1
            else: target_bad.append((sl, lab, '想定の本文・確認日と違う'))
        else:
            if fa[lab][0] == bod and fa[lab][1] == '2026-11-17': n_date_only += 1
            else: target_bad.append((sl, lab, '確認日だけの更新のはずが違う'))
res['項目(data-fact)の前後比較'] = {'前にあった項目(8制度)': n_before, '更新対象でない項目で本文・確認日が同じ': n_same, '更新対象でない項目で変わったもの': unchanged_bad[:8],
                                  '更新対象のうち本文を変えた項目が想定どおり': n_body_changed_ok, '更新対象のうち確認日だけの項目が想定どおり': n_date_only, '更新対象で想定と違うもの': target_bad[:8]}

# ---- 県ページの確認日: 各ページの data-fact の確認日（data-checked）を、データ（ouenWari.ts）の項目の確認日と1つずつ照らす
src = open('src/data/ouenWari.ts', encoding='utf8').read()
def iso(j): m = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日', j); return f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}"
marks = [(m.start(), m[1]) for m in re.finditer(r"^ {4}slug:\s*'([^']+)'", src, re.M)]
dc = {}
for i, (pos, sl) in enumerate(marks):
    blk = src[pos: marks[i + 1][0] if i + 1 < len(marks) else len(src)]
    exp = sorted(iso(m[2]) for m in re.finditer(r"^ {6,}checked:\s*(['\"])([^'\"]+)\1", blk, re.M))
    got = sorted(re.findall(r'<li class="kf-fact"[^>]*data-checked="([^"]+)"', after[f'/{sl}/'][1]))
    dc[sl] = {'データの項目の確認日': len(exp), '本番のdata-factの確認日': len(got), '一致': exp == got, '日付ごと': {d: got.count(d) for d in sorted(set(got))}}
res['県ページの確認日（データと本番のdata-fact）'] = dc

# ---- 公式の値（いま取り直して数える）
def rows(b, enc='utf-8-sig'): return list(csv.reader(io.StringIO(b.decode(enc))))
def pdf_text(b, name):
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f: f.write(b); fn = f.name
    return subprocess.run(['pdftotext', '-layout', fn, '-'], capture_output=True, text=True).stdout
off = {}
s, top = get('https://fukuoka-fukkou-wari.jp/stay/'); m = re.search(r"csvUrl:\s*'([^']+)'", top)
s, b = get('https://fukuoka-fukkou-wari.jp' + m[1], True); r = rows(b); nm = r[0].index('個人_自由項目1_宿泊施設名')
off['福岡 宿泊施設'] = (sum(1 for x in r[1:] if any(f.strip() for f in x)), sum(1 for x in r[1:] if x[-1].strip()), m[1].rsplit('/', 1)[1])
s, top = get('https://fukuoka-fukkou-wari.jp/agt/'); m = re.search(r"csvUrl:\s*'([^']+)'", top)
s, b = get('https://fukuoka-fukkou-wari.jp' + m[1], True); r = rows(b); off['福岡 旅行会社'] = (sum(1 for x in r[1:] if any(f.strip() for f in x)), sum(1 for x in r[1:] if x[-1].strip()), m[1].rsplit('/', 1)[1])
s, b = get('https://saga-ouen.jp/assets/pdf/hotels.pdf', True); t = pdf_text(b, 'saga_hotels.pdf')
blocks = []; cur = None
for l in t.split('\n'):
    mm = re.match(r'^\s*(\d{1,3})\s+\S', l)
    if mm and not re.match(r'^\s*\d{4}/', l) and ((cur is None and int(mm[1]) == 1) or (cur and int(mm[1]) == cur[0] + 1)): cur = [int(mm[1]), l]; blocks.append(cur); continue
    if cur: cur.append(l)
off['佐賀 宿泊施設'] = (len(blocks), sum(1 for b_ in blocks if any('予約受付終了しました' in x for x in b_[1:])), sum(1 for b_ in blocks if any('受付開始までお待ちください' in x for x in b_[1:])), re.search(r'20\d\d/\d+/\d+', t)[0])
s, top = get('https://oita-fukkou-wari.jp/stay/'); m = re.search(r"csvUrl:\s*'([^']+)'", top)
s, b = get('https://oita-fukkou-wari.jp' + m[1], True); r = rows(b); off['大分 宿泊施設'] = (sum(1 for x in r[1:] if any(f.strip() for f in x)), sum(1 for x in r[1:] if x[-1].strip() == '完売'), m[1].rsplit('/', 1)[1])
s, top = get('https://oita-fukkou-wari.jp/agt/'); m = re.search(r"csvUrl:\s*'([^']+)'", top)
s, b = get('https://oita-fukkou-wari.jp' + m[1], True); r = rows(b); off['大分 旅行会社'] = (sum(1 for x in r[1:] if any(f.strip() for f in x)), sum(1 for x in r[1:] if x[-1].strip() == '完売'), m[1].rsplit('/', 1)[1])
res['いまの公式の値'] = off
T = {p: html.unescape(re.sub(r'<[^>]+>', '', after[p][1])) for p in ['/fukuoka-oen/', '/saga-oen/', '/oita-oen/', '/nagasaki-oen/']}
chk = {
 '福岡 宿泊施設の数': f"{off['福岡 宿泊施設'][0]}施設" in T['/fukuoka-oen/'] and off['福岡 宿泊施設'][2].split('_')[-2] == '261116',
 '福岡 旅行会社の数': f"{off['福岡 旅行会社'][0]}社" in T['/fukuoka-oen/'],
 '佐賀 宿泊施設の数と受付終了': f"{off['佐賀 宿泊施設'][0]}施設のうち{off['佐賀 宿泊施設'][1]}施設" in T['/saga-oen/'] and off['佐賀 宿泊施設'][2] == 0,
 '大分 宿泊施設の数と完売': f"{off['大分 宿泊施設'][0]}施設のうち{off['大分 宿泊施設'][1]}施設" in T['/oita-oen/'],
 '大分 旅行会社の数と完売': f"{off['大分 旅行会社'][0]}社のうち{off['大分 旅行会社'][1]}社" in T['/oita-oen/'] or f"{off['大分 旅行会社'][0]}社で、{off['大分 旅行会社'][1]}社" in T['/oita-oen/'],
 '長崎 STAYNAVI・OTAの完売表示（11/17確認）': '11月17日確認' in T['/nagasaki-oen/'],
}
res['本番の本文とのつき合わせ'] = chk
json.dump(res, open('logs/verify_20261117/cleanup_result.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
