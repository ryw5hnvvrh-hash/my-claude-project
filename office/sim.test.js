// node office/sim.test.js — 여러 시나리오를 돌려 겹침·벽 통과·교착이 없는지, 하루 12단계가 정해진 대로 도는지 확인한다.
const assert = require('assert');
const PF = require('./pathfinding');
const { createSim, DAY } = require('./sim');
const MAP = require('./map.json');

// 재현 가능한 난수
function rng(seed) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }
const room = id => MAP.rooms.find(r => r.id === id);
const inRoom = (a, r) => a.present && a.x >= r.x && a.x < r.x + r.w && a.y >= r.y && a.y < r.y + r.h;

function run(sim, maxSec, done, label, each) {
  const dt = 1 / 30;
  for (let t = 0; t < maxSec; t += dt) {
    sim.tick(dt);
    const seen = new Map();
    for (const a of sim.agents) {
      if (!a.present) continue;
      assert.ok(sim.walkable(a.x, a.y), `${label}: ${a.person} 벽·가구 위 (${a.x},${a.y})`);
      for (const p of [[a.x, a.y], a.next].filter(Boolean)) {
        const k = p.join(',');
        // 내가 떠나는 칸과 들어가는 칸 둘 다 내 것. 다른 직원과 겹치면 안 된다.
        assert.ok(!seen.has(k) || seen.get(k) === a.id, `${label}: ${a.person}와 ${seen.get(k)} 겹침 (${k}) t=${t.toFixed(2)}`);
        seen.set(k, a.id);
      }
      if (a.next) assert.strictEqual(Math.abs(a.next[0] - a.x) + Math.abs(a.next[1] - a.y), 1, '한 칸씩 이동');
    }
    if (each) each();
    if (done()) return t;
  }
  throw new Error(`${label}: ${maxSec}초 안에 끝나지 않음 (교착 의심) — 단계 ${sim.day.step} ${sim.day.label} — ` +
    sim.agents.map(a => `${a.short}@${a.x},${a.y}:${a.state}/${a.work}`).join(' '));
}
const allHome = s => s.agents.every(a => a.x === a.seat[0] && a.y === a.seat[1] && !a.goal && !a.next);
const allSettled = s => s.agents.every(a => !a.goal && !a.next && a.state !== 'talk');

