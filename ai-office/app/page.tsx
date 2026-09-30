"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealOffice, type RealOffice } from "./real";
import OfficeWorld from "./game/OfficeWorld";
import InstaDashboard from "./InstaDashboard";
import {
  buildReport,
  fetchIntegrations,
  publish,
  type IntegrationStatus,
  type PublishResult,
} from "./game/report";
import { Company, PHASES, type Agent, type DeptStatus, type Snapshot } from "./game/sim";
import { CEO, DEPT_BRIEF, DEPT_LEAD, STAFF } from "./game/staff";
import { DEPT_ROOMS } from "./game/world";
import { COMPANY, SAMPLE_PROPOSAL, STORAGE_LINK } from "../company.config";

type View = "live" | "dashboard" | "insta";

/** 서버 없이 여는 한 장짜리 버전(static/main.tsx)인지 — 이때는 보고 발행 서버가 없다 */
const isServerless = () =>
  typeof window !== "undefined" && (window as { __AI_OFFICE_SERVERLESS__?: boolean }).__AI_OFFICE_SERVERLESS__ === true;
const SERVERLESS_NOTE = "이 페이지는 서버 없이 여는 버전이라 보고 발행(Notion·Discord)은 안 돼요. 컴퓨터에서 npm run dev로 실행하면 쓸 수 있어요.";

const statusClass: Record<DeptStatus, string> = {
  "완료": "done",
  "진행 중": "working",
  "승인 대기": "approval",
  "연동 대기": "blocked",
  "대기": "waiting",
};

/** 링크만 걸려 있는 항목 (서버 연동과 무관) */
const integrations2Static = STORAGE_LINK
  ? [{ name: "결과물 보관함", status: "링크 연결", tone: "mint", href: STORAGE_LINK }]
  : [];

function PixelEmployee({ hair, shirt, accent }: { hair: string; shirt: string; accent: string }) {
  const style = {
    "--pixel-hair": hair,
    "--pixel-shirt": shirt,
    "--pixel-accent": accent,
  } as CSSProperties;
  return (
    <span className="pixel-employee" style={style} aria-hidden="true">
      <i className="pixel-shadow" />
      <i className="pixel-legs" />
      <i className="pixel-body" />
      <i className="pixel-arm left" />
      <i className="pixel-arm right" />
      <i className="pixel-face">
        <b className="pixel-eyes" />
      </i>
      <i className="pixel-hair" />
      <i className="pixel-headset" />
    </span>
  );
}

