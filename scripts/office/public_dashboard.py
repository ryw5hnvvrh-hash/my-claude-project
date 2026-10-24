"""공개용 대시보드(https://claude.ai/artifact/74XyD5fjRNzjEJ6PVf11y5) 데이터 파일 3개를 만든다.

사용: python3 scripts/office/public_dashboard.py <YYYY-MM-DD> <office_calendar.json> <outdir>
- followers.json : 날짜별 팔로워 수 (performance/instagram_*.json)
- posts.json     : 최근 게시물 숫자 (오늘 파일)
- plan.json      : 지난 7일 ~ 앞으로 14일 콘텐츠 일정 (오피스 캘린더, 개인 일정 제외)
토큰·API 원본 응답은 넣지 않는다.
"""
import glob, json, os, sys, datetime as dt

day, cal_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)

followers = []
for p in sorted(glob.glob('performance/instagram_2026-*.json')):
    d = json.load(open(p))
    acct = d.get('account') or {}
    if isinstance(acct, dict) and acct.get('followers_count') is not None:
        followers.append({'day': d.get('date') or os.path.basename(p)[10:20], 'followers': acct['followers_count']})

today = json.load(open(f'performance/instagram_{day}.json'))
posts = []
for x in today.get('posts', []):
    cap = (x.get('caption') or '').strip().splitlines()
    posts.append({
        'posted': (x.get('timestamp') or '')[:16].replace('T', ' '),
        'title': cap[0][:60] if cap else '(캡션 없음)',
        'format': {'VIDEO': '릴스', 'CAROUSEL_ALBUM': '캐러셀', 'IMAGE': '사진'}.get(x.get('media_type'), x.get('media_type') or ''),
        'views': x.get('views'), 'reach': x.get('reach'), 'likes': x.get('like_count'),
        'saved': x.get('saved'), 'link': x.get('permalink') or '',
    })

cal = json.load(open(cal_path)); cal = cal.get('data', cal)
d0 = dt.date.fromisoformat(day)
lo, hi = (d0 - dt.timedelta(days=7)).isoformat(), (d0 + dt.timedelta(days=14)).isoformat()
plan = [{'date': p['date'], 'format': p.get('format', ''), 'title': p['title'],
         'status': '완료' if p.get('done') else ('지남' if p['date'] < day else '예정')}
        for p in cal.get('plans', []) if lo <= p['date'] <= hi and p.get('format') != '개인']
plan.sort(key=lambda r: r['date'])

for name, rows in (('followers', followers), ('posts', posts), ('plan', plan)):
    json.dump(rows, open(f'{out}/{name}.json', 'w'), ensure_ascii=False)
    print(name, len(rows))
