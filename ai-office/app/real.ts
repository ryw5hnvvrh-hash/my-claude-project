"use client";

// ============================================================
//  실제 업무 연결 — 오피스 화면 ↔ Claude
//  · 대표가 누르거나 쓴 말은 댓글 "Send to Claude"로 Claude에게 간다.
//  · Claude는 실제 업무 진행 상황을 이 아티팩트의 db 문서
//    office/today 에 적는다. 화면은 그 문서를 실시간으로 그린다.
//  · claude.ai 밖에서 열면(파일로 열기 등) 둘 다 없고, 시뮬레이션만 돈다.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

export type RealFeed = { t: string; icon: string; text: string };
export type RealChat = { t: string; from: "ceo" | "staff"; name: string; text: string };
export type RealTop = { rank: number; title: string; format: string; score: number; why: string };

/** Claude가 office/today 에 쓰는 문서 모양 */
export type RealDoc = {
  date?: string;
  /** PHASES 인덱스 (0 출근 대기 … 12 업무 종료) */
  phase?: number;
  status?: "idle" | "working" | "waiting";
  /** 대표 확인을 기다리는 것 */
  waiting?: "opinion" | "top3" | "script" | null;
  /** 지금 하는 일 한 줄 */
  step?: string;
  feed?: RealFeed[];
  chat?: RealChat[];
  meeting?: { followers?: string; lines?: string[]; repeat?: string; change?: string };
  top3?: RealTop[];
  briefing?: string[];
  updatedAt?: string;
};

/** 업무 시작 때 Claude가 office/dashboard 에 쓰는 대시보드 숫자 */
export type RealDashboard = {
  date?: string;
  updatedAt?: string;
  metrics?: { label: string; value: string; note?: string; tone?: string }[];
  integrations?: { name: string; status: string; tone?: string }[];
  schedule?: { title: string; desc: string };
  notes?: string[];
};

/** 시장조사팀이 매일 아침 쓰는 "요새 떠오르는 키워드" (db 문서 office/research) */
export type ResearchKeyword = { word: string; trend?: string; why?: string; use?: string; source?: string; url?: string };
export type ResearchDoc = {
  date?: string;
  updatedAt?: string;
  summary?: string;
  keywords?: ResearchKeyword[];
  pick?: string;
  note?: string;
};

/** 기획 1팀이 매일 올리는 TOP 3 결재 안건 (db 문서 office/proposals) */
export type ProposalItem = { rank: number; title: string; format: string; score?: number; why?: string; source?: string; scene?: string };
export type ProposalDoc = {
  date?: string;
  updatedAt?: string;
  round?: number;
  basis?: { plan?: string; keywords?: string; ceo?: string };
  items?: ProposalItem[];
  ceoNotes?: { t?: string; text: string }[];
  status?: string;
  chosen?: number | null;
};

/** 페이지에서 Claude에게 바로 묻는 함수 (대표의 Claude 사용량을 쓴다) */
export type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: string, opts?: Record<string, unknown>) => Promise<T>;
};

/** 대표가 보낸 말 한 건 — db 컬렉션 office/inbox/msgs 에 남는다 (사라지지 않게) */
export type InboxStatus = "chat" | "queued" | "sent" | "failed" | "done";
export type InboxMsg = {
  id: string;
  date: string;
  t: string;
  text: string;
  /** chat: 직원이 바로 답함(총괄비서 일 아님) · queued: 보내는 중 · sent: 총괄비서에게 전달됨 · failed: 못 보냄(자동 점검 때 처리) · done: 처리 끝 */
  status: InboxStatus;
  kind?: "work" | "chat";
  reply?: string;
  error?: string;
};

/** 팀별 업무 노트 — 총괄비서가 숫자로 배운 것을 적어 두고, 직원 대답·TOP 3가 따른다 (db 문서 office/playbook) */
export type PlaybookDoc = {
  updatedAt?: string;
  rules?: string[];
  teams?: Record<string, string[]>;
};

type SendState = "unknown" | "available" | "writers_only" | "no_session" | "off";

type CommentsApi = {
  anchorFor(el: Element): Promise<unknown>;
  sendToClaude(t: { anchor: unknown; text: string } | { threadId: string; text: string }): Promise<{ threadId: string }>;
  canSendToClaude(): Promise<SendState>;
};

const THREAD_KEY = "thth-office-thread";