for (let seed = 1; seed <= 20; seed++) {
  const sim = createSim(MAP, PF, rng(seed));
  assert.strictEqual(sim.agents.length, 10, '직원 9명 + 대표');
  assert.ok(sim.agents.every(a => a.state === 'sit' && a.work === 'idle'), '처음엔 모두 자리에 앉아 대기');

  // 1. 회의 소집 → 10명 모두 회의실 의자에 앉음
  sim.meeting();
  run(sim, 60, () => allSettled(sim), `회의 seed=${seed}`);
  for (const a of sim.agents) {
    assert.ok(inRoom(a, room('meeting')), `${a.person} 회의실 밖`);
    assert.strictEqual(a.state, 'sit', `${a.person} 앉기 아님`);
  }

  // 2. 자리로 → 모두 자기 책상에 앉음
  sim.returnAll();
  run(sim, 60, () => allHome(sim), `복귀 seed=${seed}`);

  // 3. 하루 12단계. 시드마다 데이터 연결·일요일 조합을 바꾼다.
  const linked = seed % 2 === 0, sunday = seed % 3 === 0;
  sim.links.data = sim.links.finance = linked;
  sim.options.sunday = sunday;
  const seenSteps = new Set(), approvals = [];
  let entered = 0, handover = false, bothMaking = false, briefingInCeoRoom = false, maxStep = 0;
  sim.startDay();
  run(sim, 400, () => !sim.day.running && allSettled(sim), `하루 seed=${seed}`, () => {
    const d = sim.day;
    assert.ok(d.step >= maxStep, '단계는 거꾸로 가지 않는다'); maxStep = d.step;
    seenSteps.add(d.step);
    // ① 출근: 새로 나타난 직원은 정문 칸에서 시작한다
    const present = sim.agents.filter(a => a.present).length;
    if (present > entered) {
      const a = sim.agents[present - 1];
      assert.deepStrictEqual([a.x, a.y], MAP.spawn, `${a.person}은 정문으로 들어온다`);
      entered = present;
    }
    // ② 인수인계: 조사·기획1·검수 3명이 회의실에서 대화
    if (d.step === 2 && sim.agents.some(a => a.state === 'talk')) {
      for (const id of ['research', 'plan1', 'qa']) assert.ok(inRoom(sim.byId[id], room('meeting')), `② ${id} 회의실`);
      handover = true;
    }
    // ⑦·⑧ 승인 대기: 누를 때까지 멈춘다
    if (d.awaiting && !approvals.includes(d.awaiting.what)) {
      approvals.push(d.awaiting.what);
      if (d.step === 7) {
        for (const id of ['research', 'plan1', 'qa', 'ceo']) assert.ok(inRoom(sim.byId[id], room('meeting')), `⑦ ${id} 회의실`);
        assert.strictEqual(sim.byId.plan1.work, 'approve');
        assert.strictEqual(sim.byId.qa.work, 'approve');
      }
      const step = d.step, label = d.label;
      for (let i = 0; i < 150; i++) sim.tick(1 / 30);   // 5초 기다려도
      assert.strictEqual(d.step, step, '승인 전에는 다음 단계로 가지 않는다');
      assert.strictEqual(d.label, label);
      sim.approve();
    }
    // ⑨ 릴스·캐러셀 동시 진행
    if (d.step === 9 && sim.byId.reels.work === 'doing' && sim.byId.carousel.work === 'doing') bothMaking = true;
    // ⑫ 비서가 대표실로 걸어와 보고
    if (d.step === 12 && sim.byId.secretary.state === 'talk' && inRoom(sim.byId.secretary, room('ceo'))) briefingInCeoRoom = true;
  });
  assert.strictEqual(entered, 10, '10명 모두 출근');
  assert.deepStrictEqual([...seenSteps].sort((a, b) => a - b), DAY.map(s => s.n), '12단계 모두 지남');
  assert.ok(handover, '② 3명 인수인계');
  assert.deepStrictEqual(approvals, ['TOP 3 중 1개 승인', '대본 최종 확인'], '승인 2번');
  assert.ok(bothMaking, '⑨ 동시 제작');
  assert.ok(briefingInCeoRoom, '⑫ 대표실에서 보고');
  assert.deepStrictEqual(sim.day.results.qa, { reject: 3, pass: 7 }, '⑤ 반려 3 / 통과 7');
  assert.strictEqual(sim.day.results.brand, linked ? '완료' : '연동 대기', '③ 미연동이면 만들지 않음');
  assert.ok(/^(0[7-9]|1\d|2[0-3]):[0-5]\d$/.test(sim.clock()), '시계 ' + sim.clock());
  const expect = {
    research: linked ? 'done' : 'link', plan1: 'done', qa: 'done', ceo: 'done', plan2: 'done',
    review: linked ? 'done' : 'link', finance: sunday ? (linked ? 'done' : 'link') : 'idle',
    secretary: 'done', reels: 'done', carousel: 'done',
  };
  for (const a of sim.agents) assert.strictEqual(a.work, expect[a.id], `${a.person} 업무 상태 ${a.work}, 기대 ${expect[a.id]}`);

  // 4. 회의 가는 도중(1.5초 뒤)에 복귀 명령 → 방향이 엇갈려도 모두 자리로
  sim.meeting();
  let elapsed = 0;
  run(sim, 5, () => (elapsed += 1 / 30) >= 1.5, `중간 취소 seed=${seed}`);
  sim.returnAll();
  run(sim, 60, () => allHome(sim), `중간 취소 후 복귀 seed=${seed}`);

  // 5. 출근 도중(1초 뒤)에 복귀 명령 → 아직 안 들어온 직원도 자리에 놓이고 모두 자리로
  sim.startDay();
  elapsed = 0;
  run(sim, 5, () => (elapsed += 1 / 30) >= 1, `출근 중 seed=${seed}`);
  assert.ok(sim.agents.some(a => !a.present), '출근이 아직 진행 중');
  sim.returnAll();
  assert.ok(sim.agents.every(a => a.present), '멈추면 모두 사무실 안');
  run(sim, 60, () => allHome(sim), `출근 중 복귀 seed=${seed}`);
}
console.log('통과: 20개 시드 × (회의 소집 · 자리 복귀 · 하루 12단계(승인 2번, 연동 있음/없음, 일요일 정산) · 이동 중 취소 · 출근 중 취소) — 겹침 0, 벽 통과 0, 교착 0');