export default function Home() {
  const [engine] = useState(() => new Company());
  const [snap, setSnap] = useState<Snapshot>(() => engine.snapshot());
  const [view, setView] = useState<View>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [briefing, setBriefing] = useState(false);
  const [filter, setFilter] = useState<"전체" | DeptStatus>("전체");
  const [toast, setToast] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [publishState, setPublishState] = useState<{ busy: boolean; result: PublishResult | null; error: string }>({
    busy: false,
    result: null,
    error: "",
  });
  const publishedRef = useRef(false);
  const real = useRealOffice();

  // 실제 업무 연결 중이면 화면은 Claude가 도달한 단계까지만 진행한다
  const realPhase = real.doc?.phase ?? null;
  useEffect(() => {
    if (engine.realMode && realPhase !== null) engine.setRealGate(realPhase);
  }, [engine, realPhase]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.tick(dt);
      acc += dt;
      if (acc >= 0.18) {
        acc = 0;
        setSnap(engine.snapshot());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  useEffect(() => {
    engine.setBriefingHandler(() => setBriefing(true));
    return () => engine.setBriefingHandler(null);
  }, [engine]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const onSelect = useCallback((agent: Agent) => setSelectedId(agent.id), []);

  // 연동 설정 여부를 서버에서 받아온다 (값이 아니라 설정 여부만)
  useEffect(() => {
    if (isServerless()) return;
    fetchIntegrations()
      .then(setIntegrations)
      .catch(() => setIntegrations(null));
  }, []);

  const sendReport = useCallback(
    async (auto: boolean) => {
      if (isServerless()) {
        engine.pushLog("📴", `보고 발행 건너뜀 — ${SERVERLESS_NOTE}`, "lav");
        if (!auto) showToast("이 페이지에서는 보고 발행이 안 돼요");
        return;
      }
      setPublishState((state) => ({ ...state, busy: true, error: "" }));
      try {
        const result = await publish(buildReport(engine.snapshot()));
        setPublishState({ busy: false, result, error: "" });

        const parts: string[] = [];
        parts.push(result.notion.ok ? "Notion 저장 완료" : `Notion ${result.notion.detail ?? "실패"}`);
        parts.push(result.discord.ok ? "Discord 전송 완료" : `Discord ${result.discord.detail ?? "실패"}`);
        engine.pushLog(
          result.notion.ok && result.discord.ok ? "📤" : "⚠️",
          `완료 보고 발행 — ${parts.join(" / ")}`,
          result.notion.ok && result.discord.ok ? "mint" : "lav",
        );
        engine.pushChat("staff", DEPT_LEAD.secretary.name, `보고서 발행 결과입니다.\n· ${parts.join("\n· ")}`);
        if (!auto) showToast(result.notion.ok || result.discord.ok ? "보고서를 발행했어요" : "발행 실패 — 연동 설정 필요");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPublishState({ busy: false, result: null, error: message });
        engine.pushLog("⚠️", `완료 보고 발행 실패 — ${message}`, "lav");
        if (!auto) showToast("발행 실패 — 연동 설정을 확인해주세요");
      }
    },
    [engine, showToast],
  );

  // 하루가 끝나면 자동으로 한 번 발행한다
  useEffect(() => {
    if (snap.dayComplete && !publishedRef.current) {
      publishedRef.current = true;
      void sendReport(true);
    }
    if (!snap.dayComplete && snap.running) publishedRef.current = false;
  }, [snap.dayComplete, snap.running, sendReport]);

  const askAgent = useCallback(
    (agent: Agent) => {
      engine.command(`${agent.name} 지금 뭐해?`);
      setSelectedId(null);
      window.setTimeout(
        () => document.getElementById("ceo-console")?.scrollIntoView({ behavior: "smooth", block: "center" }),
        60,
      );
    },
    [engine],
  );

  const start = (el?: Element | null) => {
    engine.start();
    setBriefing(false);
    setView("live");
    if (real.connected) {
      // 실제 업무: Claude에게 "업무 시작"을 보내고, 화면은 실제 진행 단계에 맞춰 움직인다
      engine.setRealGate(real.doc?.phase ?? 1);
      void real.send("업무 시작", el ?? null).then((ok) =>
        showToast(ok ? "Claude에게 업무 시작을 보냈어요 — 실제 업무가 시작돼요" : "Claude에게 보내지 못했어요 — 시뮬레이션만 돌아요"),
      );
      if (!real.doc) engine.pushLog("🧠", "실제 업무 모드 — Claude가 시작하면 단계가 차례로 열려요", "yellow");
      return;
    }
    showToast(`07:00 — AI 직원 ${STAFF.length}명이 출근합니다 ✨`);
  };

  const approve = () => {
    engine.approve();
    showToast("승인 완료! 제작팀이 바로 움직여요");
  };

  const teams = useMemo(
    () =>
      DEPT_ROOMS.map((room) => {
        const lead = DEPT_LEAD[room.id];
        const status = snap.deptStatus[room.id] ?? "대기";
        return {
          id: room.id,
          icon: room.icon,
          name: room.name,
          room: room.short,
          lead,
          status,
          ...DEPT_BRIEF[room.id],
        };
      }),
    [snap.deptStatus],
  );

  const filteredTeams = filter === "전체" ? teams : teams.filter((team) => team.status === filter);
  const selected = selectedId ? engine.agentById.get(selectedId) ?? null : null;
  const todo = snap.approvalPending ? 1 : 0;
  const onDuty = engine.agents.filter((a) => a.status !== "출근 전").length;

  return (
    <main className="page-shell">
      <div className="wrap">
        <nav className="app-nav" aria-label="AI Company 화면 전환">
          <div className="brand-chip">
            <span>{COMPANY.logoLetter}</span>
            <b>{COMPANY.name}</b>
          </div>
          <div className="nav-tabs">
            <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}>
              🎮 라이브 오피스
            </button>
            <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
              📊 대시보드
            </button>
            <button className={view === "insta" ? "active" : ""} onClick={() => setView("insta")}>
              📸 인스타
            </button>
            <button
              className={`todo-tab ${todo ? "urgent" : ""}`}
              onClick={() => {
                setView("live");
                window.setTimeout(
                  () => document.getElementById("ceo-approval")?.scrollIntoView({ behavior: "smooth", block: "center" }),
                  60,
                );
              }}
            >
              📋 대표 할 일 <i>{todo}</i>
            </button>
          </div>
        </nav>

        {view === "live" ? (
          <LiveView
            engine={engine}
            snap={snap}
            follow={follow}
            setFollow={setFollow}
            selectedId={selectedId}
            onSelect={onSelect}
            onStart={start}
            real={real}
            onApprove={approve}
            onDuty={onDuty}
            onPublish={() => void sendReport(false)}
            publishBusy={publishState.busy}
            publishResult={publishState.result}
          />
        ) : view === "insta" ? (
          <InstaDashboard />
        ) : (
          <DashboardView
            teams={teams}
            filteredTeams={filteredTeams}
            filter={filter}
            setFilter={setFilter}
            snap={snap}
            onStart={() => start()}
            onApprove={approve}
            onSelect={(id) => setSelectedId(id)}
            integrations={integrations}
            publishResult={publishState.result}
          />
        )}

        <footer>
          {COMPANY.name} · 대표 {CEO.name}
          {COMPANY.instagram ? (
            <>
              <br />
              <a href={`https://www.instagram.com/${COMPANY.instagram}/`} target="_blank" rel="noreferrer">
                📷 @{COMPANY.instagram}
              </a>
            </>
          ) : null}
          <br />© {CEO.name}
        </footer>
      </div>

      {selected ? (
        <ProfileModal
          agent={selected}
          onClose={() => setSelectedId(null)}
          onAsk={(agent) => {
            setView("live");
            askAgent(agent);
          }}
        />
      ) : null}
      {briefing ? <BriefingModal snap={snap} onClose={() => setBriefing(false)} /> : null}
      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}

function LiveView({
  engine,
  snap,
  follow,
  setFollow,
  selectedId,
  onSelect,
  onStart,
  onApprove,
  onDuty,
  onPublish,
  publishBusy,
  publishResult,
  real,
}: {
  real: RealOffice;
  engine: Company;
  snap: Snapshot;
  follow: boolean;
  setFollow: (value: boolean) => void;
  selectedId: string | null;
  onSelect: (agent: Agent) => void;
  onStart: (el?: Element | null) => void;
  onApprove: () => void;
  onDuty: number;
  onPublish: () => void;
  publishBusy: boolean;
  publishResult: PublishResult | null;
}) {
  const progress = Math.round((snap.phaseIndex / (PHASES.length - 1)) * 100);

  return (
    <>
      <header className="live-hero">
        <div>
          <p className="eyebrow">LIVE OFFICE · {STAFF.length} AI STAFF · REAL-TIME</p>
          <h1>
            {COMPANY.titlePrefix} <em className="highlight">{COMPANY.titleAccent}</em>
          </h1>
          <p>출근하고, 자리에서 일하고, 회의실에 모여 회의하고, 대표실로 보고하러 갑니다.</p>
        </div>
        <div className="live-clock">
          <span>SEOUL</span>
          <b>{snap.clock}</b>
          <small>{snap.phase}</small>
        </div>
      </header>

      <section className="live-bar">
        <button className="btn btn-primary" onClick={(e) => onStart(e.currentTarget)} disabled={snap.running || real.sending}>
          {snap.running ? "직원들이 일하는 중…" : snap.dayComplete ? "다시 출근시키기" : real.connected ? "오늘 업무 시작하기 · 실제" : "오늘 업무 시작하기"}
        </button>
        <button className="btn btn-ghost" onClick={() => engine.togglePause()}>
          {snap.paused ? "▶ 재생" : "⏸ 일시정지"}
        </button>
        <div className="speed-wrap">
          <span className="speed-label" title="시뮬레이션 전체(걷기·업무·대사)가 함께 빨라져요. 실제 외부 작업 속도와는 무관합니다.">
            재생 속도
          </span>
          <div className="speed-group" role="group" aria-label="재생 속도">
            {[1, 2, 4].map((value) => (
              <button
                key={value}
                className={!snap.turbo && snap.speed === value ? "on" : ""}
                onClick={() => engine.setSpeed(value)}
                title={value === 1 ? "말풍선 읽기·화면녹화용" : value === 4 ? "결과만 빠르게" : "기본"}
              >
                {value}x
              </button>
            ))}
            <button
              className={`skip ${snap.turbo ? "on" : ""}`}
              onClick={() => engine.skipToDecision()}
              disabled={!snap.running || snap.approvalPending || snap.opinionPending}
              title="대표님이 결정할 일이 생길 때까지 단숨에 건너뜁니다"
            >
              {snap.turbo ? "건너뛰는 중…" : "⏭ 결정까지"}
            </button>
          </div>
        </div>
        <button className={`btn btn-ghost ${follow ? "on" : ""}`} onClick={() => setFollow(!follow)}>
          🎥 자동 추적 {follow ? "ON" : "OFF"}
        </button>
        <button
          className={`btn btn-ghost publish-btn ${publishResult?.notion.ok || publishResult?.discord.ok ? "sent" : ""}`}
          onClick={onPublish}
          disabled={publishBusy}
          title="완료 보고를 Notion에 저장하고 같은 내용을 Discord로 보냅니다"
        >
          {publishBusy ? "발행 중…" : "📤 보고 발행"}
        </button>
        <div className="live-progress">
          <span>
            {snap.phase} · {progress}%
          </span>
          <i>
            <b style={{ width: `${progress}%` }} />
          </i>
        </div>
        <div className="live-counts">
          <span className="lc on-duty">근무 {onDuty}</span>
          <span className="lc done">완료 {snap.stats.done}</span>
          <span className="lc working">진행 {snap.stats.working}</span>
          <span className="lc blocked">연동대기 {snap.stats.blocked}</span>
        </div>
      </section>

      <section className="live-grid">
        <OfficeWorld engine={engine} snap={snap} selectedId={selectedId} follow={follow} onSelect={onSelect} />

        <aside className="live-rail">
          <RealPanel real={real} snap={snap} />
          <CeoConsole engine={engine} snap={snap} real={real} />

          <section className="win rail-card" id="ceo-approval">
            <div className="win-bar">
              <span>✅ ceo.approval</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className={`win-body approval-body ${snap.approvalPending ? "pending" : ""}`}>
              {snap.realMode && real.doc?.top3?.length ? (
                <RealTop3 real={real} />
              ) : snap.approvalPending ? (
                <>
                  <div className="approval-top">
                    <span className="mini-badge yellow">TOP 1 제안 · {SAMPLE_PROPOSAL.score}</span>
                    <span className="score blink">결재 대기</span>
                  </div>
                  <h3>{SAMPLE_PROPOSAL.title}</h3>
                  <p>회의실에서 {["research", "strategy1", "qa"].map((d) => DEPT_LEAD[d]?.name).join("·")}이(가) 대표님을 기다리고 있어요.</p>
                  <div className="reason-list">
                    {SAMPLE_PROPOSAL.points.map((point, i) => (
                      <span key={point}>{"①②③④⑤"[i]} {point}</span>
                    ))}
                  </div>
                  <button className="btn approve-button" onClick={onApprove}>
                    이 콘텐츠 승인하기
                  </button>
                </>
              ) : (
                <>
                  <div className="approval-top">
                    <span className="mini-badge mint">{snap.approved ? "오늘 결재 완료" : "결재 대기 없음"}</span>
                  </div>
                  <h3>{snap.approved ? "승인하신 안으로 제작 중이에요" : "아직 올라온 안건이 없어요"}</h3>
                  <p>
                    {snap.approved
                      ? "대표 승인 이후 원고 → 제작 → 보관까지 이어집니다."
                      : "업무를 시작하면 기획 1팀이 TOP 3를 회의실로 올려요."}
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="win rail-card feed-card">
            <div className="win-bar">
              <span>📡 live.feed</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body feed-body">
              {snap.meetingTitle ? <div className="feed-now">💬 회의 진행 중 — {snap.meetingTitle}</div> : null}
              <ul className="feed-list">
                {snap.log.map((entry) => (
                  <li key={entry.id} className={entry.tone}>
                    <b>{entry.time}</b>
                    <i>{entry.icon}</i>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="win rail-card">
            <div className="win-bar">
              <span>👥 staff.roster</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body roster-body">
              {DEPT_ROOMS.map((room) => (
                <div className="roster-dept" key={room.id}>
                  <p>
                    <b>
                      {room.icon} {room.name}
                    </b>
                    <i className={`rm-dot ${statusClass[snap.deptStatus[room.id] ?? "대기"]}`} />
                  </p>
                  <div className="roster-chips">
                    {STAFF.filter((s) => s.deptId === room.id).map((seed) => {
                      const agent = engine.agentById.get(seed.id);
                      return (
                        <button
                          key={seed.id}
                          className={`roster-chip ${selectedId === seed.id ? "on" : ""}`}
                          onClick={() => agent && onSelect(agent)}
                        >
                          <i style={{ background: seed.shirt, borderColor: seed.hair }} />
                          {seed.name}
                          <small>{agent?.status ?? "출근 전"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}

const QUICK_ORDERS = [
  { label: "현황 보고", command: "현황 보고해줘" },
  { label: "왜 늦어져?", command: "왜 늦어지고 있어?" },
  { label: "회의 소집", command: "전 부서 회의 소집" },
  { label: "지금 브리핑", command: "지금 브리핑 올라와" },
  { label: "집중 모드", command: "집중 모드" },
  { label: "속도 올려", command: "속도 좀 올려줘" },
  { label: "순찰 돌기", command: "순찰 돌아볼게요" },
  { label: "다솜님 반영", command: "다솜님 반영해줘" },
];

function CeoConsole({ engine, snap, real }: { engine: Company; snap: Snapshot; real: RealOffice }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ id: number; text: string }[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const realChat = real.doc?.chat ?? [];
  const opinionAsk = snap.opinionPending || real.doc?.waiting === "opinion";
  const logRef = useRef<HTMLDivElement>(null);
  const count = snap.chat.length + realChat.length + pending.length;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setDraft("");
    if (snap.realMode) {
      // 실제 업무 중: 지시·의견은 Claude에게 간다 (화면 속 대본 답변 대신 실제 답)
      const id = Date.now();
      setPending((list) => [...list, { id, text: value }]);
      void real.send(value, formRef.current).then((ok) => {
        if (!ok) setPending((list) => list.filter((p) => p.id !== id));
      });
      return;
    }
    engine.command(value);
  };

  // Claude가 받은 말은 대기 줄에서 지운다
  useEffect(() => {
    if (!pending.length) return;
    const got = new Set(realChat.filter((c) => c.from === "ceo").map((c) => c.text));
    setPending((list) => list.filter((p) => !got.has(p.text)));
  }, [realChat.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="win rail-card console-card" id="ceo-console">
      <div className="win-bar">
        <span>🎤 ceo.console — 대표 지시창</span>
        <span className="window-controls">—　▢　✕</span>
      </div>
      <div className="win-body console-body">
        <div className="console-status">
          <span className={`mini-badge ${snap.focusMode ? "yellow" : "mint"}`}>
            {snap.focusMode ? "집중 모드 ON" : "평시 운영"}
          </span>
          {snap.busyWithOrder ? <span className="mini-badge lav">지시 처리 중…</span> : null}
        </div>

        <div className="console-log" ref={logRef}>
          {snap.realMode
            ? realChat.map((entry, i) => (
                <div key={`r${i}`} className={`console-line ${entry.from}`}>
                  <b>{entry.from === "ceo" ? "대표님" : entry.name}</b>
                  <p>{entry.text}</p>
                  <small>{entry.t}</small>
                </div>
              ))
            : snap.chat.map((entry) => (
                <div key={entry.id} className={`console-line ${entry.from}`}>
                  <b>{entry.from === "ceo" ? "대표님" : entry.name}</b>
                  <p>{entry.text}</p>
                  <small>{entry.time}</small>
                </div>
              ))}
          {snap.realMode
            ? pending.map((p) => (
                <div key={p.id} className="console-line ceo">
                  <b>대표님</b>
                  <p>{p.text}</p>
                  <small>Claude에게 전달 중…</small>
                </div>
              ))
            : null}
        </div>
        {snap.realMode && real.lastError ? <p className="real-error">{real.lastError}</p> : null}

        {opinionAsk ? (
          <div className="opinion-call">
            <b>🎤 대표 의견 시간 — {snap.meetingTitle ?? "전체 성과 회의"}</b>
            <span>아래 칸에 의견을 적어 ‘의견’을 누르면 회의에 반영돼요.</span>
            <button onClick={() => send("의견 없음")}>의견 없음 · 계속 진행</button>
          </div>
        ) : null}

        <div className="console-quick">
          {QUICK_ORDERS.map((item) => (
            <button key={item.label} onClick={() => send(item.command)}>
              {item.label}
            </button>
          ))}
        </div>

        <form
          ref={formRef}
          className="console-input"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={opinionAsk ? "예: 오늘은 키링 위주로 가요 / 포장 장면 더 살려줘" : "예: 다솜님 반영해줘 / 기획 2팀 둘러봐"}
            aria-label={opinionAsk ? "대표 의견 입력" : "대표 지시 입력"}
          />
          <button type="submit" disabled={real.sending}>{opinionAsk ? "의견" : "지시"}</button>
        </form>
      </div>
    </section>
  );
}

const WAIT_TEXT: Record<string, string> = {
  opinion: "성과 회의 — 대표님 의견을 기다려요",
  top3: "TOP 3 — 대표님 선택을 기다려요",
  script: "대본·후킹 — 대표님 확정을 기다려요",
};

/** 실제 업무 현황 — Claude가 office/today 에 적은 그대로 보여준다 */
function RealPanel({ real, snap }: { real: RealOffice; snap: Snapshot }) {
  const doc = real.doc;
  const link =
    real.sendState === "available"
      ? { tone: "mint", text: "Claude 연결됨" }
      : real.sendState === "unknown"
        ? { tone: "lav", text: "연결 확인 중…" }
        : real.sendState === "no_session"
          ? { tone: "lav", text: "Claude 대화 창이 연결 안 됨" }
          : real.sendState === "writers_only"
            ? { tone: "lav", text: "편집 권한이 있어야 보낼 수 있어요" }
            : { tone: "lav", text: "claude.ai에서 열어야 연결돼요 · 지금은 시뮬레이션만" };
  const state = doc?.status === "waiting" ? "yellow" : doc?.status === "working" ? "pink" : "mint";
  return (
    <section className="win rail-card real-card">
      <div className="win-bar">
        <span>🧠 real.work — 실제 업무 · Claude</span>
        <span className="window-controls">—　▢　✕</span>
      </div>
      <div className="win-body real-body">
        <div className="console-status">
          <span className={`mini-badge ${link.tone}`}>{link.text}</span>
          {doc ? (
            <span className={`mini-badge ${state}`}>
              {doc.status === "waiting" ? "대표님 확인 필요" : doc.status === "working" ? "Claude 작업 중" : "대기"}
            </span>
          ) : null}
        </div>
        {doc ? (
          <>
            <p className="real-step">
              <b>{doc.waiting ? WAIT_TEXT[doc.waiting] ?? doc.step : doc.step}</b>
              {doc.updatedAt ? <small>{doc.updatedAt} 갱신</small> : null}
            </p>
            {doc.meeting ? (
              <div className="real-meeting">
                {doc.meeting.followers ? <span>👥 팔로워 {doc.meeting.followers}</span> : null}
                {(doc.meeting.lines ?? []).map((line) => (
                  <span key={line}>· {line}</span>
                ))}
                {doc.meeting.repeat ? <span>🔁 반복할 점: {doc.meeting.repeat}</span> : null}
                {doc.meeting.change ? <span>🛠 바꿀 점: {doc.meeting.change}</span> : null}
              </div>
            ) : null}
            <ul className="feed-list real-feed">
              {(doc.feed ?? []).slice(-8).reverse().map((f, i) => (
                <li key={i}>
                  <b>{f.t}</b>
                  <i>{f.icon}</i>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            {doc.briefing?.length ? (
              <div className="real-meeting">
                <b>📋 비서실 브리핑</b>
                {doc.briefing.map((line) => (
                  <span key={line}>· {line}</span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="real-step">
            <b>오늘 실제 업무 기록이 아직 없어요.</b>
            <small>
              {real.connected
                ? "‘오늘 업무 시작하기 · 실제’를 누르면 Claude가 실제 업무를 시작하고, 여기와 사무실 화면이 실제 진행에 맞춰 움직여요."
                : snap.running
                  ? "지금 화면은 시뮬레이션이에요."
                  : "claude.ai 앱에서 이 페이지를 열면 Claude와 연결돼요."}
            </small>
          </p>
        )}
      </div>
    </section>
  );
}

/** 실제 TOP 3 — 대표가 고르면 Claude에게 바로 간다 */
function RealTop3({ real }: { real: RealOffice }) {
  const doc = real.doc!;
  const choosing = doc.waiting === "top3";
  return (
    <>
      <div className="approval-top">
        <span className={`mini-badge ${choosing ? "yellow" : "mint"}`}>{choosing ? "오늘 TOP 3 · 골라주세요" : "오늘 TOP 3"}</span>
      </div>
      <div className="real-top3">
        {(doc.top3 ?? []).map((t) => (
          <div key={t.rank} className="real-top">
            <b>
              {t.rank}위 · {t.title}
            </b>
            <small>
              {t.format} · {t.score}점 — {t.why}
            </small>
            {choosing ? (
              <button className="btn approve-button" disabled={real.sending} onClick={(e) => void real.send(`TOP 3 중 ${t.rank}번으로 할게요`, e.currentTarget)}>
                {t.rank}번으로 하기
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

function ProfileModal({
  agent,
  onClose,
  onAsk,
}: {
  agent: Agent;
  onClose: () => void;
  onAsk: (agent: Agent) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} 프로필`}
      >
        <div className="win-bar">
          <span>👤 employee_profile.exe</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body employee-profile">
          <div className="profile-top">
            <PixelEmployee hair={agent.hair} shirt={agent.shirt} accent={agent.accent} />
            <div>
              <span className="status-pill working">{agent.status}</span>
              <h2>
                {agent.name}
                {agent.callsign ? <small> · {agent.callsign}</small> : null}
              </h2>
              <p>{agent.role}</p>
            </div>
          </div>
          <div className="profile-task">
            <span className="tiny-label">지금 하는 일</span>
            <strong>{agent.taskLabel}</strong>
            {agent.anim === "type" ? (
              <span className="profile-progress">
                <i style={{ width: `${Math.round(agent.progress * 100)}%` }} />
              </span>
            ) : null}
          </div>
          <div className="report-box">
            <span className="tiny-label">한마디</span>
            <strong>{agent.speech ?? agent.thoughts[0]}</strong>
          </div>
          <div className="profile-actions">
            <button className="btn btn-primary" onClick={() => onAsk(agent)}>
              🎤 지금 뭐 하는지 물어보기
            </button>
            <button className="text-button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BriefingModal({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="비서실 브리핑"
      >
        <div className="win-bar">
          <span>📋 kim_secretary.brief</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body">
          <p className="brief-date">{snap.clock} · {DEPT_LEAD.secretary.name} 비서실장 최종 브리핑</p>
          <h3>대표님, 오늘 회사 업무가 정리됐어요.</h3>
          <ul>
            <li>
              <span className="dot green" />
              완료 {snap.stats.done}팀 — 조사·기획·QA·대본·제작·저장까지 마쳤어요
            </li>
            <li>
              <span className="dot green" />
              대표 승인 1건 반영 — TOP 1 콘텐츠 제작 완료
            </li>
            <li>
              <span className="dot gray" />
              연동 대기 {snap.stats.blocked}팀 — 외부 서비스 연결이 필요해요
            </li>
          </ul>
          <div className="decision-box">
            <span className="tiny-label">오늘 대표님이 결정할 것</span>
            <strong>없습니다. 내일 07:00에 다시 출근할게요 ✨</strong>
          </div>
          <button className="btn btn-primary" onClick={onClose}>
            확인
          </button>
        </div>
      </section>
    </div>
  );
}

type TeamRow = {
  id: string;
  icon: string;
  name: string;
  room: string;
  lead: (typeof DEPT_LEAD)[string];
  status: DeptStatus;
  task: string;
  report: string;
};

function DashboardView({
  teams,
  filteredTeams,
  filter,
  setFilter,
  snap,
  onStart,
  onApprove,
  onSelect,
  integrations,
  publishResult,
}: {
  teams: TeamRow[];
  filteredTeams: TeamRow[];
  filter: "전체" | DeptStatus;
  setFilter: (value: "전체" | DeptStatus) => void;
  snap: Snapshot;
  onStart: () => void;
  onApprove: () => void;
  onSelect: (id: string) => void;
  integrations: IntegrationStatus | null;
  publishResult: PublishResult | null;
}) {
  // 서버가 알려준 실제 설정 상태로 표시한다 (연결됐다고 거짓 보고하지 않는다)
  const liveRows = integrations
    ? [
        {
          name: "Notion 저장",
          status: publishResult?.notion.ok
            ? "저장 성공"
            : integrations.notion?.configured
              ? "키 설정됨"
              : "키 미설정",
          tone: publishResult?.notion.ok ? "mint" : integrations.notion?.configured ? "yellow" : "lav",
          href: "",
        },
        {
          name: "Discord 전송",
          status: publishResult?.discord.ok
            ? "전송 성공"
            : integrations.discord?.configured
              ? "웹훅 설정됨"
              : "웹훅 미설정",
          tone: publishResult?.discord.ok ? "mint" : integrations.discord?.configured ? "yellow" : "lav",
          href: "",
        },
        { name: "Instagram", status: integrations.instagram?.need ?? "연동 대기", tone: "lav", href: "" },
        { name: "Gmail", status: integrations.gmail?.need ?? "연동 대기", tone: "lav", href: "" },
        { name: "재무 파일", status: integrations.finance?.need ?? "자료 대기", tone: "lav", href: "" },
      ]
    : [];
  const rows = [...integrations2Static, ...liveRows];

  return (
    <>
      <header className="win hero">
        <div className="win-bar">
          <span>🎀 {COMPANY.windowLabel}</span>
          <span className="window-controls" aria-hidden="true">
            —　▢　✕
          </span>
        </div>
        <div className="hero-body">
          <div className="hero-copy">
            <p className="eyebrow">TODAY · 07:00 AUTO START</p>
            <h1>
              오늘 회사가 어떻게 움직이는지 <em className="highlight">한눈에</em> 보여드려요
            </h1>
            <p>AI는 비서, 결정은 대표님. {teams.length}개 팀 {STAFF.length}명의 조사부터 제작·저장·브리핑까지 한 흐름으로 관리해요.</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => onStart()} disabled={snap.running}>
              {snap.running ? "AI 팀원들이 근무 중…" : "오늘 업무 시작하기"}
            </button>
            <span className="trust-copy">실제 전송·게시·결제는 대표 승인 후 진행해요</span>
          </div>
        </div>
      </header>

      <section className="summary-grid" aria-label="오늘 업무 요약">
        <article className="metric yellow">
          <span>AI 직원</span>
          <strong>{STAFF.length}</strong>
          <small>STAFF</small>
        </article>
        <article className="metric mint">
          <span>완료</span>
          <strong>{snap.stats.done}</strong>
          <small>DONE</small>
        </article>
        <article className="metric pink">
          <span>진행 중</span>
          <strong>{snap.stats.working}</strong>
          <small>WORKING</small>
        </article>
        <article className="metric lav">
          <span>대표 확인</span>
          <strong>{snap.stats.approval}</strong>
          <small>APPROVAL</small>
        </article>
        <article className="metric white">
          <span>연동 대기</span>
          <strong>{snap.stats.blocked}</strong>
          <small>WAITING</small>
        </article>
      </section>

      <section className="workspace">
        <aside className="side-stack">
          <section className="win">
            <div className="win-bar">
              <span>⚡ automation.status</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="schedule-card">
                <div>
                  <span className="tiny-label">NEXT RUN</span>
                  <strong>매일 오전 7:00</strong>
                  <p>컴퓨터 지시 없이 하루 업무 시작</p>
                </div>
                <span className="toggle-on">ON</span>
              </div>
              <div className="flow-list">
                {PHASES.slice(1, 12).map((item, index) => (
                  <div className={`flow-row ${snap.phaseIndex > index + 1 ? "past" : ""}`} key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{item}</b>
                    <i>{snap.phaseIndex === index + 1 ? "●" : snap.phaseIndex > index + 1 ? "✓" : "·"}</i>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="win">
            <div className="win-bar">
              <span>🔗 integrations.link</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body integration-list">
              {rows.map((item) =>
                item.href ? (
                  <a key={item.name} href={item.href} target="_blank" rel="noreferrer" className="integration-row">
                    <b>{item.name}</b>
                    <span className={`mini-badge ${item.tone}`}>{item.status}</span>
                  </a>
                ) : (
                  <div key={item.name} className="integration-row">
                    <b>{item.name}</b>
                    <span className={`mini-badge ${item.tone}`}>{item.status}</span>
                  </div>
                ),
              )}
            </div>
          </section>
        </aside>

        <div className="main-stack">
          <section className="win">
            <div className="win-bar">
              <span>🏢 team_office.board</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">LIVE OFFICE</p>
                  <h2>{teams.length}개 부서 · 팀장 {teams.length}명 근무 현황</h2>
                </div>
                <div className="filter-tabs" role="group" aria-label="팀 상태 필터">
                  {(["전체", "진행 중", "완료", "승인 대기", "연동 대기"] as const).map((item) => (
                    <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="team-grid">
                {filteredTeams.map((team) => (
                  <button className="team-card" key={team.id} onClick={() => onSelect(team.lead.id)}>
                    <span className={`status-dot ${statusClass[team.status]}`} aria-hidden="true" />
                    <span className="mini-pixel">
                      <PixelEmployee hair={team.lead.hair} shirt={team.lead.shirt} accent={team.lead.accent} />
                    </span>
                    <span className="team-copy">
                      <b>
                        {team.lead.name} · {team.name}
                      </b>
                      <small>{team.task}</small>
                    </span>
                    <span className={`status-pill ${statusClass[team.status]}`}>{team.status}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="two-col">
            <section className="win">
              <div className="win-bar">
                <span>✅ ceo.approval</span>
                <span className="window-controls">—　▢　✕</span>
              </div>
              <div className="win-body approval-body">
                <div className="approval-top">
                  <span className="mini-badge yellow">TOP 1 제안</span>
                  <span className="score">{SAMPLE_PROPOSAL.score}</span>
                </div>
                <h3>{SAMPLE_PROPOSAL.title}</h3>
                <p>{SAMPLE_PROPOSAL.summary}</p>
                <button
                  className={`btn approve-button ${snap.approved ? "approved" : ""}`}
                  onClick={onApprove}
                  disabled={!snap.approvalPending}
                >
                  {snap.approved ? "승인 완료 · 제작팀 전달됨" : snap.approvalPending ? "이 콘텐츠 승인하기" : "대기 중인 안건 없음"}
                </button>
              </div>
            </section>

            <section className="win secretary">
              <div className="win-bar">
                <span>📋 kim_secretary.brief</span>
                <span className="window-controls">—　▢　✕</span>
              </div>
              <div className="win-body">
                <p className="brief-date">{new Date().toLocaleDateString("ko-KR")} · {snap.clock} 현재</p>
                <h3>{snap.dayComplete ? "대표님, 오늘 업무가 정리됐어요." : "대표님, 현재 진행 상황이에요."}</h3>
                <ul>
                  <li>
                    <span className="dot green" />
                    {snap.phase} 진행 중 — 완료 {snap.stats.done}팀
                  </li>
                  <li>
                    <span className={`dot ${snap.approvalPending ? "yellow" : "green"}`} />
                    {snap.approvalPending ? "TOP 1 대표 확인 필요" : "대기 중인 결재 없음"}
                  </li>
                  <li>
                    <span className="dot gray" />
                    외부 서비스 연동 대기
                  </li>
                </ul>
                <div className="decision-box">
                  <span className="tiny-label">대표님이 오늘 결정할 1개</span>
                  <strong>
                    {snap.approvalPending
                      ? "TOP 1 콘텐츠를 제작할지 승인해주세요."
                      : snap.approved
                        ? "결정 완료! 제작팀이 다음 업무를 진행해요."
                        : "아직 올라온 안건이 없어요."}
                  </strong>
                </div>
              </div>
            </section>
          </section>
        </div>
      </section>

      <section className="win storage">
        <div className="win-bar">
          <span>📦 result_storage</span>
          <span className="window-controls">—　▢　✕</span>
        </div>
        <div className="win-body">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RECENT OUTPUTS</p>
              <h2>결과물 창고</h2>
            </div>
            {STORAGE_LINK ? (
              <a className="btn btn-small" href={STORAGE_LINK} target="_blank" rel="noreferrer">
                보관함 열기
              </a>
            ) : null}
          </div>
          <div className="result-table">
            <div className="result-row header">
              <span>결과물</span>
              <span>담당팀</span>
              <span>상태</span>
              <span>바로가기</span>
            </div>
            {[
              { label: "오늘의 릴스 편집본", dept: "reels" },
              { label: "오늘의 캐러셀 이미지", dept: "carousel" },
            ].map(({ label, dept }) => {
              const status = snap.deptStatus[dept] ?? "대기";
              return (
                <div className="result-row" key={dept}>
                  <b>{label}</b>
                  <span>{teams.find((team) => team.id === dept)?.name}</span>
                  <span className={`status-pill ${statusClass[status]}`}>{status}</span>
                  <span>—</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <p className="dash-note">
        대표 {CEO.name}({CEO.callsign}) · AI 직원 {teams.length}개 부서 {STAFF.length}명 · 이 화면은 라이브 오피스와 같은 상태를
        공유해요.
      </p>
    </>
  );
}
