// 직원 이동 시뮬레이션. 화면 그리기와 분리되어 있어서 Node에서도 돌릴 수 있다.
// 동작 5종(애니메이션): walk(걷기) / type(타이핑) / talk(대화) / sit(앉기) / idle(서 있기)
// 업무 상태 5종(말풍선): done(완료) / doing(진행 중) / approve(승인 대기) / link(연동 대기) / idle(대기)
(function (root) {
  const STATES = { walk: '걷기', type: '타이핑', talk: '대화', sit: '앉기', idle: '서 있기' };
  const WORK = {
    done: { label: '완료', meaning: '이번 단계 끝', say: '완료했어요!' },
    doing: { label: '진행 중', meaning: '지금 작업 중', say: '일하는 중…' },
    approve: { label: '승인 대기', meaning: '대표 결정을 기다림', say: '확인해주세요' },
    link: { label: '연동 대기', meaning: '외부 자료가 없어 멈춤', say: '연결 기다려요' },
    idle: { label: '대기', meaning: '앞 단계를 기다림', say: '업무 대기중' },
  };
  // name: 부서 이름, person: 직원 이름, lines: 말버릇 (대화할 때 하나씩 말한다)
  const STAFF = [
    { id: 'research', name: '시장조사팀', short: '조사', person: '이희승', role: '팀장',
      lines: ['출처 없는 건 미확인으로 적습니다.', '공식 페이지부터 확인하겠습니다.'] },
    { id: 'plan1', name: '기획 1팀', short: '기획1', person: '이곽범', role: '팀장',
      lines: ['촬영 못 하는 아이디어는 안 해요.', 'TOP 3부터 추려볼게요.'] },
    { id: 'qa', name: '브랜드 검수팀', short: '검수', person: '홍선', role: '팀장',
      lines: ['근거 없는 가격 표기는 통과 안 해요.', '금칙어부터 확인할게요.'] },
    { id: 'ceo', name: '대표실', short: '대표', person: '이선홍', role: '대표', lines: [] },
    { id: 'plan2', name: '기획 2팀', short: '기획2', person: '정명철', role: '팀장',
      lines: ['아~승인 안 난 건 안써요.', '아~ 촬영 순서부터 확인요.'] },
    { id: 'review', name: '성과 리뷰실', short: '성과', person: '김희선', role: '팀장',
      lines: ['수치 없는 건 추정 안합니다.', '저장 수부터 확인해볼게요.'] },
    { id: 'finance', name: '정산팀', short: '정산', person: '현진', role: '팀장',
      lines: ['판매금액 정리했습니다.', '입금 대기 건부터 확인하겠습니다.'] },
    { id: 'secretary', name: '비서실', short: '비서', person: '박치원', role: '비서실장',
      lines: ['보고 드리겠습니다 대표님.', '대표님 괜찮으신가요?.'] },
  ];
  // 하루 파이프라인. approval: 대표가 눌러야 넘어가는 단계. link: 외부 자료가 있어야 하는 단계.
  const PIPELINE = [
    { from: 'research', to: 'plan1', what: '조사 자료 전달' },
    { from: 'plan1', to: 'qa', what: '아이디어 TOP 3 전달' },
    { from: 'qa', to: 'ceo', what: '검수 통과안 보고', approval: 'TOP 3 중 1개 승인' },
    { from: 'ceo', to: 'plan2', what: '1차 승인안 전달' },
    { from: 'plan2', to: 'ceo', what: '대본 최종 확인 요청', approval: '대본 최종 확인' },
    { from: 'review', to: 'secretary', what: '성과 기록 공유', link: 'review' },
    { from: 'finance', to: 'secretary', what: '주간 정산 공유 (일요일)', link: 'finance' },
    { from: 'secretary', to: 'ceo', what: '오늘 브리핑' },
  ];
  const SKIP_SEC = 1.2;   // 연동 대기로 건너뛸 때 다음 단계까지 쉬는 시간
  const SPEED = 4;        // 초당 칸 수
  const TALK_SEC = 3.2;   // 대화 시간: 앞 절반은 찾아간 직원, 뒤 절반은 받는 직원이 말한다
  const SAY_SEC = 3;      // 직원을 눌렀을 때 말버릇 말풍선이 떠 있는 시간
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
        path: [], goal: null, state: 'type', work: 'idle', wait: 0, goalWait: 0,
        onArrive: null, talkUntil: 0, talkStart: 0, talkFirst: false, afterTalk: null, talkWith: null, dir: 1,
        line: '', sayUntil: 0,
      };
    });
    const byId = Object.fromEntries(agents.map(a => [a.id, a]));
    let time = 0;
    const pipeline = { step: -1, label: '', running: false, awaiting: null };
    // 외부 자료 연결 여부: 성과 리뷰실(förc), 정산팀(finance/input)
    const links = { review: false, finance: false };
    let timers = [];
    const later = (sec, fn) => timers.push({ at: time + sec, fn });

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
      a.talkStart = b.talkStart = time;
      a.talkFirst = true; b.talkFirst = false;
      a.line = pick(a); b.line = pick(b);
      a.dir = b.x >= a.x ? 1 : -1; b.dir = -a.dir;
      a.afterTalk = () => { a.talkWith = null; if (then) then(); };
      b.afterTalk = () => { b.talkWith = null; if (!b.goal) b.state = restState(b); };
    }

    const who = a => a.id === 'ceo' ? `${a.person} 대표` : `${a.person}(${a.name})`;
    const pick = a => a.lines.length ? a.lines[Math.floor(rand() * a.lines.length)] : '';
    // 지금 말하고 있는 문장. 대화 중이면 자기 차례일 때, 아니면 눌렀을 때 SAY_SEC 동안.
    function speech(a) {
      if (a.state === 'talk') {
        const mine = (time - a.talkStart < TALK_SEC / 2) === a.talkFirst;
        return mine ? a.line : '';
      }
      return time < a.sayUntil ? a.line : '';
    }
    function say(id) {
      const a = byId[id];
      if (!a.lines.length) return '';
      const rest = a.lines.filter(l => l !== a.line);
      a.line = rest.length ? rest[Math.floor(rand() * rest.length)] : a.lines[0];
      a.sayUntil = time + SAY_SEC;
      return a.line;
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
      const due = timers.filter(t => t.at <= time);
      timers = timers.filter(t => t.at > time);
      due.forEach(t => t.fn());
      for (const a of agents) stepAgent(a, dt);
    }

    // 명령
    function stopPipeline() { pipeline.running = false; pipeline.label = ''; pipeline.awaiting = null; timers = []; }
    function meeting() {
      stopPipeline();
      agents.forEach((a, i) => send(a.id, meetingSeats[i]));
    }
    function returnAll() {
      stopPipeline();
      agents.forEach(a => goHome(a.id));
    }
    function runPipeline() {
      stopPipeline();
      agents.forEach(a => a.work = 'idle');
      pipeline.running = true; pipeline.step = -1;
      nextStep();
    }
    function nextStep() {
      if (!pipeline.running) return;
      pipeline.step++;
      if (pipeline.step >= PIPELINE.length) { pipeline.running = false; pipeline.label = '오늘 흐름 완료'; return; }
      const st = PIPELINE[pipeline.step];
      const a = byId[st.from], b = byId[st.to];
      const last = pipeline.step === PIPELINE.length - 1;
      if (st.link && !links[st.link]) {
        // 외부 자료가 없으면 이 단계는 멈춰 두고 다음 단계로 넘어간다
        a.work = 'link';
        pipeline.label = `${who(a)}: 외부 자료가 없어 멈춤 — 다음 단계로`;
        later(SKIP_SEC, nextStep);
        return;
      }
      a.work = 'doing';
      pipeline.label = `${who(a)} → ${who(b)}: ${st.what}`;
      const target = [b.next ? b.next[0] : b.x, b.next ? b.next[1] : b.y];
      send(st.from, target, () => {
        // 도착했는데 상대가 옆에 없으면(움직였으면) 다시 따라간다
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) { pipeline.step--; nextStep(); return; }
        talk(a, b, () => {
          goHome(st.from);
          if (st.approval) {
            // 대표 결정을 기다린다. approve()가 불릴 때까지 흐름이 멈춘다.
            a.work = 'approve'; b.work = 'doing';
            pipeline.awaiting = { step: pipeline.step, from: a.id, what: st.approval };
            pipeline.label = `${who(a)}: ${st.approval} 대기 중`;
            return;
          }
          a.work = a.id === 'ceo' ? 'idle' : 'done';
          b.work = last ? 'done' : 'doing';
          if (last) a.work = 'done';
          nextStep();
        });
      });
    }
    function approve() {
      const w = pipeline.awaiting;
      if (!w) return false;
      pipeline.awaiting = null;
      byId[w.from].work = 'done';
      byId.ceo.work = 'idle';
      nextStep();
      return true;
    }

    return {
      agents, byId, tick, send, goHome, meeting, returnAll, runPipeline, approve, pipeline, links, speech, say, who, TALK_SEC,
      walkable, STATES, get time() { return time; },
    };
  }

  const api = { createSim, STATES, WORK, STAFF, PIPELINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OfficeSim = api;
})(typeof window !== 'undefined' ? window : this);
