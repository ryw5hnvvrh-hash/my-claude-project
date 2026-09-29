"""THING THAT HIT 사무실 타일 지도 생성기.

python3 office/build_map.py 를 실행하면 office/map.json 과 office/index.html(지도 보기)을 다시 만들고 검사한다.
검사: 출입구에서 모든 방·모든 책상 자리까지 걸어서 갈 수 있는지,
방마다 문이 있는지, 책상 자리 수가 직원 수와 같은지.
"""
import json
from collections import deque
from pathlib import Path

# 타일 종류. walkable=False 는 지나갈 수 없다.
LEGEND = {
    "#": {"name": "벽", "walkable": False},
    ".": {"name": "바닥", "walkable": True},
    ",": {"name": "복도", "walkable": True},
    "D": {"name": "방문", "walkable": True},
    "E": {"name": "정문", "walkable": True},
    "c": {"name": "책상 자리(의자)", "walkable": True},
    "T": {"name": "책상", "walkable": False},
    "M": {"name": "회의 테이블", "walkable": False},
    "R": {"name": "안내 데스크", "walkable": False},
    "S": {"name": "소파", "walkable": False},
    "K": {"name": "커피 머신", "walkable": False},
    "B": {"name": "수납장", "walkable": False},
    "P": {"name": "화분", "walkable": False},
}

# 크기: 방 한 칸 = 내부 6x5, 벽 공유. 로비 내부 6칸 폭.
ROOM_W, ROOM_H = 6, 5
PITCH = ROOM_W + 1
LOBBY_W = 6
SLOTS = 8
W = 1 + LOBBY_W + SLOTS * PITCH + 1  # 벽 x=0, 로비, 방 8칸(공유 벽), 동쪽 벽
H = 1 + ROOM_H + 1 + 3 + 1 + ROOM_H + 1
TOP_Y0, CORR_Y0, BOT_Y0 = 1, ROOM_H + 2, ROOM_H + 6  # 각 구역 내부 시작 y
FIRST_X = LOBBY_W + 1  # 첫 방의 왼쪽 벽 x

# 위쪽 줄: 하루 파이프라인 순서. 대표실은 검수팀과 기획 2팀 사이(1차 승인).
TOP = [
    ("research", "시장조사팀", 1, 1),
    ("plan1", "기획 1팀", 2, 1),
    ("qa", "브랜드 검수팀", 3, 1),
    ("ceo", "대표실", None, 1),
    ("plan2", "기획 2팀", 4, 1),
    ("review", "성과 리뷰실", 6, 1),
    ("finance", "정산팀", 5, 1),
    ("secretary", "비서실", 7, 1),
]
# 아래쪽 줄: (id, 이름, 차지하는 칸 수)
BOTTOM = [
    ("meeting", "회의실", 2),
    ("lounge", "라운지", 1),
    ("spare1", "예비실 1", 1),
    ("spare2", "예비실 2", 1),
    ("spare3", "예비실 3", 1),
    ("spare4", "예비실 4", 1),
    ("spare5", "예비실 5", 1),
]


def build():
    g = [["#"] * W for _ in range(H)]

    def fill(x0, y0, w, h, ch):
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                g[y][x] = ch

    rooms = []

    # 로비(출입구): 전체 높이, 서쪽 벽에 정문
    fill(1, 1, LOBBY_W, H - 2, ".")
    mid = CORR_Y0 + 1
    g[mid][0] = "E"
    g[mid][FIRST_X] = "D"  # 로비 → 복도
    g[mid - 3][3] = g[mid - 3][4] = "R"  # 안내 데스크
    g[1][1] = g[1][LOBBY_W] = g[H - 2][1] = g[H - 2][LOBBY_W] = "P"
    g[mid + 4][2] = g[mid + 4][3] = g[mid + 4][4] = "S"  # 대기 소파
    rooms.append({
        "id": "entrance", "name": "출입구", "dept": None, "staff": 0,
        "x": 1, "y": 1, "w": LOBBY_W, "h": H - 2,
        "doors": [[0, mid], [FIRST_X, mid]], "seats": [],
    })

    # 복도
    fill(FIRST_X + 1, CORR_Y0, W - FIRST_X - 2, 3, ",")

    # 위쪽 방: 문은 아래 벽
    for i, (rid, name, dept, staff) in enumerate(TOP):
        x0 = FIRST_X + 1 + i * PITCH
        fill(x0, TOP_Y0, ROOM_W, ROOM_H, ".")
        door = [x0 + 3, TOP_Y0 + ROOM_H]
        g[door[1]][door[0]] = "D"
        # 책상(2칸) + 의자. 의자는 책상 아래, 문 쪽.
        g[TOP_Y0 + 1][x0 + 2] = g[TOP_Y0 + 1][x0 + 3] = "T"
        seat = [x0 + 2, TOP_Y0 + 2]
        g[seat[1]][seat[0]] = "c"
        g[TOP_Y0][x0] = "B"
        g[TOP_Y0][x0 + ROOM_W - 1] = "P"
        if rid == "ceo":
            g[TOP_Y0 + ROOM_H - 1][x0] = "S"  # 손님 소파
        rooms.append({
            "id": rid, "name": name, "dept": dept, "staff": staff,
            "x": x0, "y": TOP_Y0, "w": ROOM_W, "h": ROOM_H,
            "doors": [door], "seats": [seat],
        })

    # 아래쪽 방: 문은 위 벽
    slot = 0
    for rid, name, span in BOTTOM:
        x0 = FIRST_X + 1 + slot * PITCH
        w = span * PITCH - 1
        slot += span
        fill(x0, BOT_Y0, w, ROOM_H, ".")
        door = [x0 + 3, BOT_Y0 - 1]
        g[door[1]][door[0]] = "D"
        seats = []
        if rid == "meeting":
            # 테이블 4칸, 위아래로 의자 4개씩 = 8석(AI 직원 7 + 대표 1)
            ty = BOT_Y0 + 2
            for dx in range(4, 8):
                g[ty][x0 + dx] = "M"
                for sy in (ty - 1, ty + 1):
                    g[sy][x0 + dx] = "c"
                    seats.append([x0 + dx, sy])
            g[BOT_Y0 + ROOM_H - 1][x0 + w - 1] = "B"
            g[BOT_Y0][x0 + w - 1] = "P"
        elif rid == "lounge":
            g[BOT_Y0][x0 + ROOM_W - 1] = "K"
            for dx in range(1, 5):
                g[BOT_Y0 + ROOM_H - 1][x0 + dx] = "S"
            g[BOT_Y0 + ROOM_H - 1][x0] = "P"
        rooms.append({
            "id": rid, "name": name, "dept": None,
            "staff": 0,
            "x": x0, "y": BOT_Y0, "w": w, "h": ROOM_H,
            "doors": [door], "seats": seats,
            "shared_seats": rid == "meeting",
        })

    return ["".join(r) for r in g], rooms


