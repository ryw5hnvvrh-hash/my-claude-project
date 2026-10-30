// 라이브 오피스 시뮬레이션 엔진
// 직원 상태머신 + A* 이동 + 회의 엔진 + 하루 시나리오 스크립트

import { findPath } from "./pathfinding";
import { BLOCK_NEED, CEO, DEPT_BRIEF, DEPT_LEAD, STAFF, type StaffSeed } from "./staff";

/** 비서실장 이름 (company.config.ts 에서) */
const SECRETARY = DEPT_LEAD.secretary.name;
/** 부서 팀장 이름 */
const leadName = (dept: string) => DEPT_LEAD[dept]?.name ?? "";
/** 대표 승인 회의에 들어가는 팀장들 */
const APPROVERS_LABEL = ["research", "strategy1", "qa"].map(leadName).join("·");
import {
  CEO_REPORT_SPOT,
  CEO_SEAT,
  COLS,
  DEPT_ROOMS,
  ENTRANCE,
  LOUNGE_ROOM,
  MEETING_SEATS,
  doorApproach,
  roomOf,
  walkable,
  type Pt,
} from "./world";

export type DeptStatus = "완료" | "진행 중" | "승인 대기" | "연동 대기" | "대기";
export type AgentStatus =
  | "출근 전"
  | "출근 중"
  | "대기"
  | "이동 중"
  | "업무 중"
  | "회의 중"
  | "보고 중"
  | "휴식"
  | "연동 대기";
export type Anim = "idle" | "walk" | "type" | "talk" | "sit";
export type Facing = "up" | "down" | "left" | "right";

const WALK_SPEED = 3.6; // tiles / sec
/**
 * 사내 시계는 '시뮬레이션 시간' 기준으로 흐른다 — 시뮬 1초 = 1.6분.
 * 배속을 올리면 시계도 같이 빨라지므로, 몇 배속으로 보든 하루는 07:00 → 약 17:00으로 끝난다.
 */
const SIM_MIN_PER_SEC = 1.6;
/** ⏭ 건너뛰기(터보)일 때의 배속 */
const TURBO_SPEED = 10;

type Action =
  | { k: "walk"; to: Pt }
  | { k: "say"; text: string; dur: number; kind: "talk" | "think" }
  | { k: "wait"; dur: number }
  | { k: "face"; dir: Facing }
  | { k: "anim"; a: Anim }
  | { k: "status"; s: AgentStatus }
  | { k: "work"; dur: number; label: string }
  | { k: "fn"; fn: () => void };

export type Agent = {
  id: string;
  name: string;
  callsign?: string;
  role: string;
  deptId: string;
  rank: StaffSeed["rank"];
  hair: string;
  shirt: string;
  accent: string;
  skin: string;
  thoughts: string[];

  x: number;
  y: number;
  facing: Facing;
  anim: Anim;
  status: AgentStatus;
  home: Pt;
  progress: number;
  taskLabel: string;

  path: Pt[];
  pathIdx: number;
  blockedFor: number;
  queue: Action[];
  current: Action | null;
  timer: number;
  speech: string | null;
  speechKind: "talk" | "think";
  speechFor: number;
  idleFor: number;
  /** 렌더링에서 겹침을 줄이는 미세 오프셋 */
  jitter: number;
};

export type LogEntry = { id: number; time: string; icon: string; text: string; tone: string };
/** 대표 지시창 대화 */
export type ChatEntry = {
  id: number;
  time: string;
  from: "ceo" | "staff";
  name: string;
  text: string;
};

type Slot = {
  gen: Generator<number | (() => boolean), void, void> | null;
  wait: number;
  until: (() => boolean) | null;
};

export type Snapshot = {
  clock: string;
  running: boolean;
  paused: boolean;
  speed: number;
  turbo: boolean;
  dayComplete: boolean;
  phase: string;
  phaseIndex: number;
  approvalPending: boolean;
  approved: boolean;
  briefingReady: boolean;
  deptStatus: Record<string, DeptStatus>;
  counts: Record<AgentStatus, number>;
  stats: { done: number; working: number; approval: number; blocked: number };
  log: LogEntry[];
  meetingTitle: string | null;
  /** 회의 중 대표 의견을 기다리는 중 (지시창 입력 = 의견) */
  opinionPending: boolean;
  /** 실제 업무(Claude) 연결 중 */
  realMode: boolean;
  /** 실제 업무가 다음 단계에 도달하길 기다리는 중 */
  gateWaiting: boolean;
  /** 오늘 대표가 회의에서 낸 의견 */
  ceoOpinions: { meeting: string; text: string }[];
  chat: ChatEntry[];
  focusMode: boolean;
  spotlight: string | null;
  busyWithOrder: boolean;
};

const PHASES = [
  "출근 대기",
  "대표 출근 · 업무 시작",
  "시장조사·브랜드 분석",
  "전체 성과 회의",
  "아이디어 10개",
  "브랜드 QA",
  "TOP 3 선정",
  "대표 승인 대기",
  "대본 작성",
  "릴스·캐러셀 제작",
  "결과물 저장",
  "비서실 브리핑",
  "업무 종료",
];

const BLOCKED_DEPTS = new Set(Object.keys(BLOCK_NEED));

/** 연동 대기 부서가 멈춰 있는 진짜 이유 */
const BLOCK_REASON: Record<string, string> = {
  finance: "드라이브 '정산' 폴더에 확인할 파일이 없어요. 스마트스토어·아이디어스·광고비·재료비 폴더에 올려주시면 정산합니다.",
};

/** 차례를 기다릴 때 부서별 답 — 그 부서가 언제 움직이는지 말한다 */
const WAIT_LINE: Record<string, string> = {
  research: "출근하면 제일 먼저 시장조사부터 시작해요.",
  strategy1: "전체 성과 회의 끝나면 성과 근거 붙여서 아이디어 10개 만들어요.",
  qa: "기획 1팀 아이디어 10개 넘어오면 바로 검수해요.",
  strategy2: "대표님이 TOP 3 중에 고르시면 그때 대본 써요.",
  reels: "확정 대본이랑 대표님이 고르신 후킹 받으면 바로 편집 들어가요.",
  carousel: "확정 문구 받으면 바로 캐러셀 만들어요.",
  finance: "비서실 브리핑 직전에 드라이브 '정산' 폴더 확인해요. 아직 제 차례 전이에요.",
  review: "시장조사 끝나면 전체 성과 회의 열어요. 인스타 숫자는 받아뒀어요.",
  secretary: "각 팀 결과 모아서 마지막에 대표님께 브리핑해요.",
};

/** 지시창에서 부서를 찾을 때 쓰는 키워드 — 구체적인 것부터 검사한다 */
const DEPT_KEYWORDS: [string, string[]][] = [
  ["qa", ["qa", "큐아", "검수", "금칙어", leadName("qa")]],
  ["strategy1", ["전략 1", "전략1", "기획", "아이디어", leadName("strategy1"), "톱3", "top 3"]],
  ["strategy2", ["전략 2", "전략2", "대본", leadName("strategy2"), "스크립트"]],
  ["research", ["시장조사", "리서치", "조사팀", "트렌드", "브랜드 분석", "förc", leadName("research")]],
  ["reels", ["릴스", "영상", "편집", "하민", leadName("reels")]],
  ["carousel", ["캐러셀", "카드뉴스", "canva", "칸바", leadName("carousel")]],
  ["finance", ["재무", "정산", "입금", "돈", "광고비", leadName("finance")]],
  ["review", ["성과", "리뷰", "지표", leadName("review")]],
  ["secretary", ["비서", SECRETARY, "비서실"]],
];

