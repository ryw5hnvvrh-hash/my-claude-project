// ============================================================
//  나의 AI 회사 설정 — 여기 한 파일만 고치면 됩니다
// ============================================================
//  회사 이름, 부서 이름, 직원 이름·성격·머리색까지 전부 여기 있어요.
//  다른 파일은 건드리지 않아도 됩니다.
//
//  ⚠️ 딱 2가지 규칙
//   1. 부서 id(research, strategy1, ...)는 절대 바꾸지 마세요. 시뮬레이션 엔진이
//      이 id로 움직입니다. 바꾸면 캐릭터가 길을 잃어요.
//      → 바꿔도 되는 건 name(부서 이름) · icon · short 입니다.
//   2. 부서 9개를 유지하세요. 사무실 배치가 3열 3행 = 9칸이고,
//      엔진이 9개 부서 id를 직접 씁니다. 안 쓰는 부서는 이름만 바꿔서 쓰세요.
//
//  직원 수는 자유롭게 늘리고 줄여도 됩니다. 한 팀에 팀장(lead) 1명은 두세요.
// ============================================================

/** 회사 기본 정보 */
export const COMPANY = {
  /** 좌측 상단 헤더에 뜨는 회사 이름 */
  name: "THING THAT HIT",
  /** 헤더 로고 배지에 들어갈 글자 1개 (이모지도 됩니다) */
  logoLetter: "T",
  /** 화면 상단 큰 제목 (앞부분) */
  titlePrefix: "THING THAT HIT",
  /** 화면 상단 큰 제목 (강조되는 뒷부분) */
  titleAccent: "AI Office",
  /** 브라우저 탭 제목 */
  pageTitle: "THING THAT HIT — AI 사무실",
  /** 검색·공유될 때 뜨는 설명 */
  description: "직접 만든 레진 소품을 소개하는 THING THAT HIT의 AI 오피스 — 조사·기획·검수·제작·정산까지 한 흐름으로",
  /** 창 하단 파일명 느낌의 라벨 */
  windowLabel: "thing_that_hit.exe — 대표실",
  /** 일일 브리핑 제목에 들어갈 이름 */
  reportName: "THING THAT HIT",
  /** 화면 하단 크레딧에 걸 인스타그램 아이디 (@ 빼고). 비우면 링크가 숨겨집니다 */
  instagram: "thth_lll",
} as const;

/** 대표(나) — 사무실 대표실에 앉아 있는 캐릭터 */
export const CEO_PROFILE = {
  name: "이선홍",
  callsign: "대표님",
  role: "대표 · 촬영·게시·최종 결정",
  hair: "#42283a",
  shirt: "#b8f0dd",
  accent: "#fff3b0",
  skin: "#ffdcc4",
  thoughts: [
    "치원님, 보고는? 다 정리했나요?",
    "곽범님, 이거 좋다! 이걸로 가요~",
    "명철님, 대본 어디 봐봐요~ 오 괜찮은데?",
  ],
};

/**
 * 부서 10개 (2026-10-01 상품관리팀 추가 — 사무실 4번째 줄).
 * id = 고정(엔진용) / name·short·icon = 자유롭게 변경
 * task = 오늘 하는 일 / report = 팀장 한줄보고
 *
 * THING THAT HIT 부서(AI_COMPANY.md §3) 9칸 — 사무실은 3열 3행으로 배치됩니다.
 *  - 제작팀은 릴스(reels)·캐러셀(carousel) 두 칸을 씁니다.
 */
