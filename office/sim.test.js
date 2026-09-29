// node office/sim.test.js — 여러 시나리오를 돌려 겹침·벽 통과·교착이 없는지 확인한다.
const assert = require('assert');
const PF = require('./pathfinding');
const { createSim, PIPELINE } = require('./sim');
const MAP = require('./map.json');

// 재현 가능한 난수
function rng(seed) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }

function run(sim, maxSec, done, label) {
  const dt = 1 / 30;
  for (let t = 0; t < maxSec; t += dt) {
    sim.tick(dt);
    const seen = new Map();
    for (const a of sim.agents) {
      assert.ok(sim.walkable(a.x, a.y), `${label}: ${a.name} 벽·가구 위 (${a.x},${a.y})`);
      for (const p of [[a.x, a.y], a.next].filter(Boolean)) {
        const k = p.join(',');
        // 내가 떠나는 칸과 들어가는 칸 둘 다 내 것. 다른 직원과 겹치면 안 된다.
        assert.ok(!seen.has(k) || seen.get(k) === a.id, `${label}: ${a.name}와 ${seen.get(k)} 겹침 (${k}) t=${t.toFixed(2)}`);
        seen.set(k, a.id);
      }
      if (a.next) assert.strictEqual(Math.abs(a.next[0] - a.x) + Math.abs(a.next[1] - a.y), 1, '한 칸씩 이동');
    }
    if (done()) return t;
  }
  throw new Error(`${label}: ${maxSec}초 안에 끝나지 않음 (교착 의심) — ` +
    sim.agents.map(a => `${a.short}@${a.x},${a.y}:${a.state}`).join(' '));
}
const allHome = s => s.agents.every(a => a.x === a.seat[0] && a.y === a.seat[1] && !a.goal && !a.next);
const allSettled = s => s.agents.every(a => !a.goal && !a.next && a.state !== 'talk');

for (let seed = 1; seed <= 20; seed++) {
  const sim = createSim(MAP, PF, rng(seed));
  assert.ok(sim.agents.every(a => a.state === 'type'), '처음엔 모두 자리에서 타이핑');

  // 1. 회의 소집 → 8명 모두 회의실 의자에 앉음
  sim.meeting();
  const t1 = run(sim, 60, () => allSettled(sim), `회의 seed=${seed}`);
  const meet = MAP.rooms.find(r => r.id === 'meeting');
  for (const a of sim.agents) {
    assert.ok(a.x >= meet.x && a.x < meet.x + meet.w && a.y >= meet.y && a.y < meet.y + meet.h, `${a.name} 회의실 밖`);
    assert.strictEqual(a.state, 'sit', `${a.name} 앉기 아님`);
  }

  // 2. 자리로 → 모두 자기 책상에서 타이핑
  sim.returnAll();
  const t2 = run(sim, 60, () => allHome(sim), `복귀 seed=${seed}`);
  assert.ok(sim.agents.every(a => a.state === 'type'));

  // 3. 하루 흐름 → 8번 전달, 매번 대화, 끝나면 모두 자리
  const talks = new Set();
  sim.runPipeline();
  run(sim, 180, () => {
    sim.agents.forEach(a => a.state === 'talk' && talks.add(sim.pipeline.step));
    return !sim.pipeline.running && allHome(sim);
  }, `하루 흐름 seed=${seed}`);
  assert.strictEqual(talks.size, PIPELINE.length, '단계마다 대화');

  // 4. 회의 가는 도중(1.5초 뒤)에 복귀 명령 → 방향이 엇갈려도 모두 자리로
  sim.meeting();
  let elapsed = 0;
  run(sim, 5, () => (elapsed += 1 / 30) >= 1.5, `중간 취소 seed=${seed}`);
  sim.returnAll();
  run(sim, 60, () => allHome(sim), `중간 취소 후 복귀 seed=${seed}`);
}
console.log('통과: 20개 시드 × (회의 소집 · 자리 복귀 · 하루 흐름 · 이동 중 취소) — 겹침 0, 벽 통과 0, 교착 0');