def check(tiles, rooms):
    walk = lambda x, y: 0 <= x < W and 0 <= y < H and LEGEND[tiles[y][x]]["walkable"]
    start = next((x, y) for y, r in enumerate(tiles) for x, c in enumerate(r) if c == "E")
    seen, q = {start}, deque([start])
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) not in seen and walk(nx, ny):
                seen.add((nx, ny))
                q.append((nx, ny))

    errors = []
    # 가장자리는 정문 말고는 전부 벽
    for y in range(H):
        for x in range(W):
            if (x in (0, W - 1) or y in (0, H - 1)) and tiles[y][x] not in "#E":
                errors.append(f"바깥 벽 구멍 ({x},{y})")
    for r in rooms:
        if not r["doors"]:
            errors.append(f"{r['name']}: 문 없음")
        for d in r["doors"]:
            if tuple(d) not in seen:
                errors.append(f"{r['name']}: 문 {d}에 갈 수 없음")
        if not r.get("shared_seats") and len(r["seats"]) != r["staff"]:
            errors.append(f"{r['name']}: 책상 자리 {len(r['seats'])}개, 직원 {r['staff']}명")
        for s in r["seats"]:
            if tuple(s) not in seen:
                errors.append(f"{r['name']}: 자리 {s}에 갈 수 없음")
        for y in range(r["y"], r["y"] + r["h"]):
            for x in range(r["x"], r["x"] + r["w"]):
                if walk(x, y) and (x, y) not in seen:
                    errors.append(f"{r['name']}: 갇힌 칸 ({x},{y})")
    for r in rooms:
        for dx, dy in r["doors"]:
            if tiles[dy][dx] not in "DE":
                errors.append(f"{r['name']}: 문 위치 {dx},{dy}가 문 타일이 아님")
    return errors, start


def main():
    tiles, rooms = build()
    errors, start = check(tiles, rooms)
    out = {
        "name": "THING THAT HIT 사무실",
        "width": W, "height": H, "tile_size_px": 32,
        "origin": "왼쪽 위 (0,0), x는 오른쪽, y는 아래",
        "spawn": list(start),
        "legend": LEGEND,
        "tiles": tiles,
        "rooms": rooms,
    }
    path = Path(__file__).with_name("map.json")
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    template = Path(__file__).with_name("viewer_template.html")
    if template.exists():
        here = Path(__file__).parent
        html = (template.read_text(encoding="utf-8")
                .replace("/*MAP_JSON*/", json.dumps(out, ensure_ascii=False))
                .replace("/*PATHFINDING_JS*/", (here / "pathfinding.js").read_text(encoding="utf-8"))
                .replace("/*SIM_JS*/", (here / "sim.js").read_text(encoding="utf-8")))
        Path(__file__).with_name("index.html").write_text(html, encoding="utf-8")
    print("\n".join(tiles))
    staffed = [r for r in rooms if r["staff"]]
    print(f"\n{W}x{H}, 방 {len(rooms)}개, 책상 자리 {sum(len(r['seats']) for r in staffed)}개 (AI 직원 7 + 대표 1)")
    if errors:
        print("오류:\n" + "\n".join(errors))
        raise SystemExit(1)
    print("검사 통과: 정문에서 모든 문·자리·바닥까지 이동 가능, 바깥 벽 막힘, 자리 수 = 직원 수")


if __name__ == "__main__":
    main()