export const DEPARTMENTS = [
  {
    id: "research",
    name: "시장조사팀",
    short: "trend.lab",
    icon: "🔎",
    task: "트렌드·행사 조사 · 계정 성과 비교 · 조회수×썸네일 분석",
    report: "행사·트렌드와 비교 계정 성과, 조회수별 썸네일 차이까지 정리했어요. 확인 못 한 건 미확인으로 적었어요.",
  },
  {
    id: "strategy1",
    name: "기획 1팀",
    short: "idea.studio",
    icon: "💡",
    task: "아이디어 10개 → TOP 3",
    report: "성과 회의 근거를 붙여 아이디어 10개를 넘겼어요. TOP 3는 검수 통과한 안에서만 골라요.",
  },
  {
    id: "qa",
    name: "브랜드 검수팀",
    short: "qa.check",
    icon: "🛡️",
    task: "표기·가격·중복·금칙어 검사",
    report: "10개 모두 검사하고 통과·반려 사유를 적었어요. 확정 안 된 가격·할인·배송 표기는 반려했어요.",
  },
  {
    id: "strategy2",
    name: "기획 2팀",
    short: "script.team",
    icon: "✍️",
    task: "승인된 안 대본·후킹 3안·게시물 문구",
    report: "승인된 안으로 대본을 썼어요. 후킹 3안은 다솜님이 붙여서 제작팀에 넘겨요.",
  },
  {
    id: "reels",
    name: "제작팀 · 릴스",
    short: "reels.edit",
    icon: "🎬",
    task: "확정 대본으로 릴스 편집본",
    report: "원본은 그대로 두고 복제본으로 릴스 편집본을 만들었어요.",
  },
  {
    id: "carousel",
    name: "제작팀 · 캐러셀",
    short: "carousel.studio",
    icon: "🖼️",
    task: "확정 대본으로 캐러셀 이미지",
    report: "확정 대본 문구로만 캐러셀 이미지를 만들었어요. 대본에 없는 가격·할인 문구는 넣지 않았어요.",
  },
  {
    id: "finance",
    name: "정산팀",
    short: "finance.xls",
    icon: "🧾",
    task: "매일 브리핑 전 드라이브 확인 · 일요일 17:00 주간 종합",
    report: "드라이브 '정산' 폴더를 확인해 비서실에 넘겼어요. 새 파일이 없으면 '없습니다'로 보고해요.",
  },
  {
    id: "review",
    name: "성과 리뷰실",
    short: "review.data",
    icon: "📈",
    task: "좋아요·팔로워·조회수 기록 · 전체 성과 회의 주재",
    report: "좋아요·팔로워·조회수를 전체 성과 회의에서 공유했어요. 수치 없는 건 미확인으로 적었어요.",
  },
  {
    id: "secretary",
    name: "비서실",
    short: "secretary.hq",
    icon: "📋",
    task: "부서별 한 줄 보고 → 대표 브리핑",
    report: "승인할 것과 단순 공유를 나눠서 대표님께 브리핑했어요.",
  },
  {
    id: "product",
    name: "상품관리팀",
    short: "product.shelf",
    icon: "🏷️",
    task: "신상품 상품명·설명 · 상세 사진 · 가격 후보 · 두 플랫폼 등록 묶음",
    report: "신상품 등록에 필요한 글·사진·가격 후보를 두 플랫폼 묶음으로 준비했어요. 등록은 대표님이 해주세요.",
  },
] as const;

/**
 * 직원 명단.
 * dept = 위 부서 id / rank: "lead"(팀장) 또는 "member"(팀원)
 * colors = [머리색, 옷색, 포인트색]
 * thoughts = 자리를 비웠을 때 머리 위에 뜨는 혼잣말
 */
export type StaffEntry = {
  dept: string;
  rank: "lead" | "member";
  name: string;
  role: string;
  colors: [string, string, string];
  thoughts: string[];
  callsign?: string;
};