/** 회의실 보조석 — 대표·후킹 전담까지 들어오면 10자리를 넘는다 */
const EXTRA_SEATS: Pt[] = [
  { x: 26, y: 10 },
  { x: 45, y: 10 },
  { x: 26, y: 5 },
  { x: 45, y: 5 },
].filter((p) => walkable(p.x, p.y));

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 지금 한국 시각 HH:MM */
function kstNow() {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export class Company {
  agents: Agent[] = [];
  agentById = new Map<string, Agent>();
  deptStatus: Record<string, DeptStatus> = {};
  log: LogEntry[] = [];
  clockMinutes = 7 * 60;
  /** 재생 속도 — 시뮬레이션 전체(걷기·업무·대사)를 함께 배속한다. 실제 외부 작업 속도와는 무관 */
  speed = 2;
  turbo = false;
  paused = false;
  running = false;
  dayComplete = false;
  phaseIndex = 0;
  approvalPending = false;
  approved = false;
  briefingReady = false;
  meetingTitle: string | null = null;
  private opinionOpen = false;
  /** 실제 업무 연결: null = 시뮬레이션만, 숫자 = Claude가 실제로 도달한 단계(PHASES 인덱스) */
  private realGate: number | null = null;
  /** 실제 업무가 아직 도달하지 않은 단계 앞에서 기다리는 중이면 그 단계 번호 — 화면에 '대기'로 보여준다 */
  private gateWaiting: number | null = null;
  private ceoOpinions: { meeting: string; text: string }[] = [];
  onBriefing: (() => void) | null = null;
  /** 대표 지시창 */
  chat: ChatEntry[] = [];
  focusMode = false;
  /** 대표 순찰까지 남은 시간(초) */
  private ceoPatrolIn = 10;
  spotlight: string | null = null;

  private spotlightUntil = 0;
  private elapsed = 0;
  private approvalSince: number | null = null;
  private logSeq = 0;
  /** 하루 시나리오(main)와 대표 지시로 끼어드는 장면(side)을 각각 돌린다 */
  private main: Slot = { gen: null, wait: 0, until: null };
  private side: Slot = { gen: null, wait: 0, until: null };
  private occupancy = new Set<number>();
  private seatBook = new Map<string, Pt>();
  /** 시나리오 장면에 참여 중인 직원 — 자율 행동(커피·잡담)이 끼어들지 못하게 잠근다 */
  private locked = new Set<string>();

  constructor() {
    this.reset();
  }

  reset() {
    this.agents = [];
    this.agentById.clear();
    this.log = [];
    this.logSeq = 0;
    this.clockMinutes = 7 * 60;
    this.running = false;
    this.paused = false;
    this.dayComplete = false;
    this.phaseIndex = 0;
    this.approvalPending = false;
    this.approved = false;
    this.briefingReady = false;
    this.opinionOpen = false;
    this.ceoOpinions = [];
    this.meetingTitle = null;
    this.main = { gen: null, wait: 0, until: null };
    this.side = { gen: null, wait: 0, until: null };
    this.seatBook.clear();
    this.locked.clear();
    this.chat = [];
    this.focusMode = false;
    this.spotlight = null;
    this.spotlightUntil = 0;
    this.elapsed = 0;
    this.approvalSince = null;
    this.gateWaiting = null;

    const seats = new Map<string, Pt[]>();
    for (const room of DEPT_ROOMS) seats.set(room.id, room.desks.map((d) => d.seat));

    for (const seed of STAFF) {
      const pool = seats.get(seed.deptId);
      const home = pool?.shift() ?? { x: ENTRANCE.x, y: ENTRANCE.y - 2 };
      this.spawn(seed, home, { x: ENTRANCE.x, y: ENTRANCE.y });
    }
    this.spawn(CEO, CEO_SEAT, CEO_SEAT);

    const ceo = this.agentById.get("ceo")!;
    ceo.status = "업무 중";
    ceo.anim = "sit";
    ceo.facing = "down";

    for (const room of DEPT_ROOMS) {
      this.deptStatus[room.id] = BLOCKED_DEPTS.has(room.id) ? "연동 대기" : "대기";
    }
    this.pushLog("🎀", "대표실 준비 완료. 출근 버튼을 기다리는 중이에요.", "lav");
    this.pushChat("staff", SECRETARY, `대표님, 비서실장 ${SECRETARY}입니다. 궁금한 건 여기에 바로 물어보세요.`);
  }

  private spawn(seed: StaffSeed, home: Pt, at: Pt) {
    const agent: Agent = {
      ...seed,
      x: at.x,
      y: at.y,
      facing: "down",
      anim: seed.rank === "ceo" ? "sit" : "idle",
      status: seed.rank === "ceo" ? "업무 중" : "출근 전",
      home,
      progress: 0,
      taskLabel: DEPT_BRIEF[seed.deptId]?.task ?? "대표 업무",
      path: [],
      pathIdx: 0,
      blockedFor: 0,
      queue: [],
      current: null,
      timer: 0,
      speech: null,
      speechKind: "talk",
      speechFor: 0,
      idleFor: Math.random() * 8,
      jitter: (Math.random() - 0.5) * 0.28,
    };
    this.agents.push(agent);
    this.agentById.set(agent.id, agent);
  }

  // ── 로그 ────────────────────────────────────────────────
  pushLog(icon: string, text: string, tone = "pink") {
    this.log.unshift({ id: this.logSeq++, time: this.clockText(), icon, text, tone });
    if (this.log.length > 60) this.log.pop();
  }

  clockText() {
    const total = Math.floor(this.clockMinutes) % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // ── 액션 큐 ──────────────────────────────────────────────
  private enqueue(agent: Agent, ...actions: Action[]) {
    agent.queue.push(...actions);
  }

  private goto(agent: Agent, to: Pt, status: AgentStatus = "이동 중") {
    this.enqueue(agent, { k: "status", s: status }, { k: "walk", to });
  }

  private sitAtDesk(agent: Agent) {
    this.enqueue(
      agent,
      { k: "walk", to: agent.home },
      { k: "face", dir: "up" },
      { k: "anim", a: "sit" },
      { k: "status", s: "대기" },
    );
  }

  say(agent: Agent, text: string, dur = 2.6, kind: "talk" | "think" = "talk") {
    agent.speech = text;
    agent.speechKind = kind;
    agent.speechFor = dur;
  }

  /** 장면 시작: 진행 중이던 자율 행동을 끊고 잠근다 */
  private lock(agents: Agent[]) {
    for (const agent of agents) {
      this.locked.add(agent.id);
      agent.queue.length = 0;
      agent.current = null;
      agent.path = [];
      agent.pathIdx = 0;
    }
  }

  private unlock(agents: Agent[]) {
    for (const agent of agents) this.locked.delete(agent.id);
  }

  private busy(agent: Agent) {
    return agent.queue.length > 0 || agent.current !== null;
  }

  private allFree(agents: Agent[]) {
    return () => agents.every((a) => !this.busy(a));
  }

  private deptAgents(deptId: string) {
    return this.agents.filter((a) => a.deptId === deptId && a.rank !== "ceo");
  }

  // ── 하루 시나리오 ─────────────────────────────────────────
  start() {
    if (this.running) return;
    this.reset();
    this.running = true;
    this.main.gen = this.dayScript();
  }

  private *dayScript(): Generator<number | (() => boolean), void, void> {
    // ① 07:00 출근
    this.phaseIndex = 1;
    this.pushLog("🚪", `07:00 자동 출근을 시작합니다. AI 직원 ${STAFF.length}명 입장!`, "yellow");
    const workers = this.agents.filter((a) => a.rank !== "ceo");
    this.lock(workers);
    for (const agent of workers) {
      this.enqueue(
        agent,
        { k: "status", s: "출근 중" },
        { k: "wait", dur: Math.random() * 6 },
        { k: "fn", fn: () => this.say(agent, rand(["좋은 아침이에요!", "출근합니다 ✨", "오늘도 화이팅!", "커피부터…"]), 2.4) },
        { k: "walk", to: agent.home },
        { k: "face", dir: "up" },
        { k: "anim", a: "sit" },
        { k: "status", s: "대기" },
      );
    }
    yield this.allFree(workers);
    this.unlock(workers);
    this.pushLog("✅", "전원 착석 완료. 오늘 업무를 시작합니다.", "mint");
    yield 0.6;

    const seri = this.agentById.get("secretary-lead")!;
    this.stand(seri);
    this.say(seri, "대표님, 오늘 업무 시작합니다.", 2.6);
    yield 1.6;
    this.sitAtDesk(seri);

    // ② 시장조사
    yield* this.gate(2);
    this.phaseIndex = 2;
    yield* this.runDept("research", "트렌드·행사 확인 → 계정 성과 비교 → 조회수×썸네일 분석", 6.5, "비교 계정이랑 썸네일까지 정리했어요.");

    // ② 브랜드 분석 — 시장조사팀이 같이 맡음. 08:50 인스타 API 파일로 하고, 파일이 없으면 만들지 않는다
    const researcher = this.agentById.get("research-lead")!;
    this.stand(researcher);
    this.say(researcher, "인스타 숫자로 브랜드 분석했어요. 없는 숫자는 미확인이에요.", 3);
    this.pushLog("🧬", "브랜드 분석(시장조사팀): 08:50 인스타 API 파일(좋아요·팔로워·조회수) 기준 — 파일이 없으면 분석하지 않고 '인스타 숫자 없음'으로 기록", "lav");
    yield 1.8;
    this.sitAtDesk(researcher);

    // ③ 전체 성과 회의 — 성과 리뷰실 주재, 팀장 전원 + 후킹 전담. 시장조사 결과 공유도 여기서
    yield* this.gate(3);
    this.phaseIndex = 3;
    this.deptStatus.review = "진행 중";
    const reviewer = this.agentById.get("review-lead")!;
    this.stand(reviewer);
    this.say(reviewer, "인스타 숫자부터 볼게요. 좋아요 수부터 확인해볼게요.", 3);
    this.pushLog("📈", "성과 리뷰실: 인스타 API 파일(좋아요·팔로워·조회수) 먼저, 드라이브 '성과' 캡처는 보조로 확인 → 노션 '게시물 성과'에 기록 (없으면 '새 수치 없음')", "lav");
    yield 1.8;
    const hookIds = STAFF.filter((st) => st.deptId === "strategy2" && st.rank === "member").map((st) => st.id);
    yield* this.meeting(
      "전체 성과 회의",
      [...DEPT_ROOMS.map((room) => DEPT_LEAD[room.id].id), ...hookIds],
      [
        ["review-lead", "좋아요·팔로워·조회수부터 볼게요. 새 수치가 없으면 없다고 할게요."],
        ["review-lead", "반복할 점 하나, 바꿀 점 하나 정리했어요."],
        ["research-lead", "오늘 조사 결과 공유드려요. 미확인은 표시해뒀어요."],
        ["strategy1-lead", "성과 근거 붙여서 아이디어 10개 만들게요."],
        ["qa-lead", "'바꿀 점'이 반복되면 수정 요청할게요."],
        ["strategy2-lead", "아~ 반응 좋았던 표현은 문구에 살릴게요."],
        ...hookIds.map((id) => [id, "반응 좋았던 첫 1초, 후킹 3안에 살릴게요."] as [string, string]),
        ["reels-lead", "반응 좋았던 장면 순서, 편집에 살려보겠습니다."],
        ["carousel-lead", "사진 순서도 성과 보고 맞춰보겠습니다."],
        ["finance-lead", "광고비·판매랑 이어서 볼 건 일요일 정산에 넣을게요."],
        ["secretary-lead", "회의 요약은 대표님 브리핑에 넣겠습니다."],
      ],
    );
    this.deptStatus.review = "완료";
    this.pushLog("📈", "전체 성과 회의 완료 — 전 부서가 성과를 공유하고 반영할 점을 한 줄씩 정했어요", "mint");

    // ④ 아이디어 10개
    yield* this.gate(4);
    this.phaseIndex = 4;
    yield* this.runDept("strategy1", "성과 회의 근거로 아이디어 10개 · 100점 채점", 7, this.ceoOpinions.length ? "대표님 의견까지 반영해서 10개 넘겼어요." : "성과 근거 달아서 10개 넘겼어요.");

    // ⑥ 브랜드 QA
    yield* this.gate(5);
    this.phaseIndex = 5;
    yield* this.runDept("qa", "브랜드명 표기·가격·중복·금칙어 검사", 5.5, "검수 끝났어요. 반려 사유 적어뒀어요.");
    this.pushLog("🛡️", "브랜드 검수: 통과·반려 건수와 사유를 기록했어요.", "lav");

    // ⑦ TOP 3 선정
    yield* this.gate(6);
    this.phaseIndex = 6;
    const areum = this.agentById.get("strategy1-lead")!;
    this.stand(areum);
    this.say(areum, "검수 통과한 안에서 TOP 3 정리했어요.", 3);
    this.pushLog("💡", "기획 1팀: TOP 3 확정 (릴스·캐러셀 후보 포함)", "pink");
    yield 1.8;
    this.sitAtDesk(areum);

    // ⑧ 대표 승인 회의
    yield* this.gate(7);
    this.phaseIndex = 7;
    this.deptStatus.strategy2 = "승인 대기";
    this.approvalPending = true;
    this.turbo = false; // 대표 결정 지점에서는 즉시 정상 속도로 돌아온다
    this.meetingTitle = "TOP 3 대표 승인";
    this.pushLog("📋", "대표 승인 대기: 오늘 결정할 안건 1개가 회의실에 올라왔어요.", "yellow");

    const approvers = ["research-lead", "strategy1-lead", "qa-lead"].map((id) => this.agentById.get(id)!);
    const ceo = this.agentById.get("ceo")!;
    this.lock([...approvers, ceo]);
    approvers.forEach((agent, i) => {
      this.stand(agent);
      const seat = this.bookSeat(agent, i);
      this.goto(agent, seat, "회의 중");
      this.enqueue(agent, { k: "face", dir: seat.y < 7 ? "down" : "up" }, { k: "anim", a: "sit" });
    });
    const ceoSeat = this.bookSeat(ceo, 3);
    this.enqueue(
      ceo,
      { k: "anim", a: "idle" },
      { k: "status", s: "회의 중" },
      { k: "walk", to: ceoSeat },
      { k: "face", dir: ceoSeat.y < 7 ? "down" : "up" },
      { k: "anim", a: "sit" },
    );
    yield this.allFree([...approvers, ceo]);

    this.say(approvers[0], "TOP 3 올립니다. 점수와 이유 같이 적었어요.", 3.4);
    yield 2.4;
    this.say(approvers[2], "대표님, 제작할 안 하나만 골라주세요.", 3.2);
    yield 2.2;
    this.say(ceo, "확인해볼게요.", 2.4);

    // 대표가 승인 버튼을 누를 때까지 대기 — 실제 업무가 이미 대본 단계(8) 이후면 실제로 결정된 것이라 바로 넘어간다
    yield () => this.approved || (this.realGate !== null && this.realGate >= 8);
    this.approved = true;

    this.approvalPending = false;
    this.meetingTitle = null;
    this.say(ceo, "승인! 이대로 갑시다.", 2.8);
    this.pushLog("✅", "대표 승인 완료 — TOP 1 콘텐츠 제작을 시작합니다.", "mint");
    yield 1.6;
    for (const agent of approvers) {
      this.releaseSeat(agent);
      this.stand(agent);
      this.sitAtDesk(agent);
    }
    this.releaseSeat(ceo);
    this.enqueue(ceo, { k: "anim", a: "idle" }, { k: "walk", to: CEO_SEAT }, { k: "face", dir: "down" }, { k: "anim", a: "sit" }, { k: "status", s: "업무 중" });
    yield this.allFree([...approvers, ceo]);
    this.unlock([...approvers, ceo]);

    // ⑨ 대본 작성
    yield* this.gate(8);
    this.phaseIndex = 8;
    yield* this.runDept("strategy2", "릴스 대본·캐러셀 문구 작성", 7, "대본 2종 썼어요. 대표님 최종 확인 부탁드려요.");

    // ⑩ 제작 인수인계 → 릴스·캐러셀 동시 작업
    yield* this.gate(9);
    this.phaseIndex = 9;
    // 후킹 전담(기획 2팀 팀원)이 첫 1~3초 후킹 3안을 붙여 제작팀에 전달 — 없으면 팀장이 전달
    const hooker = STAFF.find((s) => s.deptId === "strategy2" && s.rank === "member");
    const courier = hooker?.id ?? "strategy2-lead";
    if (hooker) {
      const h = this.agentById.get(hooker.id);
      if (h) this.say(h, "후킹 3안 붙였어요. 추천안은 이유도 달았어요.", 3);
      this.pushLog("🪝", `${hooker.name}: 릴스 첫 1~3초·캐러셀 첫 장 후킹 3안 작성 → 제작팀 전달`, "yellow");
      yield 1.6;
    }
    yield* this.deliver(courier, "reels", "확정 대본이랑 대표님이 고르신 후킹이에요. 첫 1초는 이걸로 가요.", "장면 순서 한 번만 확인 부탁드립니다.");
    yield* this.deliver(courier, "carousel", "캐러셀 문구랑 대표님이 고르신 첫 장 문구예요.", "확정된 가격만 알려주시길 부탁드립니다.");

    this.startDept("reels", "media/ 원본 복제 → 릴스 편집", 8);
    this.startDept("carousel", "원본 사진 복제 → 캐러셀 제작", 8);
    // 상품관리팀(2026-10-01 신설): 신상품 등록 묶음 점검 — 제작과 함께 진행
    if (DEPT_LEAD.product) this.startDept("product", "신상품 등록 묶음 점검", 6);
    yield () =>
      this.deptStatus.reels === "완료" &&
      this.deptStatus.carousel === "완료" &&
      (!DEPT_LEAD.product || this.deptStatus.product === "완료");
    this.pushLog("🎬", "릴스 편집본 · 캐러셀 이미지 제작 완료 (원본은 그대로 보존)", "mint");

    // ⑩ 결과물 저장 — 제작팀
    yield* this.gate(10);
    this.phaseIndex = 10;
    this.pushLog("📦", "제작팀: 오늘 결과물을 media/·scripts/ 에 새 파일로 저장했어요", "mint");
    yield 1.2;

    // ⑪ 브리핑 직전 — 정산팀이 드라이브 새 파일 확인 → 비서실에 전달 (없으면 "없습니다")
    const finance = this.agentById.get("finance-lead")!;
    this.deptStatus.finance = "진행 중";
    this.stand(finance);
    this.say(finance, "드라이브 정산 폴더 확인했습니다. 비서실에 넘길게요.", 3);
    this.pushLog("🧾", "정산팀: 드라이브 '정산' 폴더 새 파일 확인 → 비서실 전달 (새 파일이 없으면 '없습니다')", "lav");
    yield* this.deliver("finance-lead", "secretary", "오늘 정산 확인 결과예요. 없으면 '없습니다'로 넣어주세요.", "네, 브리핑에 넣겠습니다.");
    this.deptStatus.finance = "완료";

    // ⑪ 직전 — 전체 회의: 내일 촬영 주제 (대표 결정 2026-10-01). 비서실장 주재, 대표 의견 시간 포함
    const hookIds2 = STAFF.filter((st) => st.deptId === "strategy2" && st.rank === "member").map((st) => st.id);
    yield* this.meeting(
      "내일 촬영 주제 회의",
      [...DEPT_ROOMS.map((room) => DEPT_LEAD[room.id].id), ...hookIds2],
      [
        ["secretary-lead", "마지막 보고 전에 내일 뭘 찍을지 같이 정하겠습니다."],
        ["review-lead", "이번 주 릴스 몇 개 남았는지, 반응 좋았던 장면부터 말씀드릴게요."],
        ["research-lead", "요즘 유행 디자인·색 중에 내일 찍을 만한 걸 골라왔어요."],
        ["strategy1-lead", "촬영 가능한 후보 2~3개로 좁혔어요. 재료·몰드 있는지 확인 부탁드려요."],
        ["strategy2-lead", "아~ 정해지면 장면 순서랑 캡션 방향 바로 잡을게요."],
        ...hookIds2.map((id) => [id, "첫 1초 장면을 촬영 리스트 맨 위에 넣을게요."] as [string, string]),
        ["reels-lead", "굳는 시간 있으면 오늘 밤·내일로 나눠서 촬영 리스트 짤게요."],
        ["carousel-lead", "주말 게시물 사진이 필요하면 같이 적겠습니다."],
        ["finance-lead", "필요한 재료 중 주문할 게 있으면 바로 말씀드릴게요."],
      ],
    );
    this.pushLog("🎥", "내일 촬영 주제 회의 완료 — 촬영 리스트(scripts/<내일>_shotlist.md)를 마지막 보고에 붙여요", "mint");

    // ⑪ 비서실 브리핑 (성과 회의·정산 한 줄 포함)
    yield* this.gate(11);
    this.phaseIndex = 11;
    this.lock([seri]);
    this.stand(seri);
    this.say(seri, "전사 보고 취합했어요. 대표님께 갑니다.", 3);
    this.goto(seri, CEO_REPORT_SPOT, "보고 중");
    this.enqueue(seri, { k: "face", dir: "up" });
    yield this.allFree([seri]);
    this.say(seri, "대표님, 오늘 결정할 건 이제 없어요.", 3.2);
    this.say(ceo, "고생했어요 ✨", 2.6);
    this.deptStatus.secretary = "완료";
    this.briefingReady = true;
    this.onBriefing?.();
    const stats = this.snapshot().stats;
    this.pushLog("📋", `${SECRETARY} 비서실장 최종 브리핑 완료 — 완료 ${stats.done}팀 · 연동 대기 ${stats.blocked}팀`, "pink");
    yield 3;
    this.stand(seri);
    this.sitAtDesk(seri);
    yield this.allFree([seri]);
    this.unlock([seri]);

    yield* this.gate(12);
    this.phaseIndex = 12;
    this.dayComplete = true;
    this.running = false;
    this.pushLog("🎀", "오늘 업무 종료. 직원들이 라운지로 이동합니다.", "yellow");

    for (const agent of workers) {
      if (Math.random() < 0.45) {
        this.stand(agent);
        this.goto(agent, rand(LOUNGE_ROOM.loiter), "휴식");
      }
    }
  }

  /** 부서 업무 시작(비동기) */
  private startDept(deptId: string, label: string, dur: number) {
    this.deptStatus[deptId] = "진행 중";
    const crew = this.deptAgents(deptId);
    this.lock(crew);
    this.pushLog(roomOf(deptId).icon, `${roomOf(deptId).name} 업무 시작 — ${label}`, "pink");
    crew.forEach((agent, i) => {
      this.enqueue(
        agent,
        { k: "wait", dur: i * 0.35 },
        { k: "walk", to: agent.home },
        { k: "face", dir: "up" },
        { k: "status", s: "업무 중" },
        { k: "work", dur: dur + Math.random() * 1.5, label },
        { k: "anim", a: "sit" },
        { k: "status", s: "대기" },
        { k: "fn", fn: () => this.finishDept(deptId) },
      );
    });
  }

  private finishDept(deptId: string) {
    if (this.deptAgents(deptId).some((a) => a.status === "업무 중")) return;
    if (this.deptStatus[deptId] === "완료") return;
    this.deptStatus[deptId] = "완료";
    this.unlock(this.deptAgents(deptId));
    const lead = DEPT_LEAD[deptId];
    const agent = lead ? this.agentById.get(lead.id) : null;
    if (agent) this.say(agent, "완료했어요!", 2.4);
    this.pushLog(roomOf(deptId).icon, `${roomOf(deptId).name} 완료 — ${DEPT_BRIEF[deptId].report}`, "mint");
  }

  private *runDept(deptId: string, label: string, dur: number, report: string) {
    this.startDept(deptId, label, dur);
    yield () => this.deptStatus[deptId] === "완료";
    const lead = this.agentById.get(DEPT_LEAD[deptId].id);
    if (lead) this.say(lead, report, 3.2);
    yield 1.2;
  }

  /** 회의: 참석자 소집 → 대사 → 자리 복귀 */
  private *meeting(title: string, ids: string[], lines: [string, string][], withCeo = true) {
    this.meetingTitle = title;
    this.pushLog("💬", `회의 소집: ${title} (${ids.length}명)`, "lav");
    const crew = ids.map((id) => this.agentById.get(id)!);
    this.lock(crew);
    // 대표도 회의에 참석한다 — 다른 장면(결재 등)에 묶여 있으면 빠진다
    const ceo = this.agentById.get("ceo")!;
    const ceoJoins = withCeo && !this.locked.has(ceo.id);
    if (ceoJoins) {
      this.lock([ceo]);
      this.releaseSeat(ceo);
      this.stand(ceo);
      this.say(ceo, "저도 들어갈게요~", 2);
      const ceoSeat = this.bookCeoSeat(ceo);
      this.enqueue(
        ceo,
        { k: "status", s: "회의 중" },
        { k: "walk", to: ceoSeat },
        { k: "face", dir: ceoSeat.x < 31 ? "right" : ceoSeat.x > 40 ? "left" : ceoSeat.y < 7 ? "down" : "up" },
        { k: "anim", a: "sit" },
      );
      this.pushLog("🎀", `${CEO.name} 대표 회의 참석: ${title}`, "pink");
    }
    crew.forEach((agent, i) => {
      this.stand(agent);
      this.say(agent, "회의실로 갈게요.", 2);
      const seat = this.bookSeat(agent, i);
      this.goto(agent, seat, "회의 중");
      this.enqueue(
        agent,
        { k: "face", dir: seat.x < 31 ? "right" : seat.x > 40 ? "left" : seat.y < 7 ? "down" : "up" },
        { k: "anim", a: "sit" },
        { k: "status", s: "회의 중" },
      );
    });
    yield this.allFree(ceoJoins ? [...crew, ceo] : crew);
    yield 0.6;
    if (ceoJoins) {
      ceo.anim = "talk";
      this.say(ceo, rand(["자, 시작해봐요~", "한 줄씩 들어볼게요~", "다들 모였죠? 가봅시다~"]), 2.6);
      yield 1.8;
      ceo.anim = "sit";
    }

    for (const [id, text] of lines) {
      const speaker = this.agentById.get(id)!;
      speaker.anim = "talk";
      this.say(speaker, text, 3.2);
      this.pushLog("🗣️", `${speaker.name}: “${text}”`, "lav");
      yield 2.3;
      speaker.anim = "sit";
    }

    // ★ 대표 의견 시간 — 지시창에 의견을 쓰거나 "의견 없음"을 누를 때까지 회의가 멈춘다
    let heardOpinion = false;
    // 실제 업무가 이미 이 단계를 지났으면(예: 오후에 업무 시작) 지난 회의에서 대표 의견을 기다리지 않는다 — 화면이 멈추지 않게
    const pastInReal = this.realGate !== null && this.realGate > this.phaseIndex;
    if (ceoJoins && !pastInReal) {
      const host = this.agentById.get(lines[0]?.[0] ?? DEPT_LEAD.secretary.id)!;
      host.anim = "talk";
      this.say(host, "대표님, 의견 있으시면 말씀해주세요!", 4);
      host.anim = "sit";
      const before = this.ceoOpinions.length;
      this.opinionOpen = true;
      this.turbo = false;
      this.pushChat("staff", `${host.name} · ${title}`, "대표님 의견 시간입니다. 지시창에 의견을 적어주시면 회의에 바로 반영할게요. 없으시면 ‘의견 없음’을 눌러주세요.");
      this.pushLog("🎤", `${title}: 대표 의견 시간 — 대표님 답을 기다리는 중`, "yellow");
      yield () => !this.opinionOpen;
      heardOpinion = this.ceoOpinions.length > before;
      yield 1.2;
    }

    if (ceoJoins) {
      ceo.anim = "talk";
      this.say(ceo, heardOpinion ? "제 의견까지 넣어서 진행해줘요~" : rand(["좋아요, 이대로 가요!", "오케이~ 다들 고생했어요", "좋다! 오늘도 잘 부탁해요~"]), 2.6);
      yield 1.8;
    }
    yield 0.8;
    for (const agent of crew) {
      this.releaseSeat(agent);
      this.stand(agent);
      this.sitAtDesk(agent);
    }
    if (ceoJoins) {
      this.releaseSeat(ceo);
      this.stand(ceo);
      this.enqueue(ceo, { k: "walk", to: CEO_SEAT }, { k: "face", dir: "down" }, { k: "anim", a: "sit" }, { k: "status", s: "업무 중" });
    }
    this.meetingTitle = null;
    yield this.allFree(ceoJoins ? [...crew, ceo] : crew);
    this.unlock(ceoJoins ? [...crew, ceo] : crew);
  }

  /** 대표는 테이블 머리(왼쪽 끝) 자리부터 앉는다 */
  private bookCeoSeat(ceo: Agent): Pt {
    const taken = new Set([...this.seatBook.values()].map((p) => `${p.x},${p.y}`));
    const seat = [MEETING_SEATS[8], MEETING_SEATS[9], ...EXTRA_SEATS].find((p) => p && !taken.has(`${p.x},${p.y}`)) ?? MEETING_SEATS[8];
    this.seatBook.set(ceo.id, seat);
    return seat;
  }

  /** 부서 간 전달 — 직접 걸어가서 말하고 돌아온다 */
  private *deliver(fromId: string, toDeptId: string, line: string, reply: string) {
    const from = this.agentById.get(fromId)!;
    const toLead = this.agentById.get(DEPT_LEAD[toDeptId].id)!;
    const room = roomOf(toDeptId);
    const spot = { x: toLead.home.x, y: Math.min(toLead.home.y + 2, room.y + room.h - 2) };

    this.lock([from, toLead]);
    this.stand(from);
    this.goto(from, walkable(spot.x, spot.y) ? spot : doorApproach(room), "이동 중");
    yield this.allFree([from]);
    from.anim = "talk";
    this.say(from, line, 3);
    this.pushLog("🤝", `${from.name} → ${room.name}: “${line}”`, "pink");
    yield 2;
    this.say(toLead, reply, 2.8);
    yield 1.6;
    from.anim = "idle";
    this.sitAtDesk(from);
    yield this.allFree([from]);
    this.unlock([from, toLead]);
  }

  private stand(agent: Agent) {
    agent.anim = "idle";
    agent.progress = 0;
  }

  /** 테이블을 사이에 두고 마주보도록 위·아래 줄을 번갈아 배정한다 */
  private bookSeat(agent: Agent, preferred: number): Pt {
    const zigzag = [0, 4, 1, 5, 2, 6, 3, 7, 8, 9];
    const taken = new Set([...this.seatBook.values()].map((p) => `${p.x},${p.y}`));
    const order = [zigzag[preferred % zigzag.length], ...zigzag];
    for (const i of order) {
      const seat = MEETING_SEATS[i % MEETING_SEATS.length];
      if (!taken.has(`${seat.x},${seat.y}`)) {
        this.seatBook.set(agent.id, seat);
        return seat;
      }
    }
    // 10자리가 다 차면 테이블 옆 보조석
    const extra = EXTRA_SEATS.find((p) => !taken.has(`${p.x},${p.y}`));
    if (extra) {
      this.seatBook.set(agent.id, extra);
      return extra;
    }
    return MEETING_SEATS[0];
  }

  private releaseSeat(agent: Agent) {
    this.seatBook.delete(agent.id);
  }

  // ── 대표 지시창 ──────────────────────────────────────────
  pushChat(from: "ceo" | "staff", name: string, text: string, time?: string) {
    // 실제 업무 모드에서는 화면 속 시계가 아니라 실제 시각(KST)을 찍는다
    const stamp = time ?? (this.realMode ? kstNow() : this.clockText());
    this.chat.push({ id: this.logSeq++, time: stamp, from, name, text });
    if (this.chat.length > 60) this.chat.shift();
  }

  /** 지시창에 들어온 한 줄을 해석해 보고하거나 실제로 지시를 실행한다 */
  command(raw: string, echo = true) {
    const text = raw.trim();
    if (!text) return;
    if (echo) this.pushChat("ceo", CEO.name, text);
    const q = text.toLowerCase();

    // ⓪ 회의 중 대표 의견 시간 — 이때 들어온 말은 지시가 아니라 의견으로 받는다
    if (this.opinionOpen) return this.takeOpinion(text);

    // ⓪ 대표 순찰 — "순찰 돌아", "기획 2팀 둘러봐"
    if (/순찰|돌아보|둘러|한 바퀴|돌아다|체크하러/.test(text)) {
      return this.patrolNow(this.matchDept(text));
    }

    // ⓪ 팀원 지목 — "다솜님 반영해줘", "후킹 어디까지?"
    const member = this.matchMember(text);
    if (member && !/전체|모두|다들/.test(text)) return this.memberReport(member, text);

    // ① 특정 부서·직원 지목
    const deptId = this.matchDept(text);
    if (deptId && !/전체|모두|다들/.test(text)) {
      this.deptReport(deptId, text);
      return;
    }

    // ② 지시(실제로 동작하는 명령)
    if (/집중|커피 ?금지|딴짓|자리 지켜/.test(text)) return this.setFocusMode(true);
    if (/자유|쉬어|휴식 허용|집중 해제/.test(text)) return this.setFocusMode(false);
    if (/자리로|복귀|착석/.test(text)) return this.recallAll();
    if (/빨리|서둘|속도|급해|당겨/.test(text)) return this.boost();
    if (/회의|모여|소집/.test(text)) return this.convene();
    if (/브리핑|보고하러|올라와/.test(text)) return this.briefNow();
    if (/승인|오케이|고고|진행해/.test(text) && this.approvalPending) {
      this.approve();
      this.pushChat("staff", SECRETARY, "승인 접수했습니다. 제작팀에 바로 넘길게요.");
      return;
    }
    if (/수고|칭찬|잘했|좋아요|고마/.test(text)) return this.cheer();

    // ③ 질문(보고)
    if (/왜|늦|지연|막힘|블로|안 되|안돼|문제/.test(text)) return this.reportDelay();
    if (/뭐|현황|상황|진행|보고|어디까지|status/.test(q)) return this.reportStatus();

    this.pushChat(
      "staff",
      SECRETARY,
      "이렇게 물어보시면 제일 빨라요 — “현황 보고” / “왜 늦어져?” / “시장조사팀 뭐해?” / “다솜님 반영해줘” / “순찰 돌아” / “회의 소집” / “집중 모드” / “지금 브리핑”.",
    );
  }

  // ── 자연스러운 대화 (페이지가 Claude에게 받은 답을 화면에 옮긴다) ─────────
  /** 이름(또는 호칭)으로 직원 찾기. 못 찾으면 비서실장 */
  findAgent(name: string): Agent {
    const n = name.replace(/\s|님$/g, "");
    return (
      this.agents.find((a) => a.name === n || a.callsign?.replace(/님$/, "") === n || n.includes(a.name)) ??
      this.agentById.get(DEPT_LEAD.secretary.id)!
    );
  }

  /** 회의 중 대표 의견 기록 (대화형 답과 함께 쓴다). "의견 없음"이면 그냥 닫는다 */
  recordOpinion(text: string) {
    if (!this.opinionOpen) return;
    if (!/^(의견 ?없음|없어|없어요|패스|넘어가|계속 ?진행|괜찮아)/.test(text.trim())) {
      this.ceoOpinions.push({ meeting: this.meetingTitle ?? "회의", text });
      this.pushLog("📝", `${this.meetingTitle ?? "회의"} — 대표 의견: “${text}”`, "pink");
    }
    if (this.canCloseOpinion()) this.opinionOpen = false;
  }

  /** 아침 성과 회의(실제 3단계)의 의견 시간은 Claude가 다음 단계로 넘어갈 때 닫는다.
   *  실제 업무가 이미 그 뒤라면(긴급 소집 회의 등) 대표 답으로 바로 닫는다 — 안 그러면 '지시 처리 중'에 멈춘다 */
  private canCloseOpinion() {
    return this.realGate === null || this.realGate >= 4;
  }

  /** 대표가 말한 한 줄을 지시창에 남긴다 (답은 speakAs 로 따로 온다) */
  ceoSays(text: string) {
    this.pushChat("ceo", CEO.name, text);
  }

  /** 해당 직원이 말풍선과 지시창으로 답한다 */
  speakAs(name: string, text: string) {
    const agent = this.findAgent(name);
    const label = agent.rank === "ceo" ? CEO.name : `${agent.name} · ${roomOf(agent.deptId).name}`;
    this.pushChat("staff", label, text);
    if (agent.status !== "출근 전") {
      this.say(agent, text.length > 34 ? text.slice(0, 32) + "…" : text, 4);
      if (!this.locked.has(agent.id) && !this.busy(agent)) agent.anim = "talk";
      if (agent.rank !== "ceo") this.spotlightRoom(agent.deptId, 6);
    }
  }

  /** 대화 중 나온 실제 동작 (집중 모드·소집·순찰 등) */
  act(action: string, dept?: string | null) {
    switch (action) {
      case "focus_on": return this.setFocusMode(true);
      case "focus_off": return this.setFocusMode(false);
      case "recall": return this.recallAll(true);
      case "boost": return this.boost();
      case "convene": return this.convene();
      case "brief": return this.briefNow();
      case "patrol": return this.running ? this.patrolNow(dept && DEPT_LEAD[dept] ? dept : null) : undefined;
      case "cheer": return this.cheer();
      case "opinion_done":
        if (this.opinionOpen && this.canCloseOpinion()) this.opinionOpen = false;
        return;
      default: return;
    }
  }

  /** 대화에 넣을 지금 사무실 상황 요약 */
  describe(): string {
    const phase = PHASES[this.phaseIndex] ?? "";
    const lines = [
      `시계 ${this.clockText()} · 단계 ${phase}${this.meetingTitle ? ` · 회의 중(${this.meetingTitle})` : ""}${this.approvalPending ? " · TOP 3 대표 결재 대기" : ""}${this.opinionOpen ? " · 회의 중 대표 의견 시간" : ""}${this.focusMode ? " · 집중 모드" : ""}${this.gateWaiting !== null ? ` · 실제 업무 대기: ${this.gateWaitLine()}` : ""}`,
      `부서 상태: ${Object.entries(this.deptStatus).map(([d, st]) => `${roomOf(d).name} ${st}`).join(", ")}`,
      `직원 지금: ${this.agents.filter((a) => a.rank !== "ceo").map((a) => `${a.name}(${a.status}${a.status === "업무 중" ? ": " + a.taskLabel : ""})`).join(", ")}`,
    ];
    if (this.ceoOpinions.length) lines.push(`오늘 대표 의견: ${this.ceoOpinions.map((o) => o.text).join(" / ")}`);
    return lines.join("\n");
  }

  /** 회의 중 대표 의견 받기 — 해당 부서 팀장(없으면 회의 주재자)이 받아서 반영을 약속한다 */
  private takeOpinion(text: string) {
    const meeting = this.meetingTitle ?? "회의";
    if (/^(의견 ?없음|없어|없어요|패스|넘어가|계속 ?진행|괜찮아)/.test(text.trim())) {
      this.opinionOpen = false;
      this.pushChat("staff", SECRETARY, "네, 의견 없이 회의 마무리하겠습니다.");
      this.pushLog("🎤", `${meeting}: 대표 의견 없음`, "yellow");
      return;
    }
    this.ceoOpinions.push({ meeting, text });
    const dept = this.matchDept(text);
    const listener = this.agentById.get(DEPT_LEAD[dept ?? "secretary"].id)!;
    listener.anim = "talk";
    this.say(listener, "네 대표님, 반영하겠습니다!", 3);
    this.pushChat(
      "staff",
      `${listener.name} · ${roomOf(listener.deptId).name}`,
      `대표님 의견 받았습니다: “${text}”\n${dept ? "저희 팀 오늘 작업에" : "회의록과 오늘 아이디어·브리핑에"} 반영하겠습니다.`,
    );
    this.pushLog("📝", `${meeting} — 대표 의견: “${text}” → ${listener.name} 반영`, "pink");
    this.opinionOpen = false;
  }

  // ── 보고 ────────────────────────────────────────────────
  private reportStatus() {
    if (!this.running && !this.dayComplete) {
      this.pushChat("staff", SECRETARY, "아직 출근 전이에요. ‘오늘 업무 시작하기’를 눌러주시면 전원 출근합니다.");
      return;
    }
    const working = this.workingDepts();
    const lines: string[] = [`지금 ${this.clockText()} · ‘${PHASES[this.phaseIndex]}’ 단계입니다.`];

    if (working.length) {
      lines.push(`진행 중: ${working.map((d) => `${roomOf(d).name} ${this.deptProgress(d)}%`).join(" · ")}`);
    } else if (this.approvalPending) {
      lines.push("전 부서가 대표님 결재를 기다리는 중입니다.");
    } else if (this.dayComplete) {
      lines.push("오늘 업무는 모두 끝났어요.");
    } else if (this.meetingTitle) {
      lines.push(`회의 진행 중 — ${this.meetingTitle}`);
    } else if (this.gateWaiting !== null) {
      lines.push(this.gateWaitLine());
    } else {
      lines.push("지금은 앞 단계 결과를 넘기는 중이라 잠깐 비어 있어요. 곧 다음 팀이 붙습니다.");
    }

    const stats = this.snapshot().stats;
    lines.push(`완료 ${stats.done}팀 · 연동 대기 ${stats.blocked}팀 · 근무 인원 ${this.onDutyCount()}명.`);
    const next = PHASES[this.phaseIndex + 1];
    if (next && !this.dayComplete) lines.push(`다음 순서는 ‘${next}’입니다.`);

    this.pushChat("staff", SECRETARY, lines.join("\n"));
    this.speakSecretary("현황 정리해서 올렸어요.");
  }

  /** 실제 업무 대기 중일 때 무엇을 기다리는지 한 줄로 */
  private gateWaitLine() {
    const n = this.gateWaiting ?? this.phaseIndex + 1;
    if (n >= 11) {
      return `화면 속 오늘 일은 다 끝났어요. ‘${PHASES[n]}’은 실제 업무 끝 보고(노션 업무 보고·내일 촬영 리스트)가 올라가면 넘어가요. 마치실 때 “업무 끝”이라고 말씀해 주세요.`;
    }
    return `화면 속 일은 끝났고, 실제 업무가 ‘${PHASES[n]}’ 단계에 오면 바로 넘어가요. 멈춘 게 아니라 기다리는 중이에요.`;
  }

  private reportDelay() {
    const lines: string[] = [];
    if (this.gateWaiting !== null) lines.push(this.gateWaitLine());

    if (this.approvalPending) {
      const waited = Math.max(1, Math.round(this.elapsed - (this.approvalSince ?? this.elapsed)));
      lines.push(
        `원인은 하나예요 — 대표님 결재 대기입니다. 회의실에서 ${APPROVERS_LABEL}이(가) ${waited}초째 기다리고 있어요.`,
      );
      lines.push("승인만 눌러주시면 바로 대본 작성으로 넘어갑니다.");
    }

    const working = this.workingDepts();
    for (const dept of working) {
      lines.push(`${roomOf(dept).name}: ${this.deptTaskLabel(dept)} — 진행률 ${this.deptProgress(dept)}%. 정상 속도예요.`);
    }

    const blocked = Object.entries(this.deptStatus)
      .filter(([, s]) => s === "연동 대기")
      .map(([dept]) => dept);
    if (blocked.length) {
      if (lines.length) {
        // 이미 진짜 병목을 짚었으면 연동 대기는 한 줄로 요약한다
        lines.push(`그 외 연동 대기 ${blocked.length}팀(${blocked.map((d) => roomOf(d).name).join("·")})은 외부 연결 문제라 오늘 진행이 어려워요.`);
      } else {
        for (const dept of blocked) {
          lines.push(`${roomOf(dept).name}: ${BLOCK_REASON[dept] ?? "외부 연동 대기 중이에요."}`);
        }
      }
    }

    const away = this.agents.filter((a) => a.status === "휴식").length;
    if (away) lines.push(`참고로 지금 ${away}명이 라운지에 있어요. ‘집중 모드’라고 하시면 전원 자리로 붙입니다.`);

    if (!lines.length) {
      lines.push(
        this.running ? "지연 없습니다. 대기 중인 병목도 없어요." : "아직 출근 전이라 진행할 업무가 없어요.",
      );
    }
    this.pushChat("staff", SECRETARY, lines.join("\n"));
    this.speakSecretary("지연 사유 보고드렸어요.");
  }

  private deptReport(deptId: string, question: string) {
    const room = roomOf(deptId);
    const lead = this.agentById.get(DEPT_LEAD[deptId].id)!;
    const status = this.deptStatus[deptId];
    const crew = this.deptAgents(deptId);
    const lines: string[] = [];

    if (status === "진행 중") {
      lines.push(`${this.deptTaskLabel(deptId)} 작업 중이에요. 진행률 ${this.deptProgress(deptId)}%.`);
    } else if (status === "완료") {
      lines.push(`오늘 몫은 끝냈어요. ${DEPT_BRIEF[deptId].report}`);
    } else if (status === "연동 대기") {
      lines.push(BLOCK_REASON[deptId] ?? "외부 연동을 기다리는 중이에요.");
    } else if (status === "승인 대기") {
      lines.push("대표님 결재를 기다리는 중입니다. 승인 주시면 바로 움직여요.");
    } else {
      lines.push(WAIT_LINE[deptId] ?? `앞 단계 결과를 기다리는 중이에요. 오늘 제 일은 ‘${DEPT_BRIEF[deptId].task}’입니다.`);
    }
    lines.push(`팀원 현황: ${crew.map((a) => `${a.name}(${a.status})`).join(" · ")}`);
    if (/왜|늦|지연/.test(question) && status === "대기") {
      lines.push("저희가 늦는 게 아니라 앞 팀 산출물이 아직 안 왔어요.");
    }

    this.pushChat("staff", `${lead.name} · ${room.name}`, lines.join("\n"));
    this.say(lead, "대표님, 보고드릴게요!", 3);
    lead.anim = "talk";
    this.spotlightRoom(deptId, 8);
    this.pushLog("🎤", `대표 지시: ${room.name} 상황 확인`, "yellow");
  }

  // ── 지시 실행 ────────────────────────────────────────────
  private setFocusMode(on: boolean) {
    this.focusMode = on;
    if (on) {
      this.recallAll(true);
      this.pushChat("staff", SECRETARY, "집중 모드 켰습니다. 커피·잡담 없이 전원 자리에서 업무만 봅니다.");
      this.pushLog("🎤", "대표 지시: 집중 모드 ON — 자율 휴식 중단", "yellow");
    } else {
      this.pushChat("staff", SECRETARY, "집중 모드 껐어요. 다들 숨 좀 돌리겠습니다 ☕");
      this.pushLog("🎤", "대표 지시: 집중 모드 OFF", "yellow");
    }
  }

  private recallAll(quiet = false) {
    let moved = 0;
    for (const agent of this.agents) {
      if (agent.rank === "ceo" || this.locked.has(agent.id) || agent.status === "출근 전") continue;
      if (Math.abs(agent.x - agent.home.x) < 0.2 && Math.abs(agent.y - agent.home.y) < 0.2) continue;
      agent.queue.length = 0;
      agent.current = null;
      this.say(agent, "네, 바로 갈게요!", 2.4);
      this.sitAtDesk(agent);
      moved += 1;
    }
    if (!quiet) {
      this.pushChat("staff", SECRETARY, moved ? `${moved}명 자리로 복귀시켰습니다.` : "다들 이미 자리에 있어요.");
      this.pushLog("🎤", `대표 지시: 전원 자리 복귀 (${moved}명 이동)`, "yellow");
    }
  }

  private boost() {
    let count = 0;
    for (const agent of this.agents) {
      if (agent.current?.k === "work") {
        agent.current.dur = Math.max(agent.timer + 0.8, agent.current.dur * 0.55);
        this.say(agent, "네! 속도 올릴게요", 2.4);
        count += 1;
      }
    }
    this.speed = Math.min(4, this.speed * 2);
    this.pushChat(
      "staff",
      SECRETARY,
      count ? `작업 ${count}건 속도 올렸고 배속도 ${this.speed}x로 바꿨습니다.` : `지금 돌아가는 작업이 없어서 배속만 ${this.speed}x로 올렸어요.`,
    );
    this.pushLog("🎤", `대표 지시: 속도 올리기 (${this.speed}x)`, "yellow");
  }

  private cheer() {
    for (const agent of this.agents) {
      if (agent.rank === "ceo" || agent.status === "출근 전") continue;
      this.say(agent, rand(["감사합니다 🩷", "힘나요!", "더 잘할게요 ✨"]), 3.2);
    }
    this.pushChat("staff", SECRETARY, "대표님 한마디에 사무실 분위기가 확 살았어요 🩷");
    this.pushLog("🎀", "대표 격려 — 전 직원 사기 상승", "pink");
  }

  private convene() {
    if (this.side.gen) {
      this.pushChat("staff", SECRETARY, "앞선 지시를 아직 처리 중이에요. 끝나면 바로 잡겠습니다.");
      return;
    }
    const ids = Object.keys(this.deptStatus)
      .map((dept) => DEPT_LEAD[dept].id)
      .filter((id) => !this.locked.has(id) && this.agentById.get(id)?.status !== "출근 전")
      .slice(0, 6);
    if (!ids.length) {
      this.pushChat("staff", SECRETARY, "지금은 다들 진행 중인 업무가 있어 소집이 어려워요. 잠시 뒤 다시 불러주세요.");
      return;
    }
    this.pushChat("staff", SECRETARY, `${ids.length}명 회의실로 소집했습니다. 각자 한 줄씩 보고할게요.`);
    this.pushLog("🎤", `대표 지시: 긴급 회의 소집 (${ids.length}명)`, "yellow");
    this.spotlightRoom("meeting", 24);
    this.side.gen = this.conveneScene(ids);
  }

  private *conveneScene(ids: string[]): Generator<number | (() => boolean), void, void> {
    const lines = ids.map((id) => {
      const agent = this.agentById.get(id)!;
      const status = this.deptStatus[agent.deptId];
      const text =
        status === "진행 중"
          ? `${this.deptTaskLabel(agent.deptId)} ${this.deptProgress(agent.deptId)}% 진행 중입니다.`
          : status === "완료"
            ? "오늘 몫은 끝냈습니다."
            : status === "연동 대기"
              ? (BLOCK_REASON[agent.deptId] ?? "외부 연동 대기 중입니다.")
              : (WAIT_LINE[agent.deptId] ?? "앞 단계 결과를 기다리는 중입니다.");
      return [id, text] as [string, string];
    });
    yield* this.meeting("대표 긴급 소집 · 전 부서 한 줄 보고", ids, lines);
    this.pushChat("staff", SECRETARY, "회의 마쳤습니다. 전원 자리로 복귀했어요.");
  }

  private briefNow() {
    if (this.side.gen) {
      this.pushChat("staff", SECRETARY, "앞선 지시를 처리 중이에요. 끝나고 바로 올라가겠습니다.");
      return;
    }
    const seri = this.agentById.get("secretary-lead")!;
    if (this.locked.has(seri.id)) {
      this.pushChat("staff", SECRETARY, "지금 다른 일정에 묶여 있어요. 마치는 대로 대표실로 가겠습니다.");
      return;
    }
    this.pushLog("🎤", "대표 지시: 즉시 브리핑 요청", "yellow");
    this.side.gen = this.briefScene(seri);
  }

  private *briefScene(seri: Agent): Generator<number | (() => boolean), void, void> {
    this.lock([seri]);
    this.stand(seri);
    this.say(seri, "대표님께 지금 보고드리러 갑니다.", 3);
    this.goto(seri, CEO_REPORT_SPOT, "보고 중");
    this.enqueue(seri, { k: "face", dir: "up" });
    yield this.allFree([seri]);
    seri.anim = "talk";
    this.say(seri, "바로 보고드릴게요.", 3);
    this.reportStatus();
    yield 3;
    seri.anim = "idle";
    this.stand(seri);
    this.sitAtDesk(seri);
    yield this.allFree([seri]);
    this.unlock([seri]);
  }

  // ── 보고용 계산 ──────────────────────────────────────────
  private workingDepts() {
    return Object.entries(this.deptStatus)
      .filter(([, status]) => status === "진행 중")
      .map(([dept]) => dept);
  }

  private deptProgress(deptId: string) {
    const crew = this.deptAgents(deptId);
    if (!crew.length) return 0;
    return Math.round((crew.reduce((sum, a) => sum + a.progress, 0) / crew.length) * 100);
  }

  private deptTaskLabel(deptId: string) {
    const crew = this.deptAgents(deptId);
    return crew.find((a) => a.status === "업무 중")?.taskLabel ?? DEPT_BRIEF[deptId].task;
  }

  private onDutyCount() {
    return this.agents.filter((a) => a.rank !== "ceo" && a.status !== "출근 전").length;
  }

  private speakSecretary(text: string) {
    const seri = this.agentById.get("secretary-lead");
    if (seri && seri.status !== "출근 전") this.say(seri, text, 3);
  }

  private spotlightRoom(roomId: string, seconds: number) {
    this.spotlight = roomId;
    this.spotlightUntil = this.elapsed + seconds;
  }

  /** 질문에 등장한 부서·이름을 찾아낸다 (구체적인 키워드부터 검사) */
  private matchDept(text: string): string | null {
    for (const [deptId, words] of DEPT_KEYWORDS) {
      if (words.some((word) => text.includes(word))) return deptId;
    }
    const staff = STAFF.find((s) => text.includes(s.name) || (s.callsign && text.includes(s.callsign)));
    return staff?.deptId ?? null;
  }

  // ── 대표 액션 ────────────────────────────────────────────
  /** 실제 업무(Claude)와 연결 — 화면은 Claude가 실제로 도달한 단계까지만 진행한다 */
  setRealGate(n: number | null) {
    this.realGate = n;
    if (n === null) return;
    if (n >= 4 && this.opinionOpen) this.opinionOpen = false;
    if (n >= 8 && this.approvalPending) this.approve();
  }

  get realMode() {
    return this.realGate !== null;
  }

  private *gate(n: number): Generator<number | (() => boolean), void, void> {
    if (this.realGate === null || this.realGate >= n) return;
    this.turbo = false;
    this.gateWaiting = n;
    this.pushLog("⏳", `${PHASES[this.phaseIndex]} 끝 — 다음 '${PHASES[n]}'은(는) 실제 업무가 끝나면 넘어가요`, "lav");
    yield () => this.realGate === null || this.realGate >= n;
    this.gateWaiting = null;
  }

  approve() {
    if (!this.approvalPending) return;
    this.approved = true;
  }

  setBriefingHandler(handler: (() => void) | null) {
    this.onBriefing = handler;
  }

  togglePause() {
    this.paused = !this.paused;
  }

  setSpeed(value: number) {
    this.speed = value;
    this.turbo = false;
  }

  /** 대표가 결정할 일이 생길 때까지(또는 업무 종료까지) 단숨에 건너뛴다 */
  skipToDecision() {
    if (!this.running || this.approvalPending || this.dayComplete) return;
    this.turbo = true;
    this.paused = false;
    this.pushLog("⏭", "대표 지시: 결정이 필요한 지점까지 건너뜁니다.", "yellow");
  }

  // ── 틱 ──────────────────────────────────────────────────
  tick(rawDt: number) {
    if (this.paused) return;
    // 터보(건너뛰기)는 대표 결정이 필요한 지점이나 업무 종료에서 자동 해제된다
    if (this.turbo && (this.approvalPending || this.opinionOpen || this.dayComplete || !this.running)) this.turbo = false;

    const raw = Math.min(rawDt, 0.05);
    const dt = raw * (this.turbo ? TURBO_SPEED : this.speed);
    // 실제 업무를 기다리는 동안엔 화면 시계를 멈춘다(밤 12시를 넘겨 00:02처럼 보이던 문제)
    if (this.running && this.gateWaiting === null) this.clockMinutes += dt * SIM_MIN_PER_SEC;

    this.occupancy.clear();
    for (const agent of this.agents) {
      this.occupancy.add(Math.round(agent.y) * COLS + Math.round(agent.x));
    }

    for (const agent of this.agents) this.stepAgent(agent, dt);
    this.runSlot(this.main, dt);
    this.runSlot(this.side, dt);

    this.elapsed += dt;
    if (this.spotlight && this.elapsed > this.spotlightUntil) this.spotlight = null;
    if (this.approvalPending && this.approvalSince === null) this.approvalSince = this.elapsed;
    if (!this.approvalPending) this.approvalSince = null;
  }

  private runSlot(slot: Slot, dt: number) {
    if (!slot.gen) return;
    if (slot.wait > 0) {
      slot.wait -= dt;
      return;
    }
    if (slot.until) {
      if (!slot.until()) return;
      slot.until = null;
    }
    const result = slot.gen.next();
    if (result.done) {
      slot.gen = null;
      return;
    }
    if (typeof result.value === "number") slot.wait = result.value;
    else slot.until = result.value;
  }

  private stepAgent(agent: Agent, dt: number) {
    if (agent.speechFor > 0) {
      agent.speechFor -= dt;
      if (agent.speechFor <= 0) agent.speech = null;
    }

    if (!agent.current) {
      const next = agent.queue.shift();
      if (next) {
        agent.current = next;
        agent.timer = 0;
        this.beginAction(agent, next);
      } else {
        this.idleBrain(agent, dt);
        return;
      }
    }

    const action = agent.current;
    if (!action) return;
    agent.timer += dt;

    switch (action.k) {
      case "walk": {
        this.stepWalk(agent, dt);
        if (agent.pathIdx >= agent.path.length) {
          agent.path = [];
          agent.anim = "idle";
          agent.current = null;
        }
        break;
      }
      case "wait":
      case "say": {
        if (agent.timer >= action.dur) agent.current = null;
        break;
      }
      case "work": {
        agent.anim = "type";
        agent.progress = Math.min(1, agent.timer / action.dur);
        agent.taskLabel = action.label;
        if (agent.timer >= action.dur) {
          agent.progress = 1;
          agent.current = null;
        }
        break;
      }
      default:
        agent.current = null;
    }
  }

  private beginAction(agent: Agent, action: Action) {
    switch (action.k) {
      case "walk": {
        const path = findPath(
          { x: Math.round(agent.x), y: Math.round(agent.y) },
          action.to,
          this.occupancy,
        );
        agent.path = path;
        agent.pathIdx = 0;
        agent.anim = path.length ? "walk" : "idle";
        if (agent.status === "대기" || agent.status === "휴식") agent.status = "이동 중";
        break;
      }
      case "say":
        this.say(agent, action.text, action.dur, action.kind);
        break;
      case "face":
        agent.facing = action.dir;
        agent.current = null;
        break;
      case "anim":
        agent.anim = action.a;
        agent.current = null;
        break;
      case "status":
        agent.status = action.s;
        agent.current = null;
        break;
      case "fn":
        action.fn();
        agent.current = null;
        break;
      default:
        break;
    }
  }

  private stepWalk(agent: Agent, dt: number) {
    if (agent.pathIdx >= agent.path.length) return;
    const node = agent.path[agent.pathIdx];
    const dx = node.x - agent.x;
    const dy = node.y - agent.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.06) {
      agent.x = node.x;
      agent.y = node.y;
      agent.pathIdx += 1;
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) agent.facing = dx > 0 ? "right" : "left";
    else agent.facing = dy > 0 ? "down" : "up";

    const step = WALK_SPEED * dt;
    agent.x += (dx / dist) * Math.min(step, dist);
    agent.y += (dy / dist) * Math.min(step, dist);
    agent.anim = "walk";
  }

  /** 할 일이 없을 때의 자율 행동 — 생각 말풍선, 커피, 잡담 */
  private idleBrain(agent: Agent, dt: number) {
    if (agent.rank === "ceo") return this.ceoBrain(agent, dt);
    if (this.locked.has(agent.id)) return;
    agent.idleFor -= dt;
    if (agent.idleFor > 0) return;
    agent.idleFor = 7 + Math.random() * 14;

    const roll = Math.random();
    const blocked = BLOCKED_DEPTS.has(agent.deptId) && this.deptStatus[agent.deptId] === "연동 대기";

    if (agent.status === "출근 전") return;

    if (roll < 0.5 || this.focusMode) {
      // 집중 모드에서는 자리에서 생각만 한다 — 커피·잡담 금지
      this.say(agent, rand(agent.thoughts), 3.4, "think");
      return;
    }
    if (roll < 0.68 || blocked) {
      // 라운지 커피 타임
      this.stand(agent);
      this.enqueue(
        agent,
        { k: "status", s: "휴식" },
        { k: "walk", to: rand(LOUNGE_ROOM.loiter) },
        { k: "say", text: rand(["잠깐 커피 ☕", "머리 좀 식히고요", "당 충전 필요해요"]), dur: 2.6, kind: "talk" },
        { k: "wait", dur: 3 + Math.random() * 4 },
      );
      this.sitAtDesk(agent);
      return;
    }
    if (roll < 0.82) {
      // 옆자리 잡담
      const mate = this.agents.find(
        (a) => a.deptId === agent.deptId && a.id !== agent.id && !this.busy(a) && a.status !== "출근 전",
      );
      if (mate) {
        this.say(agent, rand(["이거 어떻게 생각해요?", "잠깐만요, 이거 봐봐요", "이거 좋아요 많이 받을 것 같아요?"]), 3);
        this.say(mate, rand(["오, 괜찮은데요?", "각도를 살짝 틀면 좋겠어요", "근거만 붙이면 돼요"]), 3);
        agent.anim = "talk";
        mate.anim = "talk";
        this.enqueue(agent, { k: "wait", dur: 2.6 }, { k: "anim", a: "sit" });
        this.enqueue(mate, { k: "wait", dur: 2.6 }, { k: "anim", a: "sit" });
      }
      return;
    }
    // 자리 정리
    if (Math.abs(agent.x - agent.home.x) > 0.1 || Math.abs(agent.y - agent.home.y) > 0.1) {
      this.sitAtDesk(agent);
    }
  }

  // ── 대표 순찰 ────────────────────────────────────────────
  /** 대표는 업무 중에 가끔 부서를 돌며 진행 상황을 직접 확인한다 */
  private ceoBrain(ceo: Agent, dt: number) {
    if (this.locked.has(ceo.id) || !this.running || this.dayComplete || this.approvalPending || this.meetingTitle) return;
    this.ceoPatrolIn -= dt;
    if (this.ceoPatrolIn > 0) return;
    this.ceoPatrolIn = 16 + Math.random() * 14;
    this.patrol();
  }

  /** 한 부서로 걸어가 확인하고 대표실로 돌아온다. 간 부서 id를 돌려준다 */
  private patrol(target?: string): string | null {
    const ceo = this.agentById.get("ceo")!;
    const present = DEPT_ROOMS.map((r) => r.id).filter((d) => this.deptAgents(d).some((a) => a.status !== "출근 전"));
    if (!present.length) return null;
    const working = present.filter((d) => this.deptStatus[d] === "진행 중");
    const dept = target && present.includes(target) ? target : rand(working.length && Math.random() < 0.75 ? working : present);
    const lead = this.agentById.get(DEPT_LEAD[dept].id);
    if (!lead) return null;
    const room = roomOf(dept);
    const spot = { x: lead.home.x, y: Math.min(lead.home.y + 2, room.y + room.h - 2) };
    const to = walkable(spot.x, spot.y) ? spot : doorApproach(room);
    const [ask, reply, note] = this.patrolLines(dept, lead);

    ceo.queue.length = 0;
    ceo.current = null;
    this.stand(ceo);
    this.enqueue(
      ceo,
      { k: "status", s: "이동 중" },
      { k: "say", text: rand(["한 바퀴 돌아볼까~", "다들 잘하고 있나~", "어디 보자~"]), dur: 1.4, kind: "think" },
      { k: "walk", to },
      { k: "face", dir: "up" },
      { k: "anim", a: "talk" },
      { k: "say", text: ask, dur: 2.6, kind: "talk" },
      {
        k: "fn",
        fn: () => {
          if (!this.locked.has(lead.id)) this.say(lead, reply, 3);
          this.pushLog("👀", `대표 순찰: ${room.name} — ${note}`, "yellow");
        },
      },
      { k: "wait", dur: 2.6 },
      { k: "anim", a: "idle" },
      { k: "walk", to: CEO_SEAT },
      { k: "face", dir: "down" },
      { k: "anim", a: "sit" },
      { k: "status", s: "업무 중" },
    );
    return dept;
  }

  private patrolLines(dept: string, lead: Agent): [string, string, string] {
    const call = lead.callsign ?? lead.name;
    const status = this.deptStatus[dept];
    if (status === "진행 중") {
      const pct = this.deptProgress(dept);
      return [`${call}, 잘 되고 있어요?`, `${pct}%예요. 정상 속도입니다!`, `${this.deptTaskLabel(dept)} ${pct}% · 정상`];
    }
    if (status === "완료") return ["오 벌써 끝났어요? 좋다~", "네, 오늘 몫은 끝냈어요!", "오늘 몫 완료"];
    if (status === "연동 대기") {
      return ["여긴 뭐가 막혔어요?", BLOCK_REASON[dept] ?? "외부 연동을 기다리는 중이에요.", "연동 대기"];
    }
    if (status === "승인 대기") return ["결재 기다리는 중이죠?", "네 대표님, 승인만 주시면 바로 움직여요.", "대표 결재 대기"];
    return [`${call}, 오늘 할 일 뭐예요?`, WAIT_LINE[dept] ?? `‘${DEPT_BRIEF[dept].task}’예요. 앞 팀 결과 기다리는 중이에요.`, "앞 단계 대기"];
  }

  private patrolNow(deptId: string | null) {
    const ceo = this.agentById.get("ceo")!;
    if (!this.running) {
      this.pushChat("staff", SECRETARY, "아직 출근 전이라 돌아보실 곳이 없어요. ‘오늘 업무 시작하기’부터 눌러주세요.");
      return;
    }
    if (this.locked.has(ceo.id)) {
      this.pushChat("staff", SECRETARY, "대표님 지금 회의·결재 중이세요. 끝나면 바로 도시면 돼요.");
      return;
    }
    const dept = this.patrol(deptId ?? undefined);
    if (!dept) {
      this.pushChat("staff", SECRETARY, "지금 자리에 있는 팀이 없어요.");
      return;
    }
    this.ceoPatrolIn = 20 + Math.random() * 10;
    this.pushChat("staff", SECRETARY, `대표님 순찰 나가십니다 — ${roomOf(dept).name}부터 보세요.`);
    this.pushLog("🎤", `대표 지시: 순찰 (${roomOf(dept).name})`, "yellow");
  }

  // ── 팀원 지목 ────────────────────────────────────────────
  private matchMember(text: string): Agent | null {
    return (
      this.agents.find(
        (a) =>
          a.rank === "member" &&
          (text.includes(a.name) ||
            (a.callsign && text.includes(a.callsign)) ||
            text.includes(a.name.slice(1)) ||
            (a.role.includes("후킹") && text.includes("후킹"))),
      ) ?? null
    );
  }

  private memberReport(agent: Agent, text: string) {
    const room = roomOf(agent.deptId);
    const isHook = agent.role.includes("후킹");
    let reply: string;
    if (/반영|적용|넣어|붙여|해줘|부탁/.test(text)) {
      reply = isHook
        ? "네 대표님! 오늘 대본부터 후킹 3안(릴스 첫 1~3초·캐러셀 첫 장·캡션 첫 줄) 붙이고, 추천 1안에 이유 한 줄 달게요. 확정되면 제가 제작팀에 바로 넘길게요."
        : "네, 바로 반영하겠습니다.";
      this.pushLog("🎤", `대표 지시: ${agent.callsign ?? agent.name} — ${isHook ? "후킹 3안 반영" : "지시 반영"}`, "yellow");
    } else {
      const status = this.deptStatus[agent.deptId];
      reply = isHook
        ? status === "진행 중"
          ? `명철님 대본 나오는 대로 후킹 3안 붙이고 있어요. 지금 저는 ‘${agent.status}’이에요.`
          : status === "완료"
            ? this.phaseIndex >= 9
              ? "후킹 3안 붙여서 제작팀에 넘겼어요. 대표님이 고르신 후킹으로 편집 들어가요."
              : "대본 나왔어요. 후킹 3안 붙이는 중이에요."
            : status === "승인 대기"
              ? "TOP 3 결재 기다리는 중이에요. 승인 나면 명철님 대본에 후킹 3안 붙일게요."
              : `대본이 나오면 후킹 3안 붙여서 제작팀에 넘겨요. 지금은 ‘${agent.status}’이에요.`
        : `지금 ‘${agent.status}’이에요.`;
      this.pushLog("🎤", `대표 지시: ${agent.callsign ?? agent.name} 상황 확인`, "yellow");
    }
    this.pushChat("staff", `${agent.name} · ${room.name}`, reply);
    if (agent.status !== "출근 전") {
      this.say(agent, isHook ? "네! 후킹 챙길게요 ✨" : "네, 대표님!", 3);
      if (!this.locked.has(agent.id) && !this.busy(agent)) agent.anim = "talk";
    }
    this.spotlightRoom(agent.deptId, 8);
  }

  // ── 스냅샷 ──────────────────────────────────────────────
  snapshot(): Snapshot {
    const counts = {} as Record<AgentStatus, number>;
    for (const agent of this.agents) {
      counts[agent.status] = (counts[agent.status] ?? 0) + 1;
    }
    const values = Object.values(this.deptStatus);
    return {
      clock: this.clockText(),
      running: this.running,
      paused: this.paused,
      speed: this.speed,
      turbo: this.turbo,
      dayComplete: this.dayComplete,
      phase:
        this.gateWaiting !== null
          ? `${PHASES[this.phaseIndex]} 끝 · ${PHASES[this.gateWaiting]} 대기`
          : this.phaseIndex === 7 && this.approved
            ? "승인 완료 · 자리 복귀"
            : PHASES[this.phaseIndex] ?? "",
      gateWaiting: this.gateWaiting !== null,
      phaseIndex: this.phaseIndex,
      approvalPending: this.approvalPending,
      approved: this.approved,
      briefingReady: this.briefingReady,
      deptStatus: { ...this.deptStatus },
      counts,
      stats: {
        done: values.filter((v) => v === "완료").length,
        working: values.filter((v) => v === "진행 중").length,
        approval: values.filter((v) => v === "승인 대기").length,
        blocked: values.filter((v) => v === "연동 대기").length,
      },
      log: this.log.slice(0, 24),
      meetingTitle: this.meetingTitle,
      opinionPending: this.opinionOpen,
      realMode: this.realGate !== null,
      ceoOpinions: [...this.ceoOpinions],
      chat: this.chat.slice(-24),
      focusMode: this.focusMode,
      spotlight: this.spotlight,
      busyWithOrder: this.side.gen !== null,
    };
  }
}

export const TOTAL_PHASES = PHASES.length;
export { PHASES };
