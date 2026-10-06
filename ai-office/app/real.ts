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

/** 페이지에서 Claude에게 바로 묻는 함수 (대표의 Claude 사용량을 쓴다) */
export type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: string, opts?: Record<string, unknown>) => Promise<T>;
};

type SendState = "unknown" | "available" | "writers_only" | "no_session" | "off";

type CommentsApi = {
  anchorFor(el: Element): Promise<unknown>;
  sendToClaude(t: { anchor: unknown; text: string } | { threadId: string; text: string }): Promise<{ threadId: string }>;
  canSendToClaude(): Promise<SendState>;
};

const THREAD_KEY = "thth-office-thread";

function todayKst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
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
  const dbRef = useRef<{ doc(p: string): { set(d: Record<string, unknown>): Promise<void> } } | null>(null);
  const calendarWrite = useRef<Promise<unknown>>(Promise.resolve());
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
      const prev = unsub;
      unsub = () => {
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

  /** 대표 말 한 줄을 Claude에게 보낸다. 반드시 클릭·전송 같은 대표 동작 안에서 부른다. */
  const send = useCallback(async (text: string, anchorEl: Element | null) => {
    const api = commentsRef.current;
    if (!api) return false;
    setSending(true);
    setLastError("");
    try {
      const thread = readThread();
      if (thread) {
        try {
          await api.sendToClaude({ threadId: thread, text });
          return true;
        } catch (e) {
          if ((e as { code?: string }).code !== "not_found") throw e;
        }
      }
      const el = anchorEl ?? document.body;
      const anchor = await api.anchorFor(el);
      const res = await api.sendToClaude({ anchor, text });
      saveThread(res.threadId);
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code ?? "error";
      setLastError(
        code === "consent_required"
          ? "댓글 권한을 허용해야 Claude에게 보낼 수 있어요"
          : code === "claude_unavailable"
            ? "지금 Claude에게 보낼 수 없어요 (대화 창이 꺼져 있을 수 있어요)"
            : code === "rate_limited"
              ? "너무 빨리 보냈어요. 잠시 뒤에 다시 보내주세요"
              : `보내지 못했어요 (${code})`,
      );
      return false;
    } finally {
      setSending(false);
    }
  }, []);

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
  return { doc: todayDoc, anyDoc: doc, dbReady, sendState, connected, sending, lastError, send, brief, sample: sampleFn, dashboard, insta, report, calendar, calendarLoaded, saveCalendar };
}

export type RealOffice = ReturnType<typeof useRealOffice>;
