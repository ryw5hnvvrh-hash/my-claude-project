# 인스타그램 API 연결 시험

- 시험 시각: 2026-09-29 19:57 UTC (2026-09-30 04:57 KST)
- API: Instagram Graph API `graph.instagram.com/v21.0`
- 토큰 (`INSTAGRAM_ACCESS_TOKEN`): **있음** (길이 181자, 값은 기록하지 않음)
- 결론: **연결 성공** — 3가지 호출 모두 HTTP 200

## 1. 계정 정보 (`/me`) — HTTP 200

| 항목 | 값 |
|---|---|
| username | thth_lll |
| account_type | BUSINESS |
| media_count (게시물 수) | 20 |
| user_id | 17841476907505174 |

## 2. 최근 게시물 3개 (`/me/media?limit=3`) — HTTP 200

| # | 날짜 (UTC) | 유형 | 좋아요 | 댓글 | 캡션 앞부분 |
|---|---|---|---|---|---|
| 1 | 2026-09-29 16:47 | CAROUSEL_ALBUM | 2 | 0 | 오늘 옷 색에 맞춘 그립톡 |
| 2 | 2026-09-28 12:10 | VIDEO | 8 | 1 | 추석 다들 잘 보내셨나요? |
| 3 | 2026-09-17 12:33 | VIDEO | 13 | 0 | 고민상담&포장영상 [ASMR] |

다음 페이지(`paging.next`)도 응답에 포함됨 → 나머지 게시물도 이어서 불러올 수 있음.

## 3. 인사이트 (첫 게시물 `18265922872305982`) — HTTP 200

`metric=views,reach,saved,shares,likes,comments` 가 오류 없이 모두 지원됨 (기간: lifetime).

| metric | 값 |
|---|---|
| views (조회) | 18 |
| reach (도달 계정) | 5 |
| saved (저장) | 0 |
| shares (공유) | 0 |
| likes (좋아요) | 2 |
| comments (댓글) | 0 |

확인용으로 `metric=saved,reach` 만으로도 한 번 더 호출 → HTTP 200, saved 0 / reach 5 (위와 동일).

## 참고

- 응답 본문에 토큰 값은 포함되지 않았음 (`paging.next` URL 은 이 문서에 옮기지 않음).
