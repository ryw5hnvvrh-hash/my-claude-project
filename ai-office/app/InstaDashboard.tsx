"use client";

// 인스타 인사이트 대시보드
// 데이터: 인스타 데이터 담당 세션이 매일 08:50 에 올리는 performance/instagram_<날짜>.json
//        → static/collect-insights.mjs 가 app/insights-data.json 으로 모은다.
// 원칙: 숫자가 없으면 만들지 않고 "–" 로 둔다.
// 매일 보는 숫자: 팔로워·조회·좋아요. 저장률은 일요일 주간보고(performance/<날짜>_weekly_saverate.md)에서 본다.

import { useState } from "react";
import insightsData from "./insights-data.json";

type Post = {
  id: string;
  timestamp: string;
  media_type: string;
  caption: string;
  permalink?: string;
  like_count: number | null;
  comments_count: number | null;
  views: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
};

type Snapshot = {
  date: string;
  fetched_at: string;
  account: { username: string; media_count: number | null; followers_count: number | null; follows_count: number | null };
  posts: Post[];
  errors: string[];
};

const baked = (insightsData as { snapshots: Snapshot[] }).snapshots;

/** 빌드 때 넣은 숫자 + 업무 시작 때 총괄비서가 db(office/insta)에 올린 숫자. 같은 날짜면 db 쪽을 쓴다 */
function mergeSnapshots(live?: Snapshot[] | null): Snapshot[] {
  const byDate = new Map<string, Snapshot>();
  for (const s of baked) byDate.set(s.date, s);
  for (const s of live ?? []) if (s?.date && s.account && Array.isArray(s.posts)) byDate.set(s.date, { ...s, errors: s.errors ?? [] });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type { Snapshot as InstaSnapshot };

const TYPE_LABEL: Record<string, string> = {
  CAROUSEL_ALBUM: "캐러셀",
  VIDEO: "릴스",
  REELS: "릴스",
  IMAGE: "사진",
};

const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("ko-KR"));
const sum = (posts: Post[], key: keyof Post) => {
  const values = posts.map((p) => p[key]).filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
};
/** 게시일은 보는 기기와 상관없이 한국 시간으로 */
const KST_DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  const parts = KST_DATE.formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}`;
};
const label = (p: Post) => `${shortDate(p.timestamp)} ${TYPE_LABEL[p.media_type] ?? p.media_type}`;

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

/** 한 가지 숫자만 보여주는 가로 막대 (두 번째 축 없음) */
function BarChart({
  posts,
  value,
  format,
  setTip,
}: {
  posts: Post[];
  value: (p: Post) => number | null;
  format: (n: number) => string;
  setTip: (t: Tip) => void;
}) {
  const rows = posts.map((p) => ({ p, v: value(p) }));
  const max = Math.max(0, ...rows.map((r) => r.v ?? 0));
  const W = 560;
  const labelW = 110;
  const rowH = 30;
  const barH = 14;
  const H = rows.length * rowH + 8;
  const top = rows.reduce<{ v: number; i: number } | null>(
    (best, r, i) => (r.v != null && r.v > 0 && (!best || r.v > best.v) ? { v: r.v, i } : best),
    null,
  );
  return (
    <svg className="ig-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="게시물별 막대 그래프">
      <line x1={labelW} x2={labelW} y1={0} y2={H - 4} className="ig-axis" />
      {rows.map(({ p, v }, i) => {
        const y = i * rowH + (rowH - barH) / 2;
        const len = max > 0 && v != null && v > 0 ? Math.max(3, ((W - labelW - 70) * v) / max) : 0;
        const show = (e: React.MouseEvent | React.FocusEvent) => {
          const box = (e.currentTarget as Element).closest(".ig-card")?.getBoundingClientRect();
          const r = (e.currentTarget as Element).getBoundingClientRect();
          setTip({
            x: r.left - (box?.left ?? 0) + Math.min(r.width, 200),
            y: r.top - (box?.top ?? 0),
            title: p.caption || label(p),
            lines: [label(p), v == null ? "숫자 없음" : format(v)],
          });
        };
        return (
          <g
            key={p.id}
            tabIndex={0}
            className="ig-row"
            onMouseEnter={show}
            onFocus={show}
            onClick={show}
            onMouseLeave={() => setTip(null)}
            onBlur={() => setTip(null)}
          >
            <rect x={0} y={i * rowH} width={W} height={rowH} className="ig-hit" />
            <text x={labelW - 8} y={y + barH - 2} textAnchor="end" className="ig-label">
              {label(p)}
            </text>
            {v == null ? (
              <text x={labelW + 6} y={y + barH - 2} className="ig-muted">
                –
              </text>
            ) : v === 0 ? (
              <text x={labelW + 6} y={y + barH - 2} className="ig-muted">
                0
              </text>
            ) : (
              <rect x={labelW} y={y} width={len} height={barH} rx={4} className="ig-bar" />
            )}
            {top && top.i === i ? (
              <text x={labelW + len + 6} y={y + barH - 2} className="ig-value">
                {format(top.v)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** 날짜별 팔로워 — 이틀 이상 쌓이면 선으로 */
function FollowerTrend({ setTip, snapshots }: { setTip: (t: Tip) => void; snapshots: Snapshot[] }) {
  const points = snapshots
    .filter((s) => s.account.followers_count != null)
    .map((s) => ({ date: s.date, v: s.account.followers_count as number }));
  if (points.length < 2) {
    return (
      <p className="ig-empty">
        팔로워 추이는 이틀 치 이상 쌓이면 선 그래프로 보여드려요. 지금은 {points.length}일 치예요.
      </p>
    );
  }
  const W = 560;
  const H = 180;
  const pad = { l: 44, r: 16, t: 14, b: 26 };
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const lo = Math.max(0, min - Math.max(2, Math.ceil((max - min) * 0.2)));
  const hi = max + Math.max(2, Math.ceil((max - min) * 0.2));
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / (points.length - 1);
  const y = (v: number) => pad.t + ((H - pad.t - pad.b) * (hi - v)) / (hi - lo);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg className="ig-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="날짜별 팔로워 수">
      {[lo, hi].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="ig-grid" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="ig-muted">
            {t}
          </text>
        </g>
      ))}
      <path d={d} className="ig-line" />
      {points.map((p, i) => (
        <g
          key={p.date}
          tabIndex={0}
          onMouseEnter={() => setTip({ x: x(i), y: y(p.v), title: p.date, lines: [`팔로워 ${fmt(p.v)}`] })}
          onClick={() => setTip({ x: x(i), y: y(p.v), title: p.date, lines: [`팔로워 ${fmt(p.v)}`] })}
          onMouseLeave={() => setTip(null)}
        >
          <circle cx={x(i)} cy={y(p.v)} r={12} className="ig-hit" />
          <circle cx={x(i)} cy={y(p.v)} r={4} className="ig-dot" />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="ig-muted">
            {p.date.slice(5)}
          </text>
        </g>
      ))}
      <text x={x(points.length - 1) - 6} y={y(last.v) - 10} textAnchor="end" className="ig-value">
        {fmt(last.v)}
      </text>
    </svg>
  );
}

/** 차트 한 장 — 툴팁은 카드마다 따로 */
function ChartCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: (setTip: (t: Tip) => void) => React.ReactNode;
}) {
  const [tip, setTip] = useState<Tip>(null);
  return (
    <section className="win ig-card">
      <div className="win-bar">
        <span>{title}</span>
      </div>
      <div className="win-body">
        {children(setTip)}
        {note ? <p className="ig-note">{note}</p> : null}
      </div>
      {tip ? <Tooltip tip={tip} /> : null}
    </section>
  );
}

export default function InstaDashboard({ live }: { live?: Snapshot[] | null }) {
  const snapshots = mergeSnapshots(live);
  const latest = snapshots[snapshots.length - 1];

  if (!latest) {
    return (
      <section className="win ig-dash">
        <div className="win-bar">
          <span>📸 insta.insights</span>
        </div>
        <div className="win-body ig-empty-state">
          <h2>인스타 숫자가 아직 없어요</h2>
          <p>
            매일 아침 8시 50분에 인스타 데이터 담당이 최근 게시물 10개의 숫자를 가져오면, 9시 아침 업무 때 이 화면이
            채워져요.
          </p>
        </div>
      </section>
    );
  }

  const posts = latest.posts;
  const totalViews = sum(posts, "views");
  const totalLikes = sum(posts, "like_count");
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const followerDelta =
    prev && latest.account.followers_count != null && prev.account.followers_count != null
      ? latest.account.followers_count - prev.account.followers_count
      : null;

  return (
    <div className="ig-dash">
      <section className="win">
        <div className="win-bar">
          <span>📸 insta.insights — @{latest.account.username}</span>
        </div>
        <div className="win-body">
          <p className="ig-meta">
            최근 게시물 {posts.length}개 기준 · 가져온 시각 {latest.fetched_at.replace("T", " ").slice(0, 16)} · 성과 리뷰실
            김희선
          </p>
          {latest.errors.length ? (
            <p className="ig-warn" role="status">
              ⚠️ 일부 숫자를 못 가져왔어요: {latest.errors.join(" / ")}
            </p>
          ) : null}
          <div className="ig-tiles">
            <div className="ig-tile">
              <span>팔로워</span>
              <b>{fmt(latest.account.followers_count)}</b>
              <small>
                {followerDelta == null ? "전날 비교는 내일부터" : `전날보다 ${followerDelta >= 0 ? "+" : ""}${followerDelta}`}
              </small>
            </div>
            <div className="ig-tile">
              <span>조회 합계</span>
              <b>{fmt(totalViews)}</b>
              <small>최근 {posts.length}개</small>
            </div>
            <div className="ig-tile">
              <span>좋아요 합계</span>
              <b>{fmt(totalLikes)}</b>
              <small>최근 {posts.length}개</small>
            </div>
          </div>
        </div>
      </section>

      <div className="ig-grid2">
        <ChartCard title="👀 게시물별 조회" note="막대를 누르면 숫자가 보여요. 가장 높은 게시물만 숫자를 표시했어요.">
          {(setTip) => <BarChart posts={posts} value={(p) => p.views} format={(n) => `조회 ${fmt(n)}`} setTip={setTip} />}
        </ChartCard>
        <ChartCard title="❤️ 게시물별 좋아요" note="막대를 누르면 숫자가 보여요. 저장률은 일요일 주간보고에서 따로 봐요.">
          {(setTip) => <BarChart posts={posts} value={(p) => p.like_count} format={(n) => `좋아요 ${fmt(n)}`} setTip={setTip} />}
        </ChartCard>
      </div>

      <ChartCard title="📈 팔로워 추이">{(setTip) => <FollowerTrend setTip={setTip} snapshots={snapshots} />}</ChartCard>

      <section className="win">
        <div className="win-bar">
          <span>🗂️ 게시물 표</span>
        </div>
        <div className="win-body">
          <div className="ig-table-wrap">
            <table className="ig-table">
              <thead>
                <tr>
                  <th>게시일</th>
                  <th>형식</th>
                  <th>캡션</th>
                  <th>조회</th>
                  <th>좋아요</th>
                  <th>댓글</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td>{shortDate(p.timestamp)}</td>
                    <td>{TYPE_LABEL[p.media_type] ?? p.media_type}</td>
                    <td className="ig-cap">
                      {p.permalink ? (
                        <a href={p.permalink} target="_blank" rel="noreferrer">
                          {p.caption || "(캡션 없음)"}
                        </a>
                      ) : (
                        p.caption || "(캡션 없음)"
                      )}
                    </td>
                    <td>{fmt(p.views)}</td>
                    <td>{fmt(p.like_count)}</td>
                    <td>{fmt(p.comments_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Tooltip({ tip }: { tip: NonNullable<Tip> }) {
  return (
    <div className="ig-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <b>{tip.title.slice(0, 40)}</b>
      {tip.lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  );
}
