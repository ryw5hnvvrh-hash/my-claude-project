// node office/commands.test.js — 대표 지시창의 다섯 가지 지시가 실제 상태대로 답하고 움직이는지 확인한다.
const assert = require('assert');
const PF = require('./pathfinding');
const OfficeSim = require('./sim');
const { createCommands } = require('./commands');
const MAP = require('./map.json');

function rng(seed) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }
const room = id => MAP.rooms.find(r => r.id === id);
const inRoom = (a, r) => a.present && a.x >= r.x && a.x < r.x + r.w && a.y >= r.y && a.y < r.y + r.h;
function run(sim, maxSec, done, label, each) {
  for (let t = 0; t < maxSec; t += 1 / 30) {
    sim.tick(1 / 30);
    if (each) each();
    if (done()) return;
  }
  throw new Error(`${label}: ${maxSec}초 안에 안 끝남 — 단계 ${sim.day.step} ${sim.day.label}`);
}

let checks = 0;
for (let seed = 1; seed <= 6; seed++) {
  const sim = OfficeSim.createSim(MAP, PF, rng(seed));
  const cmd = createCommands(sim, OfficeSim, MAP);
  const log = [];
  const ask = t => { const r = cmd.handle(t, x => log.push(x)); r.forEach(x => log.push(x)); return r; };

  // 시작 전
  let r = ask('현황 보고');
  assert.strictEqual(r[0].id, 'secretary'); assert.ok(r[0].text.includes('업무 시작 전')); checks++;
  r = ask('왜 늦어져?');
  assert.strictEqual(r[0].id, 'secretary'); assert.strictEqual(r[0].text, '지연 없습니다.', '④ 문제 없으면 한 줄'); checks++;
  const linked = seed % 2 === 0;
  sim.links.data = linked;

  // ⑦ 승인 대기까지
  sim.startDay();
  run(sim, 300, () => sim.day.awaiting && sim.day.step === 7, `⑦까지 seed=${seed}`);
  for (let i = 0; i < 60; i++) sim.tick(1 / 30);   // 2초(회사 시간 8분) 기다림
  r = ask('현황 보고');
  assert.ok(/⑦ ★ 대표 승인 대기 단계/.test(r[0].text), r[0].text);
  assert.ok(r[0].text.includes('진행률 50% (6/12 완료)'), r[0].text);
  assert.ok(r[0].text.includes('다음 순서는 ⑧ 대본 작성'), r[0].text);
  assert.ok(r[0].text.includes('TOP 3 중 1개 승인만 기다리고'), r[0].text);
  if (!linked) assert.ok(r[0].text.includes('연동 대기: 이희승'), '③ 미연동 → 이희승 연동 대기');
  checks++;
  // ① 내 결정을 기다리는 중이면 그것만 말한다 (연동 대기가 있어도 다른 얘기 금지)
  r = ask('왜 늦어져?');
  assert.strictEqual(r.length, 1);
  assert.ok(/^대표님 결정을 기다리고 있습니다 — ⑦ TOP 3 중 1개 승인, \d+분째입니다\.$/.test(r[0].text), r[0].text); checks++;

  // 재무팀 = 정산팀 현진이 답한다
  r = ask('재무팀 뭐해?');
  assert.strictEqual(r[0].id, 'finance');
  assert.ok(r[0].text.startsWith('정산팀 현진입니다.'), r[0].text);
  assert.ok(!r[0].text.includes('판매금액 정리했습니다'), '정산 안 했는데 정리했다고 말하지 않는다');
  assert.ok(r[0].text.includes('일요일이 아니라 정산 일정이 없습니다'), r[0].text);
  assert.ok(r[0].text.includes('팀원 현황'), r[0].text); checks++;
  r = ask('검수팀 뭐해');
  assert.strictEqual(r[0].id, 'qa');
  assert.ok(r[0].text.includes('대표님 TOP 3 중 1개 승인을 기다리고'), r[0].text);
  assert.ok(r[0].text.includes('반려 3건 / 통과 7건'), r[0].text); checks++;

  sim.approve();
  // ⑨ 제작 중에 제작팀에 물으면 두 사람 모두 나온다
  run(sim, 200, () => {
    if (sim.day.awaiting) sim.approve();
    return sim.day.step === 9 && sim.byId.reels.work === 'doing';
  }, `⑨까지 seed=${seed}`);
  r = ask('제작팀 뭐해?');
  assert.strictEqual(r[0].id, 'reels');
  assert.ok(r[0].text.includes('하민(릴스 담당)') && r[0].text.includes('김석진(캐러셀 담당)'), r[0].text);
  assert.ok(r[0].text.includes('릴스 편집 진행 중'), r[0].text); checks++;
  // ② 작업 중이면 부서명 + 진행률 + "정상 속도예요"
  r = ask('왜 늦어져?');
  assert.ok(/^제작팀 릴스 편집 \d+% \/ 제작팀 캐러셀 제작 \d+% — 정상 속도예요\.$/.test(r[0].text), r[0].text); checks++;
  const p1 = sim.progress(sim.byId.reels);
  for (let i = 0; i < 30; i++) sim.tick(1 / 30);
  assert.ok(sim.progress(sim.byId.reels) > p1, '진행률이 올라간다');

  // 회의 소집: 팀장 8명 + 대표가 회의실에 모이고, 팀장이 한 줄씩 보고, 끝나면 하루가 이어진다
  const before = log.length;
  const stepAtMeeting = sim.day.step;
  r = ask('회의 소집');
  assert.ok(r[0].text.includes('팀장 전원 회의실로'), r[0].text);
  let allIn = false;
  run(sim, 120, () => !sim.interrupted, `회의 seed=${seed}`, () => {
    if (sim.LEADS.every(id => inRoom(sim.byId[id], room('meeting'))) && inRoom(sim.byId.ceo, room('meeting'))) allIn = true;
    assert.strictEqual(sim.day.step, stepAtMeeting, '회의 동안 하루 단계는 멈춘다');
    assert.ok(!sim.day.awaiting || sim.day.step !== stepAtMeeting || true);
  });
  assert.ok(allIn, '팀장 전원 + 대표가 실제로 회의실에 모였다');
  const reports = log.slice(before).filter(x => x.id !== 'secretary' || x.text.includes('.'));
  const reporters = new Set(log.slice(before).map(x => x.id));
  for (const id of sim.LEADS) assert.ok(reporters.has(id), `${id} 한 줄 보고`);
  assert.ok(log[log.length - 1].text.startsWith('회의 끝났습니다'), log[log.length - 1].text); checks++;

  // 하루가 이어져서 끝난다
  run(sim, 300, () => { if (sim.day.awaiting) sim.approve(); return !sim.day.running; }, `회의 후 하루 끝 seed=${seed}`);
  assert.strictEqual(sim.day.label, '오늘 흐름 완료'); checks++;
  r = ask('현황 보고');
  assert.ok(r[0].text.includes('12단계 모두 끝났습니다(진행률 100%)'), r[0].text); checks++;
  // 하루가 끝난 뒤: ③ 연동 때문에 못 한 일이 있으면 정확히, 없으면 ④ "지연 없습니다"
  r = ask('왜 늦어져?');
  if (linked) assert.strictEqual(r[0].text, '지연 없습니다.');
  else {
    assert.ok(r[0].text.includes('시장조사팀 브랜드 분석을 못 하고 있습니다 — förc 성과 데이터가 연결되지 않았습니다.'), r[0].text);
    assert.ok(r[0].text.includes('성과 리뷰실 성과 기록을 못 하고 있습니다 — förc 성과 데이터가 연결되지 않았습니다.'), r[0].text);
  }
  checks++;

  // 집중 모드: 쉬러 간 사람이 생기면 켠다 → 그 사람들이 답하고 자리로, 이후 아무도 쉬러 안 간다
  run(sim, 120, () => sim.agents.some(a => a.activity), `쉬는 사람 생김 seed=${seed}`);
  const away = sim.agents.filter(a => a.activity).map(a => a.id);
  r = ask('집중 모드');
  for (const id of away) assert.ok(r.some(x => x.id === id && /자리로 돌아갑니다|일에 집중하겠습니다/.test(x.text)), `${id} 답함`);
  assert.ok(r[r.length - 1].text.includes('집중 모드 켰습니다'), r[r.length - 1].text);
  run(sim, 60, () => sim.agents.every(a => a.x === a.seat[0] && a.y === a.seat[1] && !a.goal && !a.next), `집중 모드 복귀 seed=${seed}`);
  for (let i = 0; i < 30 * 30; i++) { sim.tick(1 / 30); assert.ok(sim.agents.every(a => !a.activity), '집중 모드 중 커피·잡담 없음'); }
  r = ask('집중 모드 해제');
  assert.ok(r[0].text.includes('해제')); assert.ok(!sim.focus.on); checks++;

  // 모르는 말
  r = ask('점심 뭐 먹지');
  assert.strictEqual(r[0].id, 'secretary'); assert.ok(r[0].text.includes('모르는 말')); checks++;
}
console.log(`통과: 6개 시드 × 지시 ${checks / 6}종 검사 (현황 보고 · 왜 늦어져?(①결정 대기 ②작업 중 ③연동 ④지연 없음) · 재무팀/검수팀/제작팀 뭐해? · 회의 소집 · 집중 모드 · 모르는 말)`);
