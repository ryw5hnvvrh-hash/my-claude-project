"""공개 대시보드 페이지 생성 — public_dashboard.py가 만든 3개 JSON을 정적 HTML 한 장에 넣는다.

사용: python3 scripts/office/public_page.py <YYYY-MM-DD> <jsondir> <out.html>
jsondir에는 followers.json, posts.json, plan.json이 있어야 한다.
매출·정산·주문·개인 일정은 넣지 않는다 (입력 JSON에도 없음).
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

TEMPLATE = Path(__file__).with_name("public_page_template.html")


def main(day, jsondir, out):
    d = Path(jsondir)
    data = {k: json.loads((d / f"{k}.json").read_text()) for k in ("followers", "posts", "plan")}
    now = datetime.now(timezone(timedelta(hours=9)))
    data["updated"] = f"{day[5:7].lstrip('0')}/{day[8:10].lstrip('0')} {now:%H:%M}"
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    Path(out).write_text(TEMPLATE.read_text().replace("__DATA__", blob))


if __name__ == "__main__":
    main(*sys.argv[1:4])
