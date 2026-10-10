"use client";

// 🔎 시장조사팀 — 매일 아침 "요새 떠오르는 키워드" 보고 (db 문서 office/research)
// 오늘 날짜 보고가 없으면 지어내지 않고 "아직 없어요"라고만 보여 준다.
import type { ResearchDoc } from "./real";

type Props = { data: ResearchDoc | null; today: string; leadName: string; compact?: boolean };

export default function ResearchCard({ data, today, leadName, compact }: Props) {
  const fresh = !!data?.date && data.date === today;
  const list = fresh ? (data?.keywords ?? []) : [];
  return (
    <section className={`win rk${compact ? " compact" : ""}`} aria-label="오늘의 키워드">
      <div className="win-bar">
        <span>🔎 research.keywords — 시장조사팀 {leadName} · 오늘 떠오르는 키워드</span>
        {fresh && data?.updatedAt ? <small className="rk-time">{data.updatedAt}</small> : null}
      </div>
      <div className="win-body">
        {!fresh ? (
          <p className="rk-empty">
            오늘 키워드 보고가 아직 없어요.
            {data?.date ? ` (마지막 보고: ${data.date})` : ""} 매일 아침 8시 40분에 올라와요.
          </p>
        ) : (
          <>
            {data?.summary ? <p className="rk-summary">{data.summary}</p> : null}
            <ol className="rk-list">
              {list.map((k, i) => (
                <li key={`${k.word}-${i}`}>
                  <div className="rk-head">
                    <b>{k.word}</b>
                    {k.trend ? <span className={`rk-trend t-${k.trend}`}>{k.trend}</span> : null}
                  </div>
                  {k.why ? <p className="rk-why">{k.why}</p> : null}
                  {!compact && k.use ? <p className="rk-use">💡 {k.use}</p> : null}
                  {!compact && k.source ? (
                    <p className="rk-src">
                      출처:{" "}
                      {k.url ? (
                        <a href={k.url} target="_blank" rel="noreferrer">
                          {k.source}
                        </a>
                      ) : (
                        k.source
                      )}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            {data?.pick ? <p className="rk-pick">⭐ 오늘 써볼 만한 것: {data.pick}</p> : null}
            {data?.note ? <p className="rk-note">{data.note}</p> : null}
          </>
        )}
      </div>
    </section>
  );
}