export const STAFF_LIST: StaffEntry[] = [
  // ① 시장조사팀
  { dept: "research", rank: "lead", name: "이승희", role: "시장조사 팀장", callsign: "승희님",
    colors: ["#6b3d34", "#fff3b0", "#ff8fc0"],
    thoughts: ["출처 없는 건 미확인으로 적습니다.", "공식 페이지부터 확인하겠습니다."] },
  { dept: "research", rank: "member", name: "김세민", role: "시장조사팀 · 브랜드 분석·비교 계정", callsign: "세민님",
    colors: ["#3b2f2a", "#b8f0dd", "#ff8fc0"],
    thoughts: ["아 이걸 또 비교해요? …네, 하고 있어요.", "말은 이래도 숫자는 다 맞춰놨거든요.", "캡처 좀 더 주시면 안 돼요? 아 알겠어요, 있는 걸로 할게요."] },


  // ② 기획 1팀
  { dept: "strategy1", rank: "lead", name: "이곽범", role: "기획 1팀장", callsign: "곽범님",
    colors: ["#c26e4b", "#ff8fc0", "#fff3b0"],
    thoughts: ["촬영 못 하는 아이디어는 안 해요.", "TOP 3부터 추려볼게요."] },

  // ③ 브랜드 검수팀
  { dept: "qa", rank: "lead", name: "홍선", role: "브랜드 검수 팀장", callsign: "선님",
    colors: ["#2d4b46", "#b8f0dd", "#b8f0dd"],
    thoughts: ["근거 없는 가격 표기는 통과 안 해요.", "금칙어부터 확인할게요."] },

  // ④ 기획 2팀
  { dept: "strategy2", rank: "lead", name: "정명철", role: "기획 2팀장 (대본)", callsign: "명철님",
    colors: ["#8b534a", "#fff3b0", "#ff8fc0"],
    thoughts: ["아~승인 안 난 건 안써요.", "아~ 촬영 순서부터 확인요."] },
  { dept: "strategy2", rank: "member", name: "윤다솜", role: "기획 2팀 · 후킹 전담", callsign: "다솜님",
    colors: ["#5a3a4a", "#c9b8ff", "#fff3b0"],
    thoughts: ["첫 1초에 손이 멈춰야 해요.", "후킹 3안 뽑아서 제작팀에 넘길게요."] },

  // ⑤ 제작팀 · 릴스
  { dept: "reels", rank: "lead", name: "하민", role: "제작팀 · 릴스 담당", callsign: "하민님",
    colors: ["#2c2638", "#ff8fc0", "#ff8fc0"],
    thoughts: ["장면 순서 한 번만 확인 부탁드립니다.", "원본 영상 전달 부탁드립니다."] },
  { dept: "reels", rank: "member", name: "노아", role: "제작팀 · 스토리·촬영 리스트", callsign: "노아님",
    colors: ["#4a3a2e", "#ffd4e6", "#c9b8ff"],
    thoughts: ["대표님은 어떤 각도를 좋아하실까…", "스토리 조각 색감 한 번만 더 맞춰볼게요.", "대표님! 촬영 리스트 보셨어요?"] },

  // ⑥ 제작팀 · 캐러셀
  { dept: "carousel", rank: "lead", name: "김석진", role: "제작팀 · 캐러셀 담당", callsign: "석진님",
    colors: ["#d88d68", "#c9b8ff", "#c9b8ff"],
    thoughts: ["확정된 가격만 알려주시길 부탁드립니다.", "사진 순서 한 번 봐주시길 부탁드립니다."] },


  // ⑦ 정산팀
  { dept: "finance", rank: "lead", name: "현진", role: "정산 팀장", callsign: "현진님",
    colors: ["#313b56", "#fff3b0", "#fff3b0"],
    thoughts: ["판매금액은 플랫폼별로 나눠 적어요.", "입금 대기 건부터 확인하겠습니다."] },

  // ⑧ 성과 리뷰실
  { dept: "review", rank: "lead", name: "김희선", role: "성과 리뷰실장", callsign: "희선님",
    colors: ["#9c5c72", "#ff8fc0", "#ff8fc0"],
    thoughts: ["수치 없는 건 추정 안합니다.", "좋아요 수부터 확인해볼게요."] },


  // ⑨ 비서실
  { dept: "secretary", rank: "lead", name: "박치원", role: "비서실장", callsign: "치원님",
    colors: ["#7a453c", "#c9b8ff", "#c9b8ff"],
    thoughts: ["보고 드리겠습니다 대표님.", "대표님 괜찮으신가요?."] },

  // ⑩ 상품관리팀 (2026-10-01 신설)
  { dept: "product", rank: "lead", name: "김성열", role: "상품관리 팀장", callsign: "성열님",
    colors: ["#2f3a3a", "#e8dcc4", "#b8f0dd"],
    thoughts: ["…", "상세 사진 순서 정리 중입니다.", "가격 후보 세 개, 원가표 붙여뒀습니다."] },
];

/**
 * 외부 연동을 아직 안 붙인 팀 → 화면에 "연동 대기"로 표시됩니다.
 * 연동을 다 붙였거나, 그냥 전부 초록불로 보고 싶으면 빈 객체 {}로 두세요.
 */
export const PENDING_INTEGRATIONS: Record<string, string> = {
};

/**
 * 대표 승인 창에 뜨는 TOP 1 예시 안건 (화면 연출용 샘플).
 * 실제 기획 결과가 아니라 "이런 식으로 올라온다"를 보여주는 자리예요.
 * 가격·할인·배송처럼 확인 안 된 정보는 넣지 마세요.
 */
export const SAMPLE_PROPOSAL = {
  score: "예시",
  title: "레진으로 만드는 과정부터 포장까지, 모든 순간",
  summary: "레진으로 만드는 과정과 포장하는 순간까지, 제품이 완성되는 모든 순간을 보여주는 릴스 예시 안이에요.",
  points: ["레진으로 만드는 과정", "완성된 제품", "포장하는 순간"],
};

/**
 * 결과 보관함 링크 (Notion 등). 비워두면 화면에서 링크 버튼이 숨겨집니다.
 * 예: "https://www.notion.so/내페이지주소"
 */
export const STORAGE_LINK = "https://app.notion.com/p/3ea58207fbaf81c0bafee07ee834abf4";
