# 公式の一覧 CSV（宿泊施設・旅行会社）の件数集計（読み取りのみ）。使い方: python3 scripts/ouenListStats.py <csv> [<csv>...]
import csv, sys, collections
for p in sys.argv[1:]:
    rows = list(csv.reader(open(p, encoding='utf-8-sig')))
    head = rows[0]; body = [r for r in rows[1:] if any(c.strip() for c in r)]
    print(f'== {p.split("/")[-1]}: 行 {len(body)} / 列 {[h.replace(chr(10),"") for h in head][:16]}')
    idx = {h.replace('\n', ''): i for i, h in enumerate(head)}
    def col(name):
        for k, i in idx.items():
            if name in k: return i
        return None
    c_sold = col('完売'); c_start = col('販売開始日'); c_note = col('お知らせ') if col('お知らせ') is not None else col('備考')
    if c_sold is not None:
        v = collections.Counter(r[c_sold].strip() if c_sold < len(r) else '' for r in body); print('  完売フラグ:', dict(v))
    if c_start is not None:
        v = collections.Counter(('空欄' if not (r[c_start].strip() if c_start < len(r) else '') else ('未定' if '未定' in r[c_start] else '日付あり')) for r in body); print('  販売開始日:', dict(v))
        re = [r[c_start] for r in body if len(r) > c_start and ('再販' in r[c_start])]; print('  販売開始日に「再販」:', len(re), re[:3])
    if c_note is not None:
        n = [r[c_note] for r in body if len(r) > c_note and r[c_note].strip()]; print('  お知らせ/備考の記入:', len(n), n[:3])
