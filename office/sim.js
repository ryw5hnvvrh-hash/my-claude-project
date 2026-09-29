// 직원 이동 시뮬레이션. 화면 그리기와 분리되어 있어서 Node에서도 돌릴 수 있다.
// 상태 5종: walk(걷기) / type(타이핑) / talk(대화) / sit(앉기) / idle(대기)
(function (root) {
  const STATES = { walk: '걷기', type: '타이핑', talk: '대화', sit: '앉기', idle: '대기' };
  const STAFF = [
    { id: 'research', name: '시장조사팀', short: '조사' },
    { id: 'plan1', name: '기획 1팀', short: '기획1' },
    { id: 'qa', name: '브랜드 검수팀', short: '검수' },
    { id: 'ceo', name: '대표', short: '대표' },
    { id: 'plan2', name: '기획 2팀', short: '기획2' },
    { id: 'review', name: '성과 리뷰실', short: '성과' },
    { id: 'finance', name: '정산팀', short: '정산' },
    { id: 'secretary', name: '비서실', short: '비서' },
  ];
  // 하루 파이프라인: [보내는 사람, 받는 사람, 전달 내용]
  const PIPELINE = [
    ['research', 'plan1', '조사 자료 전달'],
    ['plan1', 'qa', '아이디어 TOP 3 전달'],
    ['qa', 'ceo', '검수 통과안 보고'],
    ['ceo', 'plan2', '1차 승인안 전달'],
    ['plan2', 'ceo', '대본 최종 확인 요청'],
    ['review', 'secretary', '성과 기록 공유'],
    ['finance', 'secretary', '주간 정산 공유 (일요일)'],
    ['secretary', 'ceo', '오늘 브리핑'],
  ];
  const SPEED = 4;        // 초당 칸 수
  const TALK_SEC = 2.4;   // 대화 시간
  const SIDESTEP_SEC = 1.0; // 이만큼 막혀 있으면 옆으로 비켜선다
  const RETARGET_SEC = 2.5; // 목적지가 계속 막혀 있으면 가까운 빈 칸으로 목적지를 바꾼다

  function createSim(MAP, PF, rand) {
    rand = rand || Math.random;
    const W = MAP.width, H = MAP.height;
    const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && MAP.legend[MAP.tiles[y][x]].walkable;
    const key = (x, y) => x + ',' + y;
    const room = id => MAP.rooms.find(r => r.id === id);
    const meetingSeats = room('meeting').seats;

    const agents = STAFF.map(s => {
      const seat = room(s.id).seats[0];
      return {
        ...s, seat, x: seat[0], y: seat[1], next: null, progress: 0,
        path: [], goal: null, state: 'type', wait: 0, goalWait: 0,
        onArrive: null, talkUntil: 0, afterTalk: null, talkWith: null, dir: 1,
      };
    });
    const byId = Object.fromEntries(agents.map(a => [a.id, a]));
    let time = 0;
    const pipeline = { step: -1, label: '', running: false };

    // 다른 직원이 서 있거나 들어가려는 칸
    function blockedFor(me) {
      const s = new Set();
      for (const a of agents) {
        if (a === me) continue;
        s.add(key(a.x, a.y));
        if (a.next) s.add(key(a.next[0], a.next[1]));
      }
      return s;
    }
    function restState(a) {
      if (a.x === a.seat[0] && a.y === a.seat[1]) return 'type';
      return MAP.tiles[a.y][a.x] === 'c' ? 'sit' : 'idle';
    }

    function send(id, target, onArrive) {
      const a = byId[id];
      // 걷는 중이면 지금 들어가고 있는 칸에서부터 길을 찾는다
      const from = a.next ? [a.next[0], a.next[1]] : [a.x, a.y];
      const goal = PF.nearestFree(target, walkable, blockedFor(a), from) || target;
      a.goal = goal; a.path = PF.findPath(from, goal, walkable, blockedFor(a)) || [];
      a.onArrive = onArrive || null; a.wait = 0; a.goalWait = 0; a.afterTalk = null; a.talkWith = null;
      if (a.x === goal[0] && a.y === goal[1] && !a.next) arrive(a);
      else if (a.state !== 'walk') a.state = 'idle';
    }
    function goHome(id, then) { send(id, byId[id].seat, then); }

    function arrive(a) {
      a.goal = null; a.path = [];
      const cb = a.onArrive; a.onArrive = null;
      a.state = restState(a);
      if (cb) cb(a);
    }
    function talk(a, b, then) {
      a.state = b.state = 'talk';
      a.talkWith = b.id; b.talkWith = a.id;
      a.talkUntil = b.talkUntil = time + TALK_SEC;
      a.dir = b.x >= a.x ? 1 : -1; b.dir = -a.dir;
      a.afterTalk = () => { a.talkWith = null; if (then) then(); };
      b.afterTalk = () => { b.talkWith = null; if (!b.goal) b.state = restState(b); };
    }

    function stepAgent(a, dt) {
      if (a.state === 'talk') {
        if (time >= a.talkUntil) { const f = a.afterTalk; a.afterTalk = null; a.state = restState(a); if (f) f(); }
        return;
      }
      if (a.next) {
        a.progress += dt * SPEED;
        if (a.progress < 1) return;
        a.x = a.next[0]; a.y = a.next[1]; a.next = null; a.progress = 0;
      }
      if (!a.goal) return;
      if (a.x === a.goal[0] && a.y === a.goal[1]) { arrive(a); return; }

      const blocked = blockedFor(a);
      let cand = a.path[0];
      // 걸어오는 직원과 마주쳤을 때: 둘 다 동시에 피하면 같은 쪽으로 계속 비켜서는 '거울 춤'이 생긴다.
      // 우선순위(목록 순서)가 낮은 쪽이 잠깐 멈춰 서고, 높은 쪽이 멈춘 직원을 돌아간다.
      const blocker = cand && agents.find(o => o !== a && ((o.x === cand[0] && o.y === cand[1]) || (o.next && o.next[0] === cand[0] && o.next[1] === cand[1])));
      if (blocker && blocker.goal && agents.indexOf(blocker) < agents.indexOf(a) && a.wait < SIDESTEP_SEC) {
        a.state = 'idle'; a.wait += dt;
        return;
      }
      if (!cand || blocked.has(key(cand[0], cand[1]))) {
        // 앞 칸에 다른 직원이 있다 → 그 칸들을 막힌 칸으로 두고 A*로 다시 찾는다
        a.path = PF.findPath([a.x, a.y], a.goal, walkable, blocked) || [];
        cand = a.path[0];
      }
      if (cand && !blocked.has(key(cand[0], cand[1]))) {
        a.path.shift();
        a.next = cand; a.progress = 0; a.wait = 0; a.goalWait = 0; a.state = 'walk';
        if (cand[0] !== a.x) a.dir = cand[0] > a.x ? 1 : -1;
        return;
      }
      // 길이 없다 (문이나 목적지를 누가 막고 있음) → 기다린다
      a.state = 'idle'; a.wait += dt; a.goalWait += dt;
      if (a.goalWait > RETARGET_SEC && blocked.has(key(a.goal[0], a.goal[1]))) {
        const g = PF.nearestFree(a.goal, walkable, blocked, [a.x, a.y]);
        if (g) { a.goal = g; a.path = []; a.goalWait = 0; }
      }
      if (a.wait > SIDESTEP_SEC) {
        // 서로 마주 보고 막힌 경우를 풀기 위해 빈 옆 칸으로 한 칸 비켜선다
        const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => [a.x + dx, a.y + dy])
          .filter(([x, y]) => walkable(x, y) && !blocked.has(key(x, y)));
        if (opts.length) {
          const c = opts[Math.floor(rand() * opts.length)];
          a.next = c; a.progress = 0; a.path = []; a.state = 'walk';
          if (c[0] !== a.x) a.dir = c[0] > a.x ? 1 : -1;
        }
        a.wait = 0;
      }
    }

    function tick(dt) {
      time += dt;
      for (const a of agents) stepAgent(a, dt);
    }

    // 명령
    function meeting() {
      pipeline.running = false; pipeline.label = '';
      agents.forEach((a, i) => send(a.id, meetingSeats[i]));
    }
    function returnAll() {
      pipeline.running = false; pipeline.label = '';
      agents.forEach(a => goHome(a.id));
    }
    function runPipeline() {
      pipeline.running = true; pipeline.step = -1;
      nextStep();
    }
    function nextStep() {
      if (!pipeline.running) return;
      pipeline.step++;
      if (pipeline.step >= PIPELINE.length) { pipeline.running = false; pipeline.label = '오늘 흐름 완료'; return; }
      const [from, to, what] = PIPELINE[pipeline.step];
      const a = byId[from], b = byId[to];
      pipeline.label = `${a.name} → ${b.name}: ${what}`;
      const target = [b.next ? b.next[0] : b.x, b.next ? b.next[1] : b.y];
      send(from, target, () => {
        // 도착했는데 상대가 옆에 없으면(움직였으면) 다시 따라간다
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) { pipeline.step--; nextStep(); return; }
        talk(a, b, () => { goHome(from); nextStep(); });
      });
    }

    return {
      agents, byId, tick, send, goHome, meeting, returnAll, runPipeline, pipeline,
      walkable, STATES, get time() { return time; },
    };
  }

  const api = { createSim, STATES, STAFF, PIPELINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OfficeSim = api;
})(typeof window !== 'undefined' ? window : this);