export function todayKst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function nowKst() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function newMsgId() {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `m${kst}${Math.random().toString(36).slice(2, 6)}`;
}

/** 실제 작업이 필요한 말인지 — 이런 말만 총괄비서(이 대화)에게 보낸다. 나머지는 직원이 바로 답한다. */
export function looksLikeWork(text: string) {
  const t = text.replace(/\s+/g, "");
  if (/^\[(결재|TOP3의견|TOP 3 의견|다시 보냄)/.test(text)) return true;
  const strong = /(만들어|고쳐|수정|바꿔|바꾸|찾아|써줘|써주|편집|캡션|대본|올렸|예약|업로드|게시했|찍었|촬영했|드라이브|결재|번으로|판매|출시|주문|입금|삭제|지워|추가|넣어|빼줘|새로|아이디어|업무시작|마무리)/.test(t);
  const question = /(현황|브리핑|어때|어땠|몇|얼마|알려줘|뭐야|뭐였|뭐해|있어\?|\?$)/.test(t);
  if (question && !strong) return false;
  return /(해줘|해주세요|해줄래|부탁|만들어|고쳐|수정|바꿔|바꾸|찾아|올려|올렸|써줘|써주|정리해|확인해|알아봐|조사해|편집|캡션|대본|하자|할게|할래|번으로|결재|예약|업로드|게시했|촬영했|찍었|드라이브|판매|출시|주문|입금|정산|삭제|지워|추가|넣어|빼줘|다시|새로|아이디어|업무시작|업무끝|마무리)/.test(t);
}

function readThread(): string | null {
  try {
    const raw = localStorage.getItem(THREAD_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { date: string; id: string };
    return saved.date === todayKst() ? saved.id : null;
  } catch {
    return null;
  }
}

function saveThread(id: string) {
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify({ date: todayKst(), id }));
  } catch {
    /* 저장 못 해도 다음 전송이 새 스레드를 연다 */
  }
}

