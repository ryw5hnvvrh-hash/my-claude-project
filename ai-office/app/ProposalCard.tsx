"use client";

// ✅ 대표 결재 — 기획 1팀이 매일 올리는 TOP 3 (db 문서 office/proposals)
// 우리 계획 + 시장조사팀 키워드 + 대표 의견을 섞어 만든다. 결재·의견은 총괄비서(Claude)에게 보낸다.
import { useState } from "react";
import type { ProposalDoc } from "./real";

type Props = {
  data: ProposalDoc;
  connected: boolean;
  sending: boolean;
  lastError: string;
  send: (text: string, el: Element | null) => Promise<boolean>;
  onApproved?: () => void;
};

const SRC_CLASS: Record<string, string> = { 계획: "p-plan", 키워드: "p-kw", "대표 의견": "p-ceo", 성과: "p-perf" };

export default function ProposalCard({ data, connected, sending, lastError, send, onApproved }: Props) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");
  const done = data.status === "결재 완료" && !!data.chosen;
  const items = data.items ?? [];

  const choose = (rank: number, el: Element) => {
    const it = items.find((x) => x.rank === rank);
    void send(`[결재] 오늘 TOP 3 중 ${rank}번 「${it?.title ?? ""}」으로 할게요.`, el).then((ok) => {
      if (ok) {
        setSent(`${rank}번 결재를 보냈어요. 총괄비서가 대본 단계로 넘겨요.`);
        onApproved?.();
      }
    });
  };
  const sendNote = (el: Element) => {
    const text = note.trim();
    if (!text) return;
    void send(`[TOP 3 의견] ${text}\n→ 이 의견 반영해서 TOP 3 다시 올려줘.`, el).then((ok) => {
      if (ok) {
        setNote("");
        setSent("의견을 보냈어요. 반영한 TOP 3가 이 칸에 다시 올라와요.");
      }
    });
  };

  return (
    <div className="pc">
      <div className="approval-top">
        <span className={`mini-badge ${done ? "mint" : "yellow"}`}>
          {done ? `결재 완료 · ${data.chosen}번` : `오늘 TOP 3 · 결재 대기${data.round && data.round > 1 ? ` (${data.round}차 수정)` : ""}`}
        </span>
        {data.updatedAt ? <small className="pc-time">{data.updatedAt}</small> : null}
      </div>
      {data.basis ? (
        <div className="pc-basis">
          {data.basis.plan ? <span>📅 계획: {data.basis.plan}</span> : null}
          {data.basis.keywords ? <span>🔎 키워드: {data.basis.keywords}</span> : null}
          {data.basis.ceo ? <span>🗣 대표 의견: {data.basis.ceo}</span> : null}
        </div>
      ) : null}
      <ol className="pc-list">
        {items.map((t) => (
          <li key={t.rank} className={done && data.chosen === t.rank ? "chosen" : ""}>
            <div className="pc-head">
              <b>
                {t.rank}위 · {t.title}
              </b>
            </div>
            <div className="pc-tags">
              <span className="pc-tag">{t.format}</span>
              {typeof t.score === "number" ? <span className="pc-tag">{t.score}점</span> : null}
              {(t.source ?? "")
                .split(/[+,·]/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => (
                  <span key={s} className={`pc-tag ${SRC_CLASS[s] ?? ""}`}>
                    {s}
                  </span>
                ))}
            </div>
            {t.why ? <p className="pc-why">{t.why}</p> : null}
            {t.scene ? <p className="pc-scene">🎬 {t.scene}</p> : null}
            {!done ? (
              <button className="btn approve-button" disabled={!connected || sending} onClick={(e) => choose(t.rank, e.currentTarget)}>
                {t.rank}번 결재
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {data.ceoNotes?.length ? (
        <div className="pc-notes">
          <b>반영한 대표 의견</b>
          {data.ceoNotes.slice(-3).map((n, i) => (
            <span key={i}>
              · {n.t ? `${n.t} ` : ""}
              {n.text}
            </span>
          ))}
        </div>
      ) : null}
      {!done ? (
        <div className="pc-opinion">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="의견 남기기 — 예: 2번은 퍼플로, 할로윈 느낌 더 넣어줘"
          />
          <button className="btn" disabled={!connected || sending || !note.trim()} onClick={(e) => sendNote(e.currentTarget)}>
            의견 반영해서 다시 올리기
          </button>
        </div>
      ) : null}
      {!connected ? <p className="pc-msg">claude.ai에서 열어야 결재·의견을 보낼 수 있어요.</p> : null}
      {sent ? <p className="pc-msg ok">{sent}</p> : null}
      {lastError ? <p className="pc-msg">{lastError}</p> : null}
    </div>
  );
}
