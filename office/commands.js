// 대표 지시창: 대표가 묻는 말을 알아듣고, 담당자가 시뮬레이션의 실제 상태로 답한다.
// 답은 전부 sim에서 읽은 값으로 만든다. 모르는 건 모른다고 한다.
(function (root) {
  const CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];

  // "재무팀 뭐해?"의 팀 이름 → 팀원 id. 재무 = 정산팀.
  const TEAMS = [
    { keys: ['재무', '정산', '회계'], name: '정산팀', ids: ['finance'] },
    { keys: ['시장조사', '조사', '리서치'], name: '시장조사팀', ids: ['research'] },
    { keys: ['기획1', '기획 1', '기획일', '아이디어'], name: '기획 1팀', ids: ['plan1'] },
    { keys: ['기획2', '기획 2', '기획이', '대본'], name: '기획 2팀', ids: ['plan2'] },
    { keys: ['검수', 'qa', 'QA', '브랜드'], name: '브랜드 검수팀', ids: ['qa'] },
    { keys: ['성과', '리뷰'], name: '성과 리뷰실', ids: ['review'] },
    { keys: ['비서'], name: '비서실', ids: ['secretary'] },
    { keys: ['제작', '릴스', '캐러셀'], name: '제작팀', ids: ['reels', 'carousel'] },
  ];

  function createCommands(sim, OfficeSim, MAP) {
    const { byId, day } = sim;
    const WORK = OfficeSim.WORK, DAY = OfficeSim.DAY;
    const roomAt = (x, y) => MAP.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    const place = a => {
      if (!a.present) return '출근 전';
      const r = roomAt(a.x, a.y);
      return r ? r.name : '복도';
    };
    const atSeat = a => a.present && a.x === a.seat[0] && a.y === a.seat[1];
    const started = () => day.startedAt !== null;
    const doneCount = () => !started() ? 0 : (day.running ? day.step - 1 : 12);
    const mins = sec => Math.max(1, Math.round(sim.minutesOf(sec)));
    const name = a => a.id === 'ceo' ? '대표' : a.person;
    // 받침 있으면 '을', 없으면 '를'
    const eul = w => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c <= 11171 && c % 28 ? '을' : '를'); };

    // 한 사람이 지금 뭘 하는지 한 문장으로
    // 지금 자리를 비운 이유 (커피·잡담). 업무 상황과 따로 말한다.
    function away(a) {
      if (a.activity === 'coffee') return '지금은 라운지에서 커피 마시는 중입니다. ';
      if (a.activity === 'chat') return '지금은 잠깐 잡담 중입니다. ';
      return '';
    }
    function doing(a) {
      if (!a.present) return '아직 출근 전입니다';
      if (a.state === 'walk' && a.hold) return `${a.goal ? roomAt(a.goal[0], a.goal[1])?.name || '복도' : '어딘가'}로 이동 중입니다`;
      switch (a.work) {
        case 'doing': return `${a.task || '업무'} 진행 중입니다`;
        case 'approve': return `대표님 ${day.awaiting ? day.awaiting.what : '결정'}을 기다리고 있습니다`;
        case 'link': return `${a.linkReason || '외부 자료'}가 연결되지 않아 멈춰 있습니다`;
        case 'done': return '오늘 제 단계는 끝났습니다';
        default:
          if (a.id === 'finance' && !sim.options.sunday) return '오늘은 일요일이 아니라 정산 일정이 없습니다. 일요일 17시에 시작합니다';
          return started() && day.running ? '앞 단계를 기다리는 중입니다' : '업무 시작 전입니다';
      }
    }
    // 말투: 끝에 자기 말버릇을 하나 붙인다. 단, "정리했습니다"처럼 일을 끝냈다고 주장하는 말버릇은
    // 사실 보고로 읽힐 수 있어서 답변에는 붙이지 않는다(사규 절대 규칙 ⑤·⑥).
    const CLAIM = /했습니다|했어요|완료|끝냈/;
    function voice(a, body) {
      const safe = a.lines.filter(l => !CLAIM.test(l));
      const tail = safe.length ? ' ' + safe[Math.floor(Math.random() * safe.length)] : '';
      if (a.id === 'plan2') return '아~ ' + body + tail;
      return body + tail;
    }
    const reply = (id, text) => ({ id, name: id === 'ceo' ? '이선홍' : byId[id].person, role: byId[id].id === 'ceo' ? '대표' : `${byId[id].name} ${byId[id].role}`, text });

    // ── "현황 보고" → 비서실장
    function statusReport() {
      const s = byId.secretary;
      if (!started()) return [reply('secretary', '보고 드리겠습니다 대표님. 아직 업무 시작 전입니다. 하루 시작을 누르시면 07:00 출근부터 진행합니다.')];
      const done = doneCount(), pct = Math.round(done / 12 * 100);
      if (!day.running) {
        const counts = Object.keys(WORK).map(k => [k, sim.agents.filter(a => a.work === k).length]).filter(([, n]) => n);
        return [reply('secretary', `보고 드리겠습니다 대표님. 지금 ${sim.clock()}, 오늘 12단계 모두 끝났습니다(진행률 100%). ` +
          counts.map(([k, n]) => `${WORK[k].label} ${n}명`).join(', ') + '입니다.')];
      }
      const cur = DAY[day.step - 1], next = DAY[day.step];
      let text = `보고 드리겠습니다 대표님. 지금 ${sim.clock()}, ${CIRCLED[day.step]} ${cur.title} 단계입니다. ` +
        `진행률 ${pct}% (${done}/12 완료). 다음 순서는 ${next ? CIRCLED[next.n] + ' ' + next.title : '없습니다(마지막 단계)'}입니다.`;
      if (day.awaiting) text += ` 지금은 대표님 ${day.awaiting.what}만 기다리고 있습니다.`;
      const links = sim.agents.filter(a => a.work === 'link');
      if (links.length) text += ` 연동 대기: ${links.map(a => a.person).join(', ')}.`;
      sim.announce('secretary', '보고 드리겠습니다 대표님.', 3);
      return [reply('secretary', text)];
    }

    // ── "왜 늦어져?" → 비서실장. 아래 순서대로 처음 맞는 것 하나만 답한다.
    //   ① 대표 결정을 기다리는 중 → 그것만 말한다 (다른 얘기 금지)
    //   ② 누가 작업 중 → 부서명 + 진행률 + "정상 속도예요"
    //   ③ 외부 연동 때문에 못 한 일 → 무엇이 없어서 무엇을 못 하는지 정확히
    //   ④ 아무 문제 없음 → "지연 없습니다" 한 줄
    function bottleneck() {
      if (day.awaiting) {
        const m = mins(sim.time - day.awaiting.since);
        return [reply('secretary', `대표님 결정을 기다리고 있습니다 — ${CIRCLED[day.awaiting.step]} ${day.awaiting.what}, ${m}분째입니다.`)];
      }
      const working = sim.agents.filter(a => a.present && a.work === 'doing' && sim.progress(a) !== null);
      if (working.length) {
        const parts = working.map(a => `${a.name} ${a.task} ${Math.round(sim.progress(a) * 100)}%`);
        return [reply('secretary', `${parts.join(' / ')} — 정상 속도예요.`)];
      }
      const linked = sim.agents.filter(a => a.work === 'link');
      if (linked.length) {
        return [reply('secretary', linked.map(a =>
          `${a.name} ${eul(a.linkTask || '업무')} 못 하고 있습니다 — ${a.linkReason || '외부 자료'}가 연결되지 않았습니다.`).join(' '))];
      }
      return [reply('secretary', '지연 없습니다.')];
    }

    // ── "OO팀 뭐해?" → 그 팀 팀장
    function team(t) {
      const members = t.ids.map(id => byId[id]);
      const lead = members[0];
      const self = members.length === 1;
      const aw = away(lead);
      let text = `${t.name} ${lead.person}입니다. ${aw}${aw ? '업무 쪽은, ' : ''}${doing(lead)}.`;
      if (self) text += ` 팀원 현황: 저 혼자 ${place(lead)}에 있습니다.`;
      else text += ' 팀원 현황: ' + members.map(m => `${m.person}(${m.role}) — ${place(m)}, ${WORK[m.work].label}${m.activity === 'coffee' ? ', 커피 중' : m.activity === 'chat' ? ', 잡담 중' : ''}`).join(' / ') + '.';
      if (t.ids.includes('research') && day.results.brand) text += ` 브랜드 분석: ${day.results.brand}.`;
      if (t.ids.includes('qa') && day.results.qa) text += ` 오늘 검수: 반려 ${day.results.qa.reject}건 / 통과 ${day.results.qa.pass}건.`;
      if (t.ids.includes('finance') && day.results.finance) text += ` 주간 정산: ${day.results.finance}.`;
      sim.announce(lead.id, '네 대표님, 말씀드릴게요.', 3);
      return [reply(lead.id, voice(lead, text))];
    }

    // ── "회의 소집" → 팀장 전원이 회의실에 모여 한 줄씩 보고
    function reportLine(a) {
      const short = a.work === 'doing' ? `${a.task || '업무'} 중입니다` :
        a.work === 'approve' ? '승인 기다립니다' :
        a.work === 'link' ? '연결 기다립니다' :
        a.work === 'done' ? '제 단계 끝났습니다' : '대기 중입니다';
      return { short, full: `${doing(a)}.` };
    }
    function meeting(emit) {
      if (sim.interrupted) return [reply('secretary', '대표님, 지금 회의가 이미 진행 중입니다.')];
      const ok = sim.callMeeting(reportLine,
        (a, full) => emit(reply(a.id, voice(a, full))),
        () => emit(reply('secretary', day.running ? '회의 끝났습니다 대표님. 모두 자리로 돌아가 하던 일 이어갑니다.' : '회의 끝났습니다 대표님. 모두 자리로 돌아갔습니다.')));
      if (!ok) return [reply('secretary', '대표님, 지금은 회의를 열 수 없습니다.')];
      return [reply('secretary', `팀장 전원 회의실로 모이겠습니다. ${day.running ? '하루 일정은 회의 동안 잠시 멈춥니다. ' : ''}한 명씩 한 줄로 보고 드리겠습니다.`)];
    }

    // ── "집중 모드" → 전원: 커피·잡담 중단하고 자리 복귀
    function focus(on) {
      if (!on) {
        sim.setFocus(false);
        return [reply('secretary', '집중 모드 해제했습니다 대표님. 할 일 없는 사람은 다시 쉬는 시간을 가집니다.')];
      }
      const back = sim.setFocus(true);
      if (!back.length) return [reply('secretary', '집중 모드 켰습니다 대표님. 지금은 모두 자리에 있어서 돌아올 사람이 없습니다.')];
      return back.map(({ id, activity, atDesk }) => {
        const a = byId[id];
        const what = activity === 'coffee' ? '커피 내려놓고' : activity === 'chat' ? '잡담 멈추고' : '';
        sim.announce(id, atDesk ? '집중하겠습니다' : '자리로 갑니다', 2.5);
        return reply(id, voice(a, atDesk ? `${what ? what + ' ' : ''}일에 집중하겠습니다.` : `${what ? what + ' ' : ''}자리로 돌아갑니다.`));
      }).concat([reply('secretary', `집중 모드 켰습니다 대표님. ${back.length}명 자리로 복귀합니다. 해제하실 때까지 커피·잡담 없습니다.`)]);
    }

    // 묻는 말 알아듣기
    function handle(raw, emit) {
      const text = (raw || '').trim();
      const t = text.replace(/\s+/g, ' ');
      if (!t) return [];
      if (/집중\s*모드/.test(t)) return focus(!/해제|끄|꺼|끝|off/i.test(t));
      if (/회의/.test(t)) return meeting(emit || (() => {}));
      if (/늦|병목|지연|왜/.test(t)) return bottleneck();
      if (/현황|보고|상황|진행/.test(t) && !/팀|실/.test(t.replace(/보고/g, ''))) return statusReport();
      if (/뭐\s*해|뭐하|뭐 하|어때|어디/.test(t) || /팀|실/.test(t)) {
        const found = TEAMS.find(x => x.keys.some(k => t.includes(k)));
        if (found) return team(found);
      }
      if (/현황|보고|상황/.test(t)) return statusReport();
      return [reply('secretary', '대표님, 그 지시는 제가 아직 모르는 말입니다. "현황 보고", "왜 늦어져?", "재무팀 뭐해?", "회의 소집", "집중 모드" 중에서 말씀해 주세요.')];
    }

    return { handle, statusReport, bottleneck, team: key => team(TEAMS.find(x => x.keys.includes(key))), meeting, focus };
  }

  const api = { createCommands, TEAMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OfficeCommands = api;
})(typeof window !== 'undefined' ? window : this);