export function useRealOffice() {
  const [doc, setDoc] = useState<RealDoc | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [sendState, setSendState] = useState<SendState>("unknown");
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState("");
  const [brief, setBrief] = useState<string>("");
  const [dashboard, setDashboard] = useState<RealDashboard | null>(null);
  const [insta, setInsta] = useState<unknown[] | null>(null);
  const [report, setReport] = useState<unknown | null>(null);
  // 콘텐츠 캘린더 — 대표가 화면에서 쓰고, Claude도 읽고 채운다 (db 문서 office/calendar)
  const [calendar, setCalendar] = useState<unknown | null>(null);
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const [research, setResearch] = useState<ResearchDoc | null>(null);
  const [proposals, setProposals] = useState<ProposalDoc | null>(null);
  const dbRef = useRef<{ doc(p: string): { set(d: Record<string, unknown>): Promise<void> } } | null>(null);
  const calendarWrite = useRef<Promise<unknown>>(Promise.resolve());
  const [inbox, setInbox] = useState<InboxMsg[]>([]);
  const [playbook, setPlaybook] = useState<PlaybookDoc | null>(null);
  const [sampleFn, setSampleFn] = useState<SampleFn | null>(null);
  const commentsRef = useRef<CommentsApi | null>(null);

  useEffect(() => {
    const claude = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
    if (!claude?.use) {
      setSendState("off");
      return;
    }
    let unsub: (() => void) | null = null;
    let alive = true;
    claude.use("db").then((db) => {
      if (!alive || !db) return;
      setDbReady(true);
      dbRef.current = db as { doc(p: string): { set(d: Record<string, unknown>): Promise<void> } };
      const ref = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/today");
      unsub = ref.onSnapshot(
        (snap) => setDoc(snap.exists ? ((snap.data() as RealDoc) ?? null) : null),
        () => setDoc(null),
      );
      // Claude가 적어 두는 회사 사정 요약 — 직원 대답의 근거로 쓴다
      const briefRef = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/brief");
      const unsubBrief = briefRef.onSnapshot(
        (snap) => setBrief(snap.exists ? String((snap.data() as { text?: string })?.text ?? "") : ""),
        () => setBrief(""),
      );
      // 업무 시작 때 Claude가 새로 올리는 대시보드·인스타 숫자 — 다시 배포하지 않아도 화면이 바뀐다
      const dashRef = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/dashboard");
      const unsubDash = dashRef.onSnapshot(
        (snap) => setDashboard(snap.exists ? ((snap.data() as RealDashboard) ?? null) : null),
        () => setDashboard(null),
      );
      const instaRef = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/insta");
      const unsubInsta = instaRef.onSnapshot(
        (snap) => {
          const list = snap.exists ? (snap.data() as { snapshots?: unknown[] })?.snapshots : null;
          setInsta(Array.isArray(list) ? list : null);
        },
        () => setInsta(null),
      );
      // 업무 보고 대시보드 — 업무가 끝날 때·다음 날 업무 시작 때 총괄비서가 쓴다
      const reportRef = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/report");
      const unsubReport = reportRef.onSnapshot(
        (snap) => setReport(snap.exists ? (snap.data() ?? null) : null),
        () => setReport(null),
      );
      const calRef = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/calendar");
      const unsubCal = calRef.onSnapshot(
        (snap) => {
          setCalendar(snap.exists ? (snap.data() ?? null) : null);
          setCalendarLoaded(true);
        },
        () => setCalendarLoaded(true),
      );
      // 시장조사팀 아침 키워드 보고
      const researchRef = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/research");
      const unsubResearch = researchRef.onSnapshot(
        (snap) => setResearch(snap.exists ? ((snap.data() as ResearchDoc) ?? null) : null),
        () => setResearch(null),
      );
      // 기획 1팀 TOP 3 결재 안건
      const propRef = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/proposals");
      const unsubProp = propRef.onSnapshot(
        (snap) => setProposals(snap.exists ? ((snap.data() as ProposalDoc) ?? null) : null),
        () => setProposals(null),
      );
      // 대표가 보낸 말 — 오늘 것만 보여준다
      const anyDb = db as { collection(p: string): { where(f: string, o: string, v: unknown): { onSnapshot(n: (s: { docs: { id: string; data(): unknown }[] }) => void, e?: () => void): () => void } } };
      const unsubInbox = anyDb
        .collection("office/inbox/msgs")
        .where("date", "==", todayKst())
        .onSnapshot(
          (snap) => setInbox(snap.docs.map((d) => ({ ...(d.data() as InboxMsg), id: d.id })).sort((a, b) => (a.id < b.id ? -1 : 1))),
          () => setInbox([]),
        );
      // 팀별 업무 노트
      const pbRef = (db as { doc(p: string): { onSnapshot(n: (s: { exists: boolean; data(): unknown }) => void, e?: () => void): () => void } }).doc("office/playbook");
      const unsubPb = pbRef.onSnapshot(
        (snap) => setPlaybook(snap.exists ? ((snap.data() as PlaybookDoc) ?? null) : null),
        () => setPlaybook(null),
      );
      const prev = unsub;
      unsub = () => {
        unsubInbox();
        unsubPb();
        unsubProp();
        unsubResearch();
        prev?.();
        unsubBrief();
        unsubDash();
        unsubInsta();
        unsubReport();
        unsubCal();
      };
    });
    claude.use("sample").then((fn) => {
      if (alive && fn) setSampleFn(() => fn as SampleFn);
    });
    claude.use("comments").then((api) => {
      if (!alive) return;
      if (!api) return setSendState("off");
      commentsRef.current = api as CommentsApi;
      commentsRef.current
        .canSendToClaude()
        .then((s) => alive && setSendState(s))
        .catch(() => alive && setSendState("off"));
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  /** 받은편지함 문서 한 건 쓰기 (실패해도 화면은 계속) */
  const writeMsg = useCallback(async (msg: InboxMsg, patch?: Partial<InboxMsg>) => {
    const db = dbRef.current as unknown as { collection(p: string): { doc(id: string): { set(d: Record<string, unknown>): Promise<void>; update(d: Record<string, unknown>): Promise<void> } } } | null;
    if (!db) return false;
    const ref = db.collection("office/inbox/msgs").doc(msg.id);
    try {
      if (patch) await ref.update(patch as Record<string, unknown>);
      else await ref.set(msg as unknown as Record<string, unknown>);
      return true;
    } catch {
      return false;
    }
  }, []);

  /** 총괄비서에게 실제로 보낸다 (댓글). 반드시 클릭·전송 안에서 바로 부른다. */
  const relay = useCallback(async (text: string, anchorEl: Element | null) => {
    const api = commentsRef.current;
    if (!api) return { ok: false, code: "off" };
    try {
      const thread = readThread();
      if (thread) {
        try {
          await api.sendToClaude({ threadId: thread, text });
          return { ok: true, code: "" };
        } catch (e) {
          if ((e as { code?: string }).code !== "not_found") throw e;
        }
      }
      const el = anchorEl ?? document.body;
      const anchor = await api.anchorFor(el);
      const res = await api.sendToClaude({ anchor, text });
      saveThread(res.threadId);
      return { ok: true, code: "" };
    } catch (e) {
      return { ok: false, code: (e as { code?: string }).code ?? "error" };
    }
  }, []);

  const errorText = (code: string) =>
    code === "consent_required"
      ? "댓글 권한을 허용해야 총괄비서에게 바로 보낼 수 있어요 — 받은편지함에 남겨 두었어요"
      : code === "claude_unavailable" || code === "off"
        ? "총괄비서 대화창이 지금 닫혀 있어요 — 받은편지함에 남겨 두었고 자동 점검 때 처리돼요"
        : code === "rate_limited"
          ? "너무 빨리 보냈어요 — 받은편지함에 남겨 두었어요"
          : `바로 보내지 못했어요 (${code}) — 받은편지함에 남겨 두었어요`;

  /**
   * 대표 말 한 줄 처리. 먼저 받은편지함(db)에 남기고, 작업이 필요한 말이면 총괄비서에게 보낸다.
   * work=false 면 받은편지함에만 남는다(직원이 바로 답함).
   */
  const send = useCallback(
    async (text: string, anchorEl: Element | null, work = true) => {
      const msg: InboxMsg = { id: newMsgId(), date: todayKst(), t: nowKst(), text, status: work ? "queued" : "chat", kind: work ? "work" : "chat" };
      if (!work) {
        void writeMsg(msg);
        return true;
      }
      setSending(true);
      setLastError("");
      // 댓글 보내기를 먼저 시작해야(클릭 직후) 브라우저가 막지 않는다
      const relayP = relay(`[메시지 ${msg.id}] ${text}`, anchorEl);
      const saved = await writeMsg(msg);
      const r = await relayP;
      if (r.ok) {
        if (saved) void writeMsg(msg, { status: "sent" });
        else void writeMsg({ ...msg, status: "sent" });
      } else {
        setLastError(errorText(r.code));
        if (saved) void writeMsg(msg, { status: "failed", error: r.code });
        else void writeMsg({ ...msg, status: "failed", error: r.code });
      }
      setSending(false);
      return r.ok;
    },
    [relay, writeMsg],
  );

  /** 못 보낸 말 다시 보내기 (대표 클릭 안에서) */
  const resend = useCallback(
    async (msgs: InboxMsg[], anchorEl: Element | null) => {
      if (!msgs.length) return false;
      setSending(true);
      setLastError("");
      const body = msgs.length === 1 ? `[메시지 ${msgs[0].id}] ${msgs[0].text}` : `[다시 보냄]\n${msgs.map((m) => `- [메시지 ${m.id}] ${m.text}`).join("\n")}`;
      const r = await relay(body, anchorEl);
      for (const m of msgs) void writeMsg(m, r.ok ? { status: "sent", error: "" } : { status: "failed", error: r.code });
      if (!r.ok) setLastError(errorText(r.code));
      setSending(false);
      return r.ok;
    },
    [relay, writeMsg],
  );

  /** 캘린더 전체를 한 번에 저장 — 같은 문서에는 한 번에 하나씩만 쓴다 */
  const saveCalendar = useCallback((data: Record<string, unknown>) => {
    const db = dbRef.current;
    if (!db) return Promise.resolve(false);
    const next = calendarWrite.current.then(() =>
      db
        .doc("office/calendar")
        .set(data)
        .then(() => true)
        .catch(() => false),
    );
    calendarWrite.current = next;
    return next;
  }, []);

  const connected = sendState === "available";
  const todayDoc = doc && doc.date === todayKst() ? doc : null;
  return { doc: todayDoc, anyDoc: doc, dbReady, sendState, connected, sending, lastError, send, resend, inbox, playbook, brief, sample: sampleFn, dashboard, insta, report, calendar, calendarLoaded, saveCalendar, research, proposals };
}

export type RealOffice = ReturnType<typeof useRealOffice>;
