#!/usr/bin/env python3
"""매일 아침 오피스 인스타·대시보드 숫자 만들기 (08:55 루틴이 실행).

performance/instagram_<날짜>.json 만 읽어서, ArtifactData 로 그대로 올릴 JSON 두 개를 만든다.
  out/office_insta.json      → office/insta  {snapshots:[최근 14일]}
  out/office_dashboard_base.json → office/dashboard 의 숫자 부분(metrics). 일정·연동 칸은 루틴이 채운다.
토큰은 읽지도 쓰지도 않는다. 숫자가 없으면 넣지 않는다(지어내지 않음).
사용: python3 scripts/office/morning_update.py <날짜 YYYY-MM-DD> <출력 폴더>
"""
import glob, json, os, sys
from datetime import date, timedelta

KEEP = ("date", "fetched_at", "account", "posts", "errors")
LAUNCH = date(2026, 10, 13)


def load(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    return {k: d.get(k) for k in KEEP}


def main(day: str, out: str):
    os.makedirs(out, exist_ok=True)
    files = sorted(glob.glob("performance/instagram_20??-??-??.json"))
    snaps = [load(f) for f in files if os.path.basename(f)[10:20] <= day][-14:]
    if not snaps or snaps[-1]["date"] != day:
        print(f"오늘({day}) 인스타 파일 없음 — 대시보드 숫자 갱신 안 함")
        json.dump({"snapshots": snaps}, open(f"{out}/office_insta.json", "w", encoding="utf-8"), ensure_ascii=False)
        return 1
    json.dump({"snapshots": snaps}, open(f"{out}/office_insta.json", "w", encoding="utf-8"), ensure_ascii=False)

    today, prev = snaps[-1], (snaps[-2] if len(snaps) > 1 else None)
    metrics = []
    f = today["account"].get("followers_count")
    if f is not None:
        note = today["fetched_at"][5:16].replace("T", " ").replace("-", "/")
        if prev and prev["account"].get("followers_count") is not None:
            diff = f - prev["account"]["followers_count"]
            note = f"전날 대비 {diff:+d} · {note}"
        metrics.append({"label": "팔로워", "value": f"{f:,}", "note": note, "tone": "yellow"})

    d = date.fromisoformat(day)
    yday = (d - timedelta(days=1)).isoformat()
    posts = today.get("posts") or []
    yposts = [p for p in posts if (p.get("timestamp") or "")[:10] == yday]
    if yposts:
        p = yposts[0]
        bits = [f"도달 {p['reach']:,}" if p.get("reach") is not None else None,
                f"좋아요 {p['like_count']}" if p.get("like_count") is not None else None,
                f"저장 {p['saved']}" if p.get("saved") is not None else None]
        if p.get("views") is not None:
            metrics.append({"label": "어제 게시물 조회", "value": f"{p['views']:,}",
                            "note": " · ".join(b for b in bits if b), "tone": "mint"})
    else:
        metrics.append({"label": "어제 게시물", "value": "없음", "note": f"{yday[5:].replace('-', '/')} 게시 기록 없음", "tone": "white"})

    monday = d - timedelta(days=d.weekday())
    reels = [p for p in posts if p.get("media_type") == "VIDEO" and monday.isoformat() <= (p.get("timestamp") or "")[:10] <= day]
    metrics.append({"label": "이번 주 릴스", "value": f"{len(reels)} / 4",
                    "note": f"{monday.month}/{monday.day}~{(monday + timedelta(days=6)).month}/{(monday + timedelta(days=6)).day}", "tone": "pink"})

    left = (LAUNCH - d).days
    if left >= 0:
        metrics.append({"label": "아이원츄 출시", "value": "D-day" if left == 0 else f"D-{left}", "note": "10/13(화) · 19,900 / 맥세이프 24,400원", "tone": "lav"})

    json.dump({"date": day, "metrics": metrics}, open(f"{out}/office_dashboard_base.json", "w", encoding="utf-8"), ensure_ascii=False)
    print(json.dumps(metrics, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
