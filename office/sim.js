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
  // name: 부서 이름, person: 직원 이름, room/seat: 책상 위치, lines: 말버릇 (대화할 때 하나씩 말한다)
  // 목록 순서가 길 양보 우선순위다(앞이 먼저 지나간다).
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
    { id: 'reels', name: '제작팀', short: '릴스', person: '릴스 담당', role: '팀원', room: 'studio', seat: 0,
      lines: ['받은 대본 장면 순서대로 편집하겠습니다.', '원본은 덮어쓰지 않겠습니다.'] },
    { id: 'carousel', name: '제작팀', short: '캐러셀', person: '캐러셀 담당', role: '팀원', room: 'studio', seat: 1,
      lines: ['확인된 가격만 넣을게요.', '장수부터 맞춰볼게요.'] },
  ];
  // 하루 12단계. 화면의 단계표와 테스트가 이 목록을 쓴다.
  const DAY = [
    { n: 1, title: '07:00 전원 출근', note: '정문 → 각자 자리' },
    { n: 2, title: '시장조사', note: '완료 후 3명이 회의실에서 인수인계' },
    { n: 3, title: '브랜드 분석', note: '데이터 미연동이면 만들지 않고 연동 대기로 기록' },
    { n: 4, title: '아이디어 10개', note: '기획 1팀' },
    { n: 5, title: '브랜드 QA', note: '10개 검사 → 반려·통과' },
    { n: 6, title: 'TOP 3 선정', note: '통과안 중 3개' },
    { n: 7, title: '★ 대표 승인 대기', note: '3명 + 대표가 회의실 · 승인 누를 때까지 멈춤' },
    { n: 8, title: '대본 작성', note: '최종 확인 후 제작팀으로 걸어가 전달' },
    { n: 9, title: '릴스·캐러셀 제작', note: '동시 진행' },
    { n: 10, title: '결과물 저장', note: 'media/ · scripts/' },
    { n: 11, title: '성과 기록', note: '일요일은 정산 포함' },
    { n: 12, title: '비서실 브리핑', note: '비서가 대표실로 걸어와 보고' },
  ];
  const QA_RESULT = { reject: 3, pass: 7 };   // 대표가 정한 오늘 검수 결과
  const DAY_START_MIN = 7 * 60;  // 07:00
  const MIN_PER_SEC = 4;         // 시뮬레이션 1초 = 회사 시간 4분
  const SPEED = 4;               // 초당 칸 수
  const TALK_SEC = 3.2;          // 대화 시간: 앞 절반은 찾아간 직원, 뒤 절반은 받는 직원이 말한다
  const SAY_SEC = 3;             // 직원을 눌렀을 때 말버릇 말풍선이 떠 있는 시간
  const SIDESTEP_SEC = 1.0;      // 이만큼 막혀 있으면 옆으로 비켜선다
  const RETARGET_SEC = 2.5;      // 목적지가 계속 막혀 있으면 가까운 빈 칸으로 목적지를 바꾼다
  const ARRIVE_GAP = 0.35;       // 출근할 때 정문으로 들어오는 간격

  function createSim(MAP, PF, rand) {
    rand = rand || Math.random;
    const W = MAP.width, H = MAP.height;
    const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && MAP.legend[MAP.tiles[y][x]].walkable;
    const key = (x, y) => x + ',' + y;
    const room = id => MAP.rooms.find(r => r.id === id);
    const meetingRoom = room('meeting');
    const entrance = MAP.spawn;

    const agents = STAFF.map(s => {
      const seat = room(s.room || s.id).seats[s.seat || 0];
      return {
        ...s, seat, x: seat[0], y: seat[1], present: true, next: null, progress: 0,
        path: [], goal: null, state: 'sit', work: 'idle', wait: 0, goalWait: 0,
        onArrive: null, talkUntil: 0, talkStart: 0, talkFirst: false, afterTalk: null, talkWith: null, dir: 1,
        line: '', sayUntil: 0,
      };
    });
    const byId = Object.fromEntries(agents.map(a => [a.id, a]));
    let time = 0;
    const day = { running: false, step: 0, label: '', awaiting: null, startedAt: null, endedAt: null, results: {} };
    // 외부 자료: data = förc 성과 데이터(브랜드 분석·성과 기록), finance = 정산 입력 파일
    const links = { data: false, finance: false };
    const options = { sunday: false };
    let script = null, cond = null;

    const atSeat = a => a.present && a.x === a.seat[0] && a.y === a.seat[1];
    const settled = a => a.present && !a.goal && !a.next && a.state !== 'talk';
    const inRoom = (a, r) => a.present && a.x >= r.x && a.x < r.x + r.w && a.y >= r.y && a.y < r.y + r.h;

    // 다른 직원이 서 있거나 들어가려는 칸
    function blockedFor(me) {
      const s = new Set();
      for (const a of agents) {
        if (a === me || !a.present) continue;
        s.add(key(a.x, a.y));
        if (a.next) s.add(key(a.next[0], a.next[1]));
      }
      return s;
    }
    // 멈춰 있을 때의 동작: 자기 자리에서 일하는 중이면 타이핑, 의자면 앉기, 아니면 서 있기
    function restState(a) {
      if (atSeat(a)) return a.work === 'doing' ? 'type' : 'sit';
      return MAP.tiles[a.y][a.x] === 'c' ? 'sit' : 'idle';
    }

    function send(id, target, onArrive) {
      const a = byId[id];
      if (!a.present) return;
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
      b.afterTalk = () => { b.talkWith = null; };
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
      if (!a.present) return;
      if (a.state === 'talk') {
        if (time >= a.talkUntil) { const f = a.afterTalk; a.afterTalk = null; a.state = restState(a); if (f) f(); }
        return;
      }
      if (a.next) {
        a.progress += dt * SPEED;
        if (a.progress < 1) return;
        a.x = a.next[0]; a.y = a.next[1]; a.next = null; a.progress = 0;
      }
      if (!a.goal) { a.state = restState(a); return; }
      if (a.x === a.goal[0] && a.y === a.goal[1]) { arrive(a); return; }

      const blocked = blockedFor(a);
      let cand = a.path[0];
      // 걸어오는 직원과 마주쳤을 때: 둘 다 동시에 피하면 같은 쪽으로 계속 비켜서는 '거울 춤'이 생긴다.
      // 우선순위(목록 순서)가 낮은 쪽이 잠깐 멈춰 서고, 높은 쪽이 멈춘 직원을 돌아간다.
      const blocker = cand && agents.find(o => o !== a && o.present && ((o.x === cand[0] && o.y === cand[1]) || (o.next && o.next[0] === cand[0] && o.next[1] === cand[1])));
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
      // 하루 스크립트: 지금 기다리는 조건이 채워지면 다음 줄로 넘어간다
      for (let guard = 0; script && guard < 50; guard++) {
        if (cond && !cond()) break;
        const r = script.next();
        if (r.done) { script = null; cond = null; break; }
        cond = r.value;
      }
    }

    // ── 하루 스크립트에서 쓰는 동작들 (yield로 조건을 넘기면 그 조건이 참이 될 때까지 멈춘다)
    function* wait(sec) { const t = time + sec; yield () => time >= t; }
    function* walkAll(ids, targetOf) {
      ids.forEach(id => send(id, targetOf(byId[id])));
      yield () => ids.every(id => settled(byId[id]));
    }
    function* gather(ids) {
      // 회의실 빈 의자에 한 명씩 배정. 말풍선이 겹치지 않게 한 칸씩 띄워 앉힌다:
      // 위쪽 줄 1·3·5번째 → 아래쪽 줄 2·4번째 → 나머지 순서
      const taken = new Set(agents.filter(a => a.present && !ids.includes(a.id)).map(a => key(a.x, a.y)));
      const ys = [...new Set(meetingRoom.seats.map(s => s[1]))].sort((p, q) => p - q);
      const row = y => meetingRoom.seats.filter(s => s[1] === y).sort((p, q) => p[0] - q[0]);
      const top = row(ys[0]), bottom = row(ys[ys.length - 1]);
      const spread = [...top.filter((_, i) => i % 2 === 0), ...bottom.filter((_, i) => i % 2 === 1)];
      const order = [...spread, ...meetingRoom.seats.filter(s => !spread.includes(s))];
      const free = order.filter(s => !taken.has(key(s[0], s[1])));
      ids.forEach((id, i) => send(id, free[i] || meetingRoom.seats[0]));
      yield () => ids.every(id => settled(byId[id]));
    }
    function* converse(aId, bId) {
      const a = byId[aId], b = byId[bId];
      talk(a, b);
      yield () => a.state !== 'talk' && b.state !== 'talk';
    }
    function* visit(aId, bId) {
      // a가 b 옆 칸까지 걸어가서 대화한다. b가 그사이 움직였으면 다시 따라간다.
      const a = byId[aId], b = byId[bId];
      for (let tries = 0; tries < 4; tries++) {
        send(aId, [b.next ? b.next[0] : b.x, b.next ? b.next[1] : b.y]);
        yield () => settled(a);
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1) break;
      }
      yield () => settled(b) || b.state === 'sit' || b.state === 'type';
      yield* converse(aId, bId);
    }
    function* work(id, sec) {
      // 자기 자리에 앉아서 sec초 동안 일한다
      const a = byId[id];
      if (!atSeat(a) && !a.goal) goHome(id);
      yield () => atSeat(a) && settled(a);
      a.work = 'doing';
      yield* wait(sec);
    }
    const home = ids => ids.forEach(id => goHome(id));
    const setStep = (n, label) => { day.step = n; day.label = label; };
    function* awaitApproval(fromId, what, waiting) {
      waiting.forEach(id => { if (byId[id].work !== 'link') byId[id].work = 'approve'; });
      byId.ceo.work = 'doing';
      day.awaiting = { from: fromId, what, step: day.step };
      yield () => !day.awaiting;
      byId.ceo.work = 'idle';
    }

    function* dayScript() {
      // ① 07:00 전원 출근: 모두 밖에서 시작해 정문으로 한 명씩 들어와 자기 자리로
      setStep(1, '07:00 전원 출근 — 정문에서 각자 자리로');
      day.results = {};
      for (const a of agents) Object.assign(a, { present: false, goal: null, next: null, path: [], work: 'idle', state: 'idle', onArrive: null, afterTalk: null, talkWith: null });
      for (const a of agents) {
        yield () => !blockedFor(a).has(key(entrance[0], entrance[1]));
        Object.assign(a, { present: true, x: entrance[0], y: entrance[1], dir: 1 });
        goHome(a.id);
        yield* wait(ARRIVE_GAP);
      }
      yield () => agents.every(a => atSeat(a) && settled(a));

      // ② 시장조사 → 완료 후 3명이 회의실에 모여 인수인계
      setStep(2, `${who(byId.research)}: 시장조사`);
      yield* work('research', 3);
      byId.research.work = 'done';
      setStep(2, '시장조사 완료 — 3명이 회의실에서 인수인계');
      yield* gather(['research', 'plan1', 'qa']);
      yield* converse('research', 'plan1');
      yield* converse('research', 'qa');
      home(['research', 'plan1', 'qa']);

      // ③ 브랜드 분석 (시장조사팀이 같이 맡음)
      if (!links.data) {
        setStep(3, '브랜드 분석: 데이터 미연동 — 만들지 않고 연동 대기로 기록');
        byId.research.work = 'link';
        day.results.brand = '연동 대기';
        yield* wait(1.5);
      } else {
        setStep(3, `${who(byId.research)}: 브랜드 분석`);
        yield* work('research', 2.5);
        byId.research.work = 'done';
        day.results.brand = '완료';
      }

      // ④ 아이디어 10개 → 검수팀에 전달
      setStep(4, `${who(byId.plan1)}: 아이디어 10개`);
      yield* work('plan1', 3);
      setStep(4, '아이디어 10개 → 브랜드 검수팀에 전달');
      yield* visit('plan1', 'qa');
      byId.plan1.work = 'idle';
      goHome('plan1');

      // ⑤ 브랜드 QA → 반려 3 / 통과 7
      setStep(5, `${who(byId.qa)}: 10개 검사`);
      yield* work('qa', 3);
      day.results.qa = { ...QA_RESULT };
      setStep(5, `브랜드 QA 결과: 반려 ${QA_RESULT.reject}건 / 통과 ${QA_RESULT.pass}건 → 기획 1팀에 전달`);
      yield* visit('qa', 'plan1');
      byId.qa.work = 'done';
      goHome('qa');

      // ⑥ TOP 3 선정
      setStep(6, `${who(byId.plan1)}: 통과 ${QA_RESULT.pass}건 중 TOP 3 선정`);
      yield* work('plan1', 2);

      // ⑦ ★ 대표 승인 대기: 3명 + 대표가 회의실에 모이고, 승인을 누를 때까지 멈춘다
      setStep(7, '★ 대표 승인 대기 — 3명과 대표가 회의실로');
      yield* gather(['research', 'plan1', 'qa', 'ceo']);
      setStep(7, '★ 대표 승인 대기 — TOP 3 중 1개를 골라 승인을 눌러 주세요');
      yield* awaitApproval('plan1', 'TOP 3 중 1개 승인', ['research', 'plan1', 'qa']);
      ['plan1', 'qa'].forEach(id => byId[id].work = 'done');
      if (byId.research.work !== 'link') byId.research.work = 'done';
      setStep(7, '승인 완료');
      yield* converse('ceo', 'plan1');
      home(['research', 'plan1', 'qa']);

      // ⑧ 대본 작성 → 최종 확인 → 제작팀으로 걸어가 전달
      setStep(8, '대표가 승인안을 기획 2팀에 전달');
      yield* visit('ceo', 'plan2');
      goHome('ceo');
      setStep(8, `${who(byId.plan2)}: 대본 작성`);
      yield* work('plan2', 3.5);
      setStep(8, '대본 완성 — 대표실로 최종 확인 요청');
      yield* visit('plan2', 'ceo');
      setStep(8, '대본 최종 확인 대기 — 확인을 눌러 주세요');
      yield* awaitApproval('plan2', '대본 최종 확인', ['plan2']);
      setStep(8, '최종 확인 완료 — 기획 2팀이 제작팀으로 전달');
      yield* visit('plan2', 'reels');
      yield* visit('plan2', 'carousel');
      byId.plan2.work = 'done';
      goHome('plan2');

      // ⑨ 릴스·캐러셀 제작 (동시 진행)
      setStep(9, '릴스·캐러셀 제작 (동시 진행)');
      const r = work('reels', 4), c = work('carousel', 4);
      // 두 사람을 같은 시각에 시작시키기 위해 두 스크립트를 번갈아 진행한다
      let rv = r.next(), cv = c.next();
      yield () => {
        while (!rv.done && rv.value()) rv = r.next();
        while (!cv.done && cv.value()) cv = c.next();
        return rv.done && cv.done;
      };

      // ⑩ 결과물 저장
      setStep(10, '결과물 저장 — media/·scripts/ 에 복제본으로');
      yield* wait(1.5);
      byId.reels.work = byId.carousel.work = 'done';

      // ⑪ 성과 기록 (+ 일요일이면 정산)
      if (!links.data) {
        setStep(11, '성과 기록: förc 데이터 미연동 — 연동 대기로 기록');
        byId.review.work = 'link';
        day.results.review = '연동 대기';
        yield* wait(1.5);
      } else {
        setStep(11, `${who(byId.review)}: 성과 기록`);
        yield* work('review', 3);
        byId.review.work = 'done';
        day.results.review = '완료';
      }
      if (options.sunday) {
        if (!links.finance) {
          setStep(11, '주간 정산: 입력 자료 없음 — 연동 대기로 기록');
          byId.finance.work = 'link';
          day.results.finance = '연동 대기';
          yield* wait(1.5);
        } else {
          setStep(11, `${who(byId.finance)}: 주간 정산`);
          yield* work('finance', 3);
          yield* visit('finance', 'secretary');
          byId.finance.work = 'done';
          goHome('finance');
          day.results.finance = '완료';
        }
      }

      // ⑫ 비서실 브리핑 → 비서가 대표실로 걸어와 보고
      setStep(12, `${who(byId.secretary)}: 부서 보고 정리`);
      yield* work('secretary', 2);
      setStep(12, '비서실 브리핑 — 대표실로 보고');
      yield* visit('secretary', 'ceo');
      byId.secretary.work = 'done';
      byId.ceo.work = 'done';
      goHome('secretary');
      yield () => agents.every(settled);
      day.running = false; day.endedAt = time;
      setStep(12, '오늘 흐름 완료');
    }

    // ── 명령
    function stopDay() {
      script = null; cond = null;
      day.running = false; day.awaiting = null;
      // 출근 도중에 멈추면 아직 안 들어온 직원은 자기 자리에 바로 둔다
      for (const a of agents) if (!a.present) Object.assign(a, { present: true, x: a.seat[0], y: a.seat[1], state: 'sit' });
    }
    function startDay() {
      stopDay();
      day.running = true; day.startedAt = time; day.endedAt = null;
      script = dayScript(); cond = null;
    }
    function approve() {
      if (!day.awaiting) return false;
      day.awaiting = null;
      return true;
    }
    function meeting() {
      stopDay(); day.label = '';
      const seats = meetingRoom.seats;
      agents.forEach((a, i) => send(a.id, seats[i % seats.length]));
    }
    function returnAll() {
      stopDay(); day.label = '';
      agents.forEach(a => goHome(a.id));
    }
    // 회사 시계 (하루를 시작한 뒤에만)
    function clock() {
      if (day.startedAt === null) return null;
      const m = Math.floor(DAY_START_MIN + ((day.endedAt ?? time) - day.startedAt) * MIN_PER_SEC);
      return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }

    return {
      agents, byId, tick, send, goHome, meeting, returnAll, startDay, stopDay, approve, day, links, options,
      speech, say, who, clock, walkable, STATES, TALK_SEC, get time() { return time; },
    };
  }

  const api = { createSim, STATES, WORK, STAFF, DAY, QA_RESULT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OfficeSim = api;
})(typeof window !== 'undefined' ? window : this);
