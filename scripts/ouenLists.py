# 公式の一覧 CSV（宿泊施設 /stay/・旅行会社 /agt/）を、各県の特設サイトから取得して件数を数える（読み取りのみ）。
# 使い方: python3 scripts/ouenLists.py <サイトのURL> ...   例: python3 scripts/ouenLists.py https://oita-fukkou-wari.jp
import csv, io, re, sys, urllib.request, collections
UA = {'User-Agent': 'Mozilla/5.0 dokoiko-check'}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40)
    return r.read(), r.headers.get('Last-Modified')
for base in sys.argv[1:]:
    base = base.rstrip('/')
    print(f'\n#### {base}')
    for page in ('stay', 'agt'):
        try:
            html = get(f'{base}/{page}/')[0].decode('utf-8', 'replace')
        except Exception as e:
            print(f'  {page}: ページ取得失敗 {type(e).__name__}'); continue
        names = sorted(set(re.findall(r'[A-Za-z0-9_]+?_(?:stay_search|agt_list)_\d{6}_\d{4}\.csv', html)))
        if not names: print(f'  {page}: CSV の名前がページに無い（JS で組み立て）'); continue
        for n in names[-1:]:
            try:
                raw, lm = get(f'{base}/csv/{n}')
            except Exception as e:
                print(f'  {page}: {n} 取得失敗 {type(e).__name__}'); continue
            rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig', 'replace'))))
            head = [h.replace('\n', '') for h in rows[0]]
            def ix(*keys):
                for k in keys:
                    for i, h in enumerate(head):
                        if k in h: return i
                return None
            iname = ix('施設名', '公式サイト上名称', '事業者名'); isold = ix('完売フラグ'); inote = ix('お知らせ', '備考'); istart = ix('発売開始日', '販売開始日')
            body = [r for r in rows[1:] if iname is not None and len(r) > iname and r[iname].strip()]
            def cell(r, i): return r[i].strip() if i is not None and len(r) > i else ''
            sold = sum(1 for r in body if cell(r, isold) == '完売' or cell(r, inote) == '完売')
            resale = [(cell(r, iname), cell(r, istart), cell(r, inote)) for r in body if '再販' in cell(r, istart) + cell(r, inote)]
            blank = sum(1 for r in body if not cell(r, istart))
            other = collections.Counter(cell(r, inote) or cell(r, isold) for r in body); other.pop('', None); other.pop('完売', None)
            print(f'  {page}: {n} Last-Modified={lm} / 行 {len(body)} / 完売 {sold} / 再販 {len(resale)} {resale[:2]} / 開始日の空欄 {blank} / その他の記載 {dict(other.most_common(4))}')
