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
    // 대표: 장난기 가득한 반존대. linesTo는 상대·순서별 대사 (to:먼저 말 걸 때, from:대답할 때)
    { id: 'ceo', name: '대표실', short: '대표', person: '이선홍', role: '대표',
      lines: ['다들 오늘도 파이팅이에요~ 알죠?', '커피 한 잔 할 사람? 농담이고요, 일해요~'],
      linesTo: {
        'to:secretary': ['치원님, 보고는? 다 정리했나요?', '치원님~ 오늘 별일 없었죠? 얼른 말해봐요.'],
        'to:plan1': ['곽범님, 이거 좋다! 이걸로 가요~', '곽범님 TOP 3 중에 이게 제일 끌리는데?'],
        'to:plan2': ['명철님, 승인 났어요~ 대본 부탁해요!', '명철님~ 이거 재밌게 써줄 거죠?'],
        'from:plan2': ['명철님, 대본 어디 봐봐요~ 오 괜찮은데?', '명철님 이번 대본 좀 치는데요?'],
      } },
    { id: 'plan2', name: '기획 2팀', short: '기획2', person: '정명철', role: '팀장',
      lines: ['아~승인 안 난 건 안써요.', '아~ 촬영 순서부터 확인요.'] },
    { id: 'review', name: '성과 리뷰실', short: '성과', person: '김희선', role: '팀장',
      lines: ['수치 없는 건 추정 안합니다.', '저장 수부터 확인해볼게요.'] },
    { id: 'finance', name: '정산팀', short: '정산', person: '현진', role: '팀장',
      lines: ['판매금액 정리했습니다.', '입금 대기 건부터 확인하겠습니다.'] },
    { id: 'secretary', name: '비서실', short: '비서', person: '박치원', role: '비서실장',
      lines: ['보고 드리겠습니다 대표님.', '대표님 괜찮으신가요?.'] },
    { id: 'reels', name: '제작팀', short: '릴스', person: '하민', role: '릴스 담당', room: 'studio', seat: 0,
      lines: ['장면 순서 한 번만 확인 부탁드립니다.', '원본 영상 전달 부탁드립니다.'] },
    { id: 'carousel', name: '제작팀', short: '캐러셀', person: '김석진', role: '캐러셀 담당', room: 'studio', seat: 1,
      lines: ['확정된 가격만 알려주시길 부탁드립니다.', '사진 순서 한 번 봐주시길 부탁드립니다.'] },
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
        hold: 0, task: '', linkReason: '', activity: null, breakGen: null, breakCond: null, breakPartner: null, nextBreak: 12,
      };
    });
    const byId = Object.fromEntries(agents.map(a => [a.id, a]));
    let time = 0;
    const day = { running: false, step: 0, label: '', awaiting: null, startedAt: null, endedAt: null, results: {}, stats: {} };
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

    function send(id, target, onArrive, exact) {
      const a = byId[id];
      if (!a.present) return;
      // 걷는 중이면 지금 들어가고 있는 칸에서부터 길을 찾는다
      const from = a.next ? [a.next[0], a.next[1]] : [a.x, a.y];
      // exact: 그 칸 그대로(자기 자리로 갈 때). 누가 잠깐 서 있으면 비킬 때까지 기다린다.
      a.exactGoal = !!exact;
      const goal = exact ? target : (PF.nearestFree(target, walkable, blockedFor(a), from) || target);
      a.goal = goal; a.path = PF.findPath(from, goal, walkable, blockedFor(a)) || [];
      a.onArrive = onArrive || null; a.wait = 0; a.goalWait = 0; a.afterTalk = null; a.talkWith = null;
      if (a.x === goal[0] && a.y === goal[1] && !a.next) arrive(a);
      else if (a.state !== 'walk') a.state = 'idle';
    }
    function goHome(id, then) { send(id, byId[id].seat, then, true); }

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
      a.line = pick(a, b, true); b.line = pick(b, a, false);
      a.dir = b.x >= a.x ? 1 : -1; b.dir = -a.dir;
      a.afterTalk = () => { a.talkWith = null; if (then) then(); };
      b.afterTalk = () => { b.talkWith = null; };
    }

    const who = a => a.id === 'ceo' ? `${a.person} 대표` : `${a.person}(${a.name})`;
    // 말할 문장 고르기: 상대·순서에 맞는 대사가 있으면 그것, 없으면 평소 말버릇
    const pick = (a, other, first) => {
      const ctx = other && a.linesTo && a.linesTo[(first ? 'to:' : 'from:') + other.id];
      const pool = ctx || a.lines;
      return pool.length ? pool[Math.floor(rand() * pool.length)] : '';
    };
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
      if (!a.exactGoal && a.goalWait > RETARGET_SEC && blocked.has(key(a.goal[0], a.goal[1]))) {
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

    // ── 쉬는 시간: 할 일이 없는 직원은 가끔 라운지에서 커피를 마시거나 옆 팀에 잡담하러 간다.
    //    집중 모드이거나, 하루 스크립트가 잡고 있는(hold) 직원은 쉬지 않는다.
    const loungeRoom = room('lounge');
    const coffeeSpot = (() => {
      for (let y = loungeRoom.y; y < loungeRoom.y + loungeRoom.h; y++)
        for (let x = loungeRoom.x; x < loungeRoom.x + loungeRoom.w; x++) if (MAP.tiles[y][x] === 'K') return [x, y];
      return [loungeRoom.x + 1, loungeRoom.y + 1];
    })();
    const focus = { on: false };
    const breaks = { enabled: true };
    const nextBreakIn = () => 10 + rand() * 16;
    function canBreak(a) {
      return breaks.enabled && !focus.on && !interrupt && a.present && a.id !== 'ceo' && !a.hold && !a.breakGen &&
        !a.goal && !a.next && a.state !== 'talk' && atSeat(a) && ['idle', 'done', 'link'].includes(a.work);
    }
    function cancelBreak(a, sendHome) {
      if (!a.breakGen && !a.activity) return false;
      const p = a.breakPartner && byId[a.breakPartner];
      a.breakGen = null; a.breakCond = null; a.activity = null; a.breakPartner = null;
      if (p && p.breakPartner === a.id) { p.activity = null; p.breakPartner = null; }
      // 자리를 막 떠나려던 참(좌표는 자리지만 이미 걷는 중)이어도 목적지를 자리로 되돌린다
      if (sendHome !== false && a.present && (!atSeat(a) || a.goal || a.next)) goHome(a.id);
      a.nextBreak = time + nextBreakIn();
      return true;
    }
    function* coffeeBreak(a) {
      a.activity = 'coffee';
      send(a.id, coffeeSpot);
      yield () => settled(a);
      const until = time + 3 + rand() * 3;
      yield () => time >= until;
      a.activity = null;
      goHome(a.id);
      yield () => settled(a);
    }
    function* chatBreak(a, b) {
      a.activity = b.activity = 'chat';
      a.breakPartner = b.id; b.breakPartner = a.id;
      send(a.id, [b.x, b.y]);
      yield () => settled(a);
      if (b.activity === 'chat' && !b.hold && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1) {
        talk(a, b);
        yield () => a.state !== 'talk' && b.state !== 'talk';
      }
      if (b.breakPartner === a.id) { b.activity = null; b.breakPartner = null; b.nextBreak = time + nextBreakIn(); }
      a.activity = null; a.breakPartner = null;
      goHome(a.id);
      yield () => settled(a);
    }
    function stepBreak(a) {
      if (a.breakGen) {
        for (let g = 0; a.breakGen && g < 10; g++) {
          if (a.breakCond && !a.breakCond()) break;
          const r = a.breakGen.next();
          if (r.done) { a.breakGen = null; a.breakCond = null; a.nextBreak = time + nextBreakIn(); break; }
          a.breakCond = r.value;
        }
        return;
      }
      if (time < a.nextBreak || !canBreak(a)) return;
      const mates = agents.filter(b => b !== a && canBreak(b) && !b.activity);
      if (mates.length && rand() < 0.4) {
        a.breakGen = chatBreak(a, mates[Math.floor(rand() * mates.length)]);
      } else {
        a.breakGen = coffeeBreak(a);
      }
      a.breakCond = null;
    }
    function setFocus(on) {
      focus.on = !!on;
      const back = [];
      if (!focus.on) return back;
      // 잡담 상대 쪽 기록이 먼저 지워지지 않게, 누가 뭘 하고 있었는지 먼저 적어 둔다
      const was = agents.map(a => [a, a.activity]);
      for (const [a, act] of was) {
        const atDesk = atSeat(a) && !a.goal && !a.next;
        if (cancelBreak(a) || act) back.push({ id: a.id, activity: act, atDesk });
        else if (a.present && !a.hold && !atSeat(a) && !a.goal && a.id !== 'ceo') { goHome(a.id); back.push({ id: a.id, activity: null, atDesk: false }); }
      }
      return back;
    }

    // ── 붙잡기: 하루 스크립트가 쓰는 직원은 쉬는 시간을 끊고 다른 데로 새지 않게 잡아 둔다
    function hold(ids) { ids.forEach(id => { const a = byId[id]; a.hold++; cancelBreak(a); }); }
    function release(ids) { ids.forEach(id => { const a = byId[id]; a.hold = Math.max(0, a.hold - 1); }); }

    // ── 끼어들기(대표 지시로 하는 회의 등): 도는 동안 하루 스크립트는 멈추고, 스크립트 시계도 멈춘다
    let interrupt = null, icond = null, pausedAt = null, pausedTotal = 0;
    const scriptTime = () => time - pausedTotal - (pausedAt !== null ? time - pausedAt : 0);
    function runInterrupt(gen) {
      if (interrupt) return false;
      interrupt = gen; icond = null;
      if (script) pausedAt = time;
      agents.forEach(a => cancelBreak(a));
      return true;
    }

    // ── 단계별 시간 기록 ("왜 늦어져?"에 답하려고): 승인 대기 / 이동 / 작업 / 대화 / 길 막힘
    function recordStats(dt) {
      if (!day.running || interrupt) return;
      const s = day.stats[day.step] || (day.stats[day.step] = { total: 0, approval: 0, walk: 0, work: 0, talk: 0, walkers: {}, workers: {}, blocked: {} });
      s.total += dt;
      const held = agents.filter(a => a.present && a.hold);
      if (day.awaiting) { s.approval += dt; return; }
      held.filter(a => a.goal && a.state === 'idle').forEach(a => s.blocked[a.id] = (s.blocked[a.id] || 0) + dt);
      const walkers = held.filter(a => a.state === 'walk');
      const workers = agents.filter(a => a.present && a.state === 'type');
      if (walkers.length) { s.walk += dt; walkers.forEach(a => s.walkers[a.id] = (s.walkers[a.id] || 0) + dt); }
      else if (workers.length) { s.work += dt; workers.forEach(a => s.workers[a.id] = (s.workers[a.id] || 0) + dt); }
      else if (agents.some(a => a.state === 'talk')) s.talk += dt;
    }

    function tick(dt) {
      time += dt;
      for (const a of agents) stepAgent(a, dt);
      for (const a of agents) stepBreak(a);
      recordStats(dt);
      if (interrupt) {
        for (let guard = 0; interrupt && guard < 50; guard++) {
          if (icond && !icond()) break;
          const r = interrupt.next();
          if (r.done) {
            interrupt = null; icond = null;
            if (pausedAt !== null) { pausedTotal += time - pausedAt; pausedAt = null; }
            break;
          }
          icond = r.value;
        }
        return;
      }
      // 하루 스크립트: 지금 기다리는 조건이 채워지면 다음 줄로 넘어간다
      for (let guard = 0; script && guard < 50; guard++) {
        if (cond && !cond()) break;
        const r = script.next();
        if (r.done) { script = null; cond = null; break; }
        cond = r.value;
      }
    }

    // ── 하루 스크립트에서 쓰는 동작들 (yield로 조건을 넘기면 그 조건이 참이 될 때까지 멈춘다)
    function* wait(sec) { const t = scriptTime() + sec; yield () => scriptTime() >= t; }
    function* waitReal(sec) { const t = time + sec; yield () => time >= t; }
    function meetingSeatsFor(ids) {
      // 회의실 빈 의자에 한 명씩 배정. 말풍선이 겹치지 않게 한 칸씩 띄워 앉힌다:
      // 위쪽 줄 1·3·5번째 → 아래쪽 줄 2·4번째 → 나머지 순서
      const taken = new Set(agents.filter(a => a.present && !ids.includes(a.id)).map(a => key(a.x, a.y)));
      const ys = [...new Set(meetingRoom.seats.map(s => s[1]))].sort((p, q) => p - q);
      const row = y => meetingRoom.seats.filter(s => s[1] === y).sort((p, q) => p[0] - q[0]);
      const top = row(ys[0]), bottom = row(ys[ys.length - 1]);
      const spread = [...top.filter((_, i) => i % 2 === 0), ...bottom.filter((_, i) => i % 2 === 1)];
      const order = [...spread, ...meetingRoom.seats.filter(s => !spread.includes(s))];
      return order.filter(s => !taken.has(key(s[0], s[1])));
    }
    function* gather(ids) {
      // 모인 사람은 home()으로 돌려보낼 때까지 붙잡아 둔다
      hold(ids);
      const free = meetingSeatsFor(ids);
      ids.forEach((id, i) => send(id, free[i] || meetingRoom.seats[0]));
      yield () => ids.every(id => settled(byId[id]));
    }
    function* converse(aId, bId) {
      const a = byId[aId], b = byId[bId];
      talk(a, b);
      yield () => a.state !== 'talk' && b.state !== 'talk';
    }
    function* visit(aId, bId) {
      // a가 b 옆 칸까지 걸어가서, a가 먼저 말을 건다
      hold([aId, bId]);
      yield* approach(aId, bId);
      yield* converse(aId, bId);
      release([aId, bId]);
    }
    function* approach(aId, bId) {
      // a가 b 옆 칸까지 걸어간다. b가 그사이 움직였으면 다시 따라간다.
      const a = byId[aId], b = byId[bId];
      for (let tries = 0; tries < 4; tries++) {
        send(aId, [b.next ? b.next[0] : b.x, b.next ? b.next[1] : b.y]);
        yield () => settled(a);
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1) break;
      }
      yield () => settled(b) || b.state === 'sit' || b.state === 'type';
    }
    function* work(id, sec, task) {
      // 자기 자리에 앉아서 sec초 동안 일한다
      const a = byId[id];
      hold([id]);
      if (!atSeat(a) || a.goal || a.next) goHome(id);
      yield () => atSeat(a) && settled(a);
      a.work = 'doing'; a.task = task || '';
      a.workStart = scriptTime(); a.workSec = sec;
      yield* wait(sec);
      release([id]);
    }
    // 붙잡아 둔 사람을 풀어서 자리로 보낸다
    const home = ids => { release(ids); ids.forEach(id => goHome(id)); };
    const setStep = (n, label) => { day.step = n; day.label = label; };
    function* awaitApproval(fromId, what, waiting) {
      waiting.forEach(id => { if (byId[id].work !== 'link') byId[id].work = 'approve'; });
      byId.ceo.work = 'doing';
      day.awaiting = { from: fromId, what, step: day.step, since: time };
      yield () => !day.awaiting;
      byId.ceo.work = 'idle';
    }
    function markLink(id, reason, task) { const a = byId[id]; a.work = 'link'; a.linkReason = reason; a.linkTask = task; }
    // 지금 하는 일의 진행률 0~1 (일하는 중일 때만)
    function progress(a) {
      if (a.work !== 'doing' || !a.workSec) return null;
      return Math.max(0, Math.min(1, (scriptTime() - a.workStart) / a.workSec));
    }

    function* dayScript() {
      // ① 07:00 전원 출근: 모두 밖에서 시작해 정문으로 한 명씩 들어와 자기 자리로
      setStep(1, '07:00 전원 출근 — 정문에서 각자 자리로');
      day.results = {}; day.stats = {};
      for (const a of agents) Object.assign(a, { present: false, goal: null, next: null, path: [], work: 'idle', state: 'idle', onArrive: null, afterTalk: null, talkWith: null, hold: 0, task: '', linkReason: '', activity: null, breakGen: null, breakCond: null, breakPartner: null, nextBreak: time + nextBreakIn() });
      for (const a of agents) {
        yield () => !blockedFor(a).has(key(entrance[0], entrance[1]));
        Object.assign(a, { present: true, x: entrance[0], y: entrance[1], dir: 1 });
        hold([a.id]);   // 전원이 자리에 앉을 때까지는 쉬러 가지 않는다
        goHome(a.id);
        yield* wait(ARRIVE_GAP);
      }
      yield () => agents.every(a => atSeat(a) && settled(a));
      release(agents.map(a => a.id));

      // ② 시장조사 → 완료 후 3명이 회의실에 모여 인수인계
      setStep(2, `${who(byId.research)}: 시장조사`);
      yield* work('research', 3, '시장조사');
      byId.research.work = 'done';
      setStep(2, '시장조사 완료 — 3명이 회의실에서 인수인계');
      yield* gather(['research', 'plan1', 'qa']);
      yield* converse('research', 'plan1');
      yield* converse('research', 'qa');
      home(['research', 'plan1', 'qa']);

      // ③ 브랜드 분석 (시장조사팀이 같이 맡음)
      if (!links.data) {
        setStep(3, '브랜드 분석: 데이터 미연동 — 만들지 않고 연동 대기로 기록');
        markLink('research', 'förc 성과 데이터', '브랜드 분석');
        day.results.brand = '연동 대기';
        yield* wait(1.5);
      } else {
        setStep(3, `${who(byId.research)}: 브랜드 분석`);
        yield* work('research', 2.5, '브랜드 분석');
        byId.research.work = 'done';
        day.results.brand = '완료';
      }

      // ④ 아이디어 10개 → 검수팀에 전달
      setStep(4, `${who(byId.plan1)}: 아이디어 10개`);
      yield* work('plan1', 3, '아이디어 10개');
      setStep(4, '아이디어 10개 → 브랜드 검수팀에 전달');
      yield* visit('plan1', 'qa');
      byId.plan1.work = 'idle';
      goHome('plan1');

      // ⑤ 브랜드 QA → 반려 3 / 통과 7
      setStep(5, `${who(byId.qa)}: 10개 검사`);
      yield* work('qa', 3, '브랜드 QA');
      day.results.qa = { ...QA_RESULT };
      setStep(5, `브랜드 QA 결과: 반려 ${QA_RESULT.reject}건 / 통과 ${QA_RESULT.pass}건 → 기획 1팀에 전달`);
      yield* visit('qa', 'plan1');
      byId.qa.work = 'done';
      goHome('qa');

      // ⑥ TOP 3 선정
      setStep(6, `${who(byId.plan1)}: 통과 ${QA_RESULT.pass}건 중 TOP 3 선정`);
      yield* work('plan1', 2, 'TOP 3 선정');

      // ⑦ ★ 대표 승인 대기: 3명 + 대표가 회의실에 모이고, 승인을 누를 때까지 멈춘다
      setStep(7, '★ 대표 승인 대기 — 3명과 대표가 회의실로');
      yield* gather(['research', 'plan1', 'qa', 'ceo']);
      setStep(7, '★ 대표 승인 대기 — TOP 3 중 1개를 골라 승인을 눌러 주세요');
      yield* awaitApproval('plan1', 'TOP 3 중 1개 승인', ['research', 'plan1', 'qa']);
      ['plan1', 'qa'].forEach(id => byId[id].work = 'done');
      if (byId.research.work !== 'link') byId.research.work = 'done';
      setStep(7, '승인 완료');
      yield* converse('ceo', 'plan1');
      home(['research', 'plan1', 'qa', 'ceo']);

      // ⑧ 대본 작성 → 최종 확인 → 제작팀으로 걸어가 전달
      setStep(8, '대표가 승인안을 기획 2팀에 전달');
      yield* visit('ceo', 'plan2');
      goHome('ceo');
      setStep(8, `${who(byId.plan2)}: 대본 작성`);
      yield* work('plan2', 3.5, '대본 작성');
      setStep(8, '대본 완성 — 대표실로 최종 확인 요청');
      yield* visit('plan2', 'ceo');
      setStep(8, '대본 최종 확인 대기 — 확인을 눌러 주세요');
      hold(['plan2']);
      yield* awaitApproval('plan2', '대본 최종 확인', ['plan2']);
      release(['plan2']);
      setStep(8, '최종 확인 완료 — 기획 2팀이 제작팀으로 전달');
      yield* visit('plan2', 'reels');
      yield* visit('plan2', 'carousel');
      byId.plan2.work = 'done';
      goHome('plan2');

      // ⑨ 릴스·캐러셀 제작 (동시 진행)
      setStep(9, '릴스·캐러셀 제작 (동시 진행)');
      const r = work('reels', 4, '릴스 편집'), c = work('carousel', 4, '캐러셀 제작');
      // 두 사람을 같은 시각에 시작시키기 위해 두 스크립트를 번갈아 진행한다
      let rv = r.next(), cv = c.next();
      yield () => {
        while (!rv.done && rv.value()) rv = r.next();
        while (!cv.done && cv.value()) cv = c.next();
        return rv.done && cv.done;
      };

      // ⑩ 결과물 저장
      setStep(10, '결과물 저장 — media/·scripts/ 에 복제본으로');
      hold(['reels', 'carousel']);
      for (const a of [byId.reels, byId.carousel]) Object.assign(a, { task: '결과물 저장', workStart: scriptTime(), workSec: 1.5 });
      yield* wait(1.5);
      byId.reels.work = byId.carousel.work = 'done';
      release(['reels', 'carousel']);

      // ⑪ 성과 기록 (+ 일요일이면 정산)
      if (!links.data) {
        setStep(11, '성과 기록: förc 데이터 미연동 — 연동 대기로 기록');
        markLink('review', 'förc 성과 데이터', '성과 기록');
        day.results.review = '연동 대기';
        yield* wait(1.5);
      } else {
        setStep(11, `${who(byId.review)}: 성과 기록`);
        yield* work('review', 3, '성과 기록');
        byId.review.work = 'done';
        day.results.review = '완료';
      }
      if (options.sunday) {
        if (!links.finance) {
          setStep(11, '주간 정산: 입력 자료 없음 — 연동 대기로 기록');
          markLink('finance', '정산 입력 파일(finance/input)', '주간 정산');
          day.results.finance = '연동 대기';
          yield* wait(1.5);
        } else {
          setStep(11, `${who(byId.finance)}: 주간 정산`);
          yield* work('finance', 3, '주간 정산');
          yield* visit('finance', 'secretary');
          byId.finance.work = 'done';
          goHome('finance');
          day.results.finance = '완료';
        }
      }

      // ⑫ 비서실 브리핑 → 비서가 대표실로 걸어와 보고
      setStep(12, `${who(byId.secretary)}: 부서 보고 정리`);
      yield* work('secretary', 2, '브리핑 정리');
      setStep(12, '비서실 브리핑 — 대표실로 보고');
      // 비서실장이 대표실로 걸어오면 대표가 먼저 묻는다: "치원님, 보고는? 다 정리했나요?"
      hold(['secretary', 'ceo']);
      yield* approach('secretary', 'ceo');
      yield* converse('ceo', 'secretary');
      byId.secretary.work = 'done';
      byId.ceo.work = 'done';
      home(['secretary', 'ceo']);
      yield () => settled(byId.secretary);
      day.running = false; day.endedAt = time;
      setStep(12, '오늘 흐름 완료');
    }

    // ── 대표 지시로 여는 팀장 회의: 모여서 한 줄씩 보고하고, 끝나면 자리로 돌아간 뒤 하루가 이어진다
    const LEADS = ['research', 'plan1', 'qa', 'plan2', 'review', 'finance', 'secretary', 'reels'];
    function* leadMeeting(reportOf, onReport, onDone) {
      const ids = [...LEADS, 'ceo'];
      yield* gather(ids);
      for (const id of LEADS) {
        const a = byId[id], rep = reportOf(a);
        a.line = rep.short; a.sayUntil = time + 2.6;
        onReport && onReport(a, rep.full);
        yield* waitReal(2.6);
      }
      home(ids);
      yield () => ids.every(id => settled(byId[id]));
      onDone && onDone();
    }
    function callMeeting(reportOf, onReport, onDone) {
      return runInterrupt(leadMeeting(reportOf, onReport, onDone));
    }
    function announce(id, text, sec) { const a = byId[id]; a.line = text; a.sayUntil = time + (sec || SAY_SEC); }

    // ── 명령
    function stopDay() {
      script = null; cond = null; interrupt = null; icond = null; pausedAt = null;
      day.running = false; day.awaiting = null;
      for (const a of agents) { a.hold = 0; cancelBreak(a, false); }
      // 출근 도중에 멈추면 아직 안 들어온 직원은 자기 자리에 바로 둔다
      for (const a of agents) if (!a.present) Object.assign(a, { present: true, x: a.seat[0], y: a.seat[1], state: 'sit' });
    }
    function startDay() {
      stopDay();
      day.running = true; day.startedAt = time; day.endedAt = null; pausedTotal = 0;
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
    const minutesOf = sec => sec * MIN_PER_SEC;
    function clock() {
      if (day.startedAt === null) return null;
      const m = Math.floor(DAY_START_MIN + minutesOf((day.endedAt ?? time) - day.startedAt));
      return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }

    return {
      agents, byId, tick, send, goHome, meeting, returnAll, startDay, stopDay, approve, day, links, options,
      speech, say, who, clock, walkable, STATES, TALK_SEC, focus, breaks, setFocus, callMeeting, announce, minutesOf,
      progress, get interrupted() { return !!interrupt; }, get time() { return time; }, LEADS,
    };
  }

  const api = { createSim, STATES, WORK, STAFF, DAY, QA_RESULT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OfficeSim = api;
})(typeof window !== 'undefined' ? window : this);
