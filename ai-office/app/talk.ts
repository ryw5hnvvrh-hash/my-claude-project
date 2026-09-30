"use client";

// ============================================================
//  직원 대화 — 대표가 지시창에 쓴 말에 "그 상황의 그 사람"이 답한다
//  · 대표의 Claude(sample)에게 회사 규칙·직원 성격·지금 사무실 상황·
//    오늘 실제 업무 기록을 함께 보내, 누가 무슨 말로 답할지 받는다.
//  · 실제 작업이 필요한 말(수정·다시 해줘·업무 시작 등)은 forward 로
//    표시되어 대화 속 Claude(총괄비서)에게도 전달된다.
// ============================================================

import { CEO, DEPT_LEAD, STAFF } from "./game/staff";
import { DEPT_ROOMS } from "./game/world";
import type { RealDoc, SampleFn } from "./real";

export type TalkResult = {
  speaker: string;
  reply: string;
  action?: string;
  dept?: string | null;
  forward?: boolean;
};

const ROSTER = STAFF.map((s) => {
  const room = DEPT_ROOMS.find((r) => r.id === s.deptId);
  return `- ${s.name} (${room?.name ?? s.deptId} · ${s.role}${s.rank === "lead" ? " · 팀장" : ""}) 말투 예: ${s.thoughts.map((t) => `"${t}"`).join(" ")}`;
}).join("\n");

const RULES = `너는 레진 소품 브랜드 THING THAT HIT의 AI 사무실 직원들을 연기한다. 대표(${CEO.name})가 지시창에 말하면, 그 말에 가장 알맞은 직원 한 명이 실제 회사 동료처럼 답한다.

직원 명단과 말투:
${ROSTER}
- 총괄비서 (Claude 본인 · 실제 작업 담당. 파일·노션·드라이브 작업, 대본 수정 같은 실제 일은 총괄비서가 한다)

답하는 규칙:
1. 대표가 이름·부서를 부르면 그 사람이 답한다. 아니면 질문 내용에 맞는 담당자(성과·숫자=김희선, 시장조사·비교 계정=이희승, 아이디어·TOP3=이곽범, 검수·금칙어=홍선, 대본=정명철, 후킹=윤다솜, 릴스 편집=하민, 캐러셀=김석진, 정산·재료비=현진, 전체 현황·일정=박치원)가 답한다.
2. 아래 "지금 사무실 상황"과 "오늘 실제 업무 기록"에 있는 사실만 말한다. 거기 없는 숫자·결과·일정은 지어내지 말고 "확인해서 말씀드릴게요", "아직 자료가 없어요"처럼 말한다.
3. 1~3문장, 존댓말, 그 사람 말투(예시 참고). 과장·금칙어(마법 같은, 인생템, 품절 대란, 무조건, 세상에 하나뿐인) 금지.
4. 대표가 사무실 동작을 시키면 action 을 고른다: focus_on(집중 모드), focus_off(집중 해제), recall(자리로), boost(속도 올려), convene(회의 소집), brief(지금 브리핑), patrol(순찰·둘러보기, dept 에 부서 id), cheer(칭찬·격려), opinion_done(회의 중 의견을 말했거나 의견 없음), none.
5. 실제 작업이 필요한 말(무언가를 고치거나 새로 만들거나 찾아오라는 지시, 업무 시작, TOP 3 선택, 회의 의견)이면 forward 를 true 로 하고, 답에는 "총괄비서에게 넘겨서 실제로 반영할게요"처럼 넘긴다고 말한다. 가벼운 질문·잡담·현황 질문은 forward false.

부서 id: research(시장조사팀) strategy1(기획 1팀) qa(브랜드 검수팀) strategy2(기획 2팀) reels(제작팀·릴스) carousel(제작팀·캐러셀) finance(정산팀) review(성과 리뷰실) secretary(비서실)

반드시 JSON 하나로만 답한다: {"speaker":"직원 이름","reply":"답","action":"none","dept":null,"forward":false}`;

function realSummary(doc: RealDoc | null): string {
  if (!doc) return "오늘 실제 업무 기록 없음 (아직 실제 업무를 시작하지 않았거나 시뮬레이션만 돌고 있음).";
  const out: string[] = [];
  if (doc.step) out.push(`지금 실제 단계: ${doc.step}${doc.waiting ? ` (대표 확인 기다림: ${doc.waiting})` : ""}`);
  if (doc.meeting) {
    const m = doc.meeting;
    out.push(`성과 회의: 팔로워 ${m.followers ?? "미확인"} / ${(m.lines ?? []).join(" / ")} / 반복할 점: ${m.repeat ?? "-"} / 바꿀 점: ${m.change ?? "-"}`);
  }
  if (doc.top3?.length) out.push(`TOP 3: ${doc.top3.map((t) => `${t.rank}위 ${t.title}(${t.format} ${t.score}점, ${t.why})`).join(" / ")}`);
  if (doc.feed?.length) out.push(`오늘 한 일: ${doc.feed.slice(-8).map((f) => `${f.t} ${f.text}`).join(" / ")}`);
  if (doc.briefing?.length) out.push(`브리핑: ${doc.briefing.join(" / ")}`);
  return out.join("\n");
}

export async function askStaff(
  sample: SampleFn,
  text: string,
  ctx: { office: string; real: RealDoc | null; brief: string; history: { from: string; name: string; text: string }[] },
): Promise<TalkResult> {
  const history = ctx.history
    .slice(-10)
    .map((h) => `${h.from === "ceo" ? "대표" : h.name}: ${h.text}`)
    .join("\n");
  const input = `${RULES}

[지금 사무실 상황]
${ctx.office}

[오늘 실제 업무 기록]
${realSummary(ctx.real)}

[회사 사정 요약 — 총괄비서가 적어 둔 것]
${ctx.brief || "없음"}

[최근 지시창 대화]
${history || "없음"}

[대표의 새 말]
${text}`;
  const res = await sample.json<TalkResult>(input, { modelTier: "quick", cache: false });
  const speaker = typeof res?.speaker === "string" && res.speaker ? res.speaker : DEPT_LEAD.secretary.name;
  const reply = typeof res?.reply === "string" && res.reply ? res.reply : "네 대표님, 확인해서 말씀드릴게요.";
  return { speaker, reply, action: res?.action ?? "none", dept: res?.dept ?? null, forward: !!res?.forward };
}
