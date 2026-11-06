"use client";

// 업무 보고 대시보드
// 데이터: 총괄비서가 업무가 끝날 때와 다음 날 업무 시작 때 db 문서 office/report 에 쓴다.
// 노션 📰 일일 업무 보고서와 같은 내용을 한 화면에 보여주고, 원문은 노션 링크로 연다.

export type ReportSection = { title: string; items: string[] };
export type ReportTodo = { text: string; done?: boolean };
export type DailyReport = {
  date: string;
  title: string;
  url?: string;
  summary?: string;
  posted?: string;
  decisions?: string;
  metrics?: { label: string; value: string; note?: string }[];
  sections?: ReportSection[];
  todos?: ReportTodo[];
  checked?: boolean;
};
export type ReportDoc = { updatedAt?: string; latest?: DailyReport; history?: DailyReport[] };

export default function ReportBoard({ data }: { data: ReportDoc | null }) {
  const latest = data?.latest;
  if (!latest) {
    return (
      <section className="win report-board">
        <div className="win-bar">
          <span>📰 daily.report</span>
        </div>
        <div className="win-body ig-empty-state">
          <h2>아직 올라온 업무 보고가 없어요</h2>
          <p>업무가 끝나면 총괄비서가 노션 보고서와 함께 여기에도 올려요. 다음 날 업무 시작 때 전날 보고서로 다시 맞춰요.</p>
        </div>
      </section>
    );
  }

  const history = (data?.history ?? []).filter((h) => h.date !== latest.date).slice(0, 7);

  return (
    <div className="report-board">
      <section className="win">
        <div className="win-bar">
          <span>📰 daily.report — {latest.date}</span>
          <span className="window-controls">—　▢　✕</span>
        </div>
        <div className="win-body">
          <div className="report-head">
            <div>
              <p className="ig-meta">
                {data?.updatedAt ? `${data.updatedAt} 업데이트 · ` : ""}
                {latest.checked ? "✅ 대표 확인 완료" : "대표 확인 전"}
              </p>
              <h2>{latest.title}</h2>
              {latest.summary ? <p className="report-summary">{latest.summary}</p> : null}
            </div>
            {latest.url ? (
              <a className="btn btn-primary report-link" href={latest.url} target="_blank" rel="noreferrer">
                노션에서 원문 보기
              </a>
            ) : null}
          </div>

          <div className="report-pair">
            {latest.posted ? (
              <article className="report-callout pink">
                <b>✨ 오늘 게시</b>
                <p>{latest.posted}</p>
              </article>
            ) : null}
            {latest.decisions ? (
              <article className="report-callout yellow">
                <b>🙋 대표 결정 필요</b>
                <p>{latest.decisions}</p>
              </article>
            ) : null}
          </div>

          {latest.metrics?.length ? (
            <div className="ig-tiles report-tiles">
              {latest.metrics.map((m) => (
                <div className="ig-tile" key={m.label}>
                  <span>{m.label}</span>
                  <b>{m.value}</b>
                  {m.note ? <small>{m.note}</small> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="report-sections">
            {(latest.sections ?? []).map((s) => (
              <article className="report-section" key={s.title}>
                <h3>{s.title}</h3>
                <ul>
                  {s.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {latest.todos?.length ? (
            <article className="report-section todo">
              <h3>내일 할 일 · 대표 확인</h3>
              <ul className="report-todos">
                {latest.todos.map((t, i) => (
                  <li key={i} className={t.done ? "done" : ""}>
                    <span aria-hidden="true">{t.done ? "☑" : "☐"}</span> {t.text}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      </section>

      {history.length ? (
        <section className="win">
          <div className="win-bar">
            <span>🗂️ 지난 보고서</span>
          </div>
          <div className="win-body">
            <ul className="report-history">
              {history.map((h) => (
                <li key={h.date}>
                  <b>{h.date}</b>
                  <span>{h.summary ?? h.title}</span>
                  {h.url ? (
                    <a href={h.url} target="_blank" rel="noreferrer">
                      노션 ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
