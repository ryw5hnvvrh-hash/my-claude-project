"use client";

// 콘텐츠 캘린더 — "이번 달에 올릴 걸 적어 넣음 → 달력 날짜에 올라감 → 올리면 게시 완료로 찍음 → 지나간 계획은 다시 챙김"
// 저장: claude.ai에서 열면 db 문서 office/calendar (대표·Claude가 같이 봄),
//       파일로 열어 db가 없으면 이 브라우저 localStorage(myplan-calendar-v1 / myplan-ads-v1)에만.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";

export type CalPlan = { id: string; title: string; date: string; format: string; memo?: string; done?: boolean };
export type CalAd = { id: string; brand?: string; title: string; date: string; format: string; memo?: string; done?: boolean };
export type CalendarDoc = { plans?: CalPlan[]; ads?: CalAd[]; updatedAt?: string };

/* ■ 설정 */
const FORMATS = ["릴스", "캐러셀", "스토리", "기타"];
// 계획 등록에만 "배송"(택배 발송·입고·마감)과 "개인"(아이폰·구글 캘린더 개인 일정)이 더 있다. 광고 포맷은 그대로.
const PLAN_FORMATS = ["릴스", "캐러셀", "스토리", "배송", "개인", "기타"];
const doneLabel = (f: string) => (f === "배송" ? "발송 완료" : f === "개인" ? "완료" : "게시 완료");
const WEEK_START: "일" | "월" = "월";
const KEY_PLANS = "myplan-calendar-v1";
const KEY_ADS = "myplan-ads-v1";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const korDate = (s: string) => {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};
const shortDate = (s: string) => {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const inMonth = (s: string, y: number, m: number) => {
  const d = parseYmd(s);
  return d.getFullYear() === y && d.getMonth() === m;
};
const badgeClass = (f: string) => (PLAN_FORMATS.includes(f) ? `f-${f}` : "f-기타");
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function readLocal<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return null;
  }
}

type Props = {
  live: CalendarDoc | null;
  liveLoaded: boolean;
  dbReady: boolean;
  save: (data: Record<string, unknown>) => Promise<boolean>;
};

export default function CalendarBoard({ live, liveLoaded, dbReady, save }: Props) {
  const today = ymd(new Date());
  const [plans, setPlans] = useState<CalPlan[]>([]);
  const [ads, setAds] = useState<CalAd[]>([]);
  const [viewY, setViewY] = useState(() => new Date().getFullYear());
  const [viewM, setViewM] = useState(() => new Date().getMonth());
  const [showRedo, setShowRedo] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  // 계획 입력
  const [pTitle, setPTitle] = useState("");
  const [pDate, setPDate] = useState(today);
  const [pFormat, setPFormat] = useState(PLAN_FORMATS[0]);
  const [pMemo, setPMemo] = useState("");
  const [pMsg, setPMsg] = useState("");
  // 광고 입력
  const [aBrand, setABrand] = useState("");
  const [aTitle, setATitle] = useState("");
  const [aDate, setADate] = useState(today);
  const [aFormat, setAFormat] = useState(FORMATS[0]);
  const [aMemo, setAMemo] = useState("");
  const [aMsg, setAMsg] = useState("");

  const useDb = dbReady;

  // db 모드: 문서가 바뀔 때마다 화면을 맞춘다 / 파일 모드: localStorage에서 한 번 읽는다
  useEffect(() => {
    if (!useDb) return;
    setPlans(Array.isArray(live?.plans) ? live!.plans! : []);
    setAds(Array.isArray(live?.ads) ? live!.ads! : []);
  }, [useDb, live]);

  useEffect(() => {
    if (useDb) return;
    const lp = readLocal<CalPlan>(KEY_PLANS);
    const la = readLocal<CalAd>(KEY_ADS);
    if (lp === null || la === null) {
      setStorageNote("이 창에서는 저장이 막혀 있어요. 적은 내용은 창을 닫으면 사라져요.");
      return;
    }
    setPlans(lp);
    setAds(la);
  }, [useDb]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2000);
  }, []);

  /** 바뀔 때마다 바로 저장 */
  const persist = useCallback(
    (nextPlans: CalPlan[], nextAds: CalAd[]) => {
      setPlans(nextPlans);
      setAds(nextAds);
      if (useDb) {
        void save({ plans: nextPlans, ads: nextAds, updatedAt: new Date().toISOString() }).then((ok) => {
          if (!ok) setStorageNote("저장하지 못했어요. 잠시 뒤 다시 해 주세요 (편집 권한이 있는 계정인지도 확인해 주세요).");
          else setStorageNote("");
        });
        return;
      }
      try {
        localStorage.setItem(KEY_PLANS, JSON.stringify(nextPlans));
        localStorage.setItem(KEY_ADS, JSON.stringify(nextAds));
      } catch {
        setStorageNote("이 창에서는 저장이 막혀 있어요. 적은 내용은 창을 닫으면 사라져요.");
      }
    },
    [useDb, save],
  );

  // 개인 일정은 지나도 "다시 배치" 대상이 아니다
  const isOverdue = useCallback((p: CalPlan) => !p.done && p.format !== "개인" && p.date < today, [today]);

  /* 달력 칸 */
  const startIdx = WEEK_START === "월" ? 1 : 0;
  const cells = useMemo(() => {
    const first = new Date(viewY, viewM, 1);
    const offset = (first.getDay() - startIdx + 7) % 7;
    const last = new Date(viewY, viewM + 1, 0).getDate();
    const total = Math.ceil((offset + last) / 7) * 7;
    return Array.from({ length: total }, (_, i) => new Date(viewY, viewM, 1 - offset + i));
  }, [viewY, viewM, startIdx]);

  const byDate = useMemo(() => {
    const map: Record<string, { plans: CalPlan[]; ads: CalAd[] }> = {};
    for (const p of plans) (map[p.date] ||= { plans: [], ads: [] }).plans.push(p);
    for (const a of ads) (map[a.date] ||= { plans: [], ads: [] }).ads.push(a);
    return map;
  }, [plans, ads]);

  const monthPlans = plans.filter((p) => inMonth(p.date, viewY, viewM));
  const monthAds = ads.filter((a) => inMonth(a.date, viewY, viewM));
  const redoList = monthPlans.filter(isOverdue).sort((a, b) => a.date.localeCompare(b.date));
  const adList = [...ads].sort((a, b) => Number(!!a.done) - Number(!!b.done) || a.date.localeCompare(b.date));

  /* 등록 */
  const addPlan = (e: FormEvent) => {
    e.preventDefault();
    const title = pTitle.trim();
    if (!title || !pDate) {
      setPMsg("내용과 날짜를 적어주세요");
      return;
    }
    setPMsg("");
    persist([...plans, { id: uid(), title, date: pDate, format: pFormat, memo: pMemo.trim(), done: false }], ads);
    const d = parseYmd(pDate);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
    setPTitle("");
    setPMemo("");
    showToast(`${korDate(pDate)}에 등록했어요`);
  };

  const addAd = (e: FormEvent) => {
    e.preventDefault();
    const title = aTitle.trim();
    if (!title || !aDate) {
      setAMsg("광고명과 게시 예정일을 적어주세요");
      return;
    }
    setAMsg("");
    persist(plans, [...ads, { id: uid(), brand: aBrand.trim(), title, date: aDate, format: aFormat, memo: aMemo.trim(), done: false }]);
    setABrand("");
    setATitle("");
    setAMemo("");
    showToast(`${korDate(aDate)} 광고 일정을 저장했어요`);
  };

  /* 카드 버튼 */
  const setDone = (id: string, done: boolean) => persist(plans.map((p) => (p.id === id ? { ...p, done } : p)), ads);
  // 지우기 확인 — 오피스는 아티팩트 틀 안에서 돌아서 브라우저 confirm 창이 막힌다(늘 "아니오"). 그래서 화면 안 확인 창을 쓴다.
  const [askDel, setAskDel] = useState<{ kind: "plan" | "ad"; id: string; title: string } | null>(null);
  const delPlan = (p: CalPlan) => setAskDel({ kind: "plan", id: p.id, title: p.title });
  const toggleAd = (id: string) => persist(plans, ads.map((a) => (a.id === id ? { ...a, done: !a.done } : a)));
  const delAd = (a: CalAd) => setAskDel({ kind: "ad", id: a.id, title: a.title });
  const confirmDel = () => {
    if (!askDel) return;
    if (askDel.kind === "plan") persist(plans.filter((x) => x.id !== askDel.id), ads);
    else persist(plans, ads.filter((x) => x.id !== askDel.id));
    setAskDel(null);
    showToast("지웠어요");
  };

  /* 드래그로 날짜 옮기기 */
  const dragId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const onDrop = (e: DragEvent, date: string) => {
    e.preventDefault();
    setDragOver(null);
    const id = dragId.current;
    dragId.current = null;
    const p = plans.find((x) => x.id === id);
    if (!p || p.date === date) return;
    persist(plans.map((x) => (x.id === p.id ? { ...x, date } : x)), ads);
    showToast(`${korDate(date)}로 옮겼어요`);
  };

  const move = (delta: number) => {
    const d = new Date(viewY, viewM + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };

  const loading = useDb && !liveLoaded;

  return (
    <div className="cc">
      <section className="win cc-head-win">
        <div className="win-bar">
          <span>📅 content.calendar — {useDb ? "오피스에 저장 · Claude도 같이 봐요" : "이 브라우저에만 저장"}</span>
          <span className="window-controls">—　▢　✕</span>
        </div>
        <div className="win-body">
          {storageNote ? <p className="cc-note">{storageNote}</p> : null}
          <div className="cc-stats">
            <div className="cc-stat">
              <span>계획</span>
              <b>{monthPlans.length}</b>
            </div>
            <div className="cc-stat ad">
              <span>광고 일정</span>
              <b>{monthAds.length}</b>
            </div>
            <div className="cc-stat done">
              <span>게시 완료</span>
              <b>{monthPlans.filter((p) => p.done).length}</b>
            </div>
            <button type="button" className="cc-stat redo" aria-pressed={showRedo} onClick={() => setShowRedo((v) => !v)}>
              <span>다시 배치</span>
              <b>{redoList.length}</b>
              <small>눌러서 모아 보기</small>
            </button>
          </div>
        </div>
      </section>

      <div className="cc-layout">
        <section className="win cc-cal">
          <div className="win-bar">
            <span>🗓️ month</span>
          </div>
          <div className="cc-cal-head">
            <button type="button" className="cc-btn" onClick={() => move(-1)} aria-label="지난달">
              ←
            </button>
            <h2>
              {viewY}년 {viewM + 1}월
            </h2>
            <button type="button" className="cc-btn" onClick={() => move(1)} aria-label="다음달">
              →
            </button>
            <span className="cc-spacer" />
            <button
              type="button"
              className="cc-btn"
              onClick={() => {
                const n = new Date();
                setViewY(n.getFullYear());
                setViewM(n.getMonth());
              }}
            >
              오늘
            </button>
          </div>
          <div className="cc-scroll">
            <div className="cc-weekdays">
              {Array.from({ length: 7 }, (_, i) => {
                const idx = (startIdx + i) % 7;
                return (
                  <div key={i} className={idx === 0 ? "sun" : idx === 6 ? "sat" : ""}>
                    {DAY_NAMES[idx]}
                  </div>
                );
              })}
            </div>
            {loading ? (
              <p className="cc-empty cc-pad">불러오는 중…</p>
            ) : (
              <div className="cc-grid">
                {cells.map((d) => {
                  const ds = ymd(d);
                  const bucket = byDate[ds];
                  const other = d.getMonth() !== viewM;
                  return (
                    <div
                      key={ds}
                      className={`cc-cell${other ? " other" : ""}${ds === today ? " today" : ""}${dragOver === ds ? " over" : ""}`}
                      onDragOver={(e) => {
                        if (!dragId.current) return;
                        e.preventDefault();
                        if (dragOver !== ds) setDragOver(ds);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver((v) => (v === ds ? null : v));
                      }}
                      onDrop={(e) => onDrop(e, ds)}
                    >
                      <div className="cc-d">{d.getDate()}</div>
                      {bucket?.plans.map((p) => (
                        <div
                          key={p.id}
                          className={`cc-item${p.done ? " done" : isOverdue(p) ? " overdue" : ""}`}
                          draggable
                          onDragStart={(e) => {
                            dragId.current = p.id;
                            e.dataTransfer.effectAllowed = "move";
                            try {
                              e.dataTransfer.setData("text/plain", p.id);
                            } catch {
                              /* 일부 브라우저 */
                            }
                          }}
                          onDragEnd={() => {
                            dragId.current = null;
                            setDragOver(null);
                          }}
                        >
                          <span className={`cc-badge ${badgeClass(p.format)}`}>{p.format}</span>
                          <div className="cc-title">{p.title}</div>
                          {p.memo ? <div className="cc-memo">{p.memo.split("\n")[0]}</div> : null}
                          <div className="cc-acts">
                            {p.done ? (
                              <button type="button" className="cc-btn sm" onClick={() => setDone(p.id, false)}>
                                되돌리기
                              </button>
                            ) : (
                              <button type="button" className="cc-btn sm ok" onClick={() => setDone(p.id, true)}>
                                {doneLabel(p.format)}
                              </button>
                            )}
                            <button type="button" className="cc-btn sm x" onClick={() => delPlan(p)} aria-label="지우기">
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                      {bucket?.ads.map((a) => (
                        <div key={a.id} className={`cc-item ad${a.done ? " addone" : ""}`}>
                          <span className="cc-badge ad">광고 · {a.format}</span>
                          <div className="cc-title">
                            {a.brand ? `${a.brand} · ` : ""}
                            {a.title}
                          </div>
                          {a.memo ? <div className="cc-memo">{a.memo.split("\n")[0]}</div> : null}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            {showRedo ? (
              <div className="cc-redo">
                <h3>다시 배치할 계획</h3>
                {redoList.length ? (
                  redoList.map((p) => (
                    <div key={p.id} className="cc-row redo">
                      <span className="cc-date">{shortDate(p.date)}</span>
                      <div className="cc-main">
                        <div className="t">
                          <span className={`cc-badge ${badgeClass(p.format)}`}>{p.format}</span> {p.title}
                        </div>
                        {p.memo ? <div className="s">{p.memo}</div> : null}
                      </div>
                      <button type="button" className="cc-btn sm ok" onClick={() => setDone(p.id, true)}>
                        {doneLabel(p.format)}
                      </button>
                      <button type="button" className="cc-btn sm x" onClick={() => delPlan(p)} aria-label="지우기">
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="cc-empty">아직 없어요</p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="cc-side">
          <section className="win">
            <div className="win-bar">
              <span>① 계획 직접 등록</span>
            </div>
            <form className="win-body cc-form" onSubmit={addPlan} noValidate autoComplete="off">
              <label>
                내용
                <input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="예: 협찬 촬영 / 라이브 방송" />
              </label>
              <label>
                날짜
                <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} />
              </label>
              <label>
                포맷
                <select value={pFormat} onChange={(e) => setPFormat(e.target.value)}>
                  {PLAN_FORMATS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                메모 <i>{pFormat === "배송" ? "(선택 · 택배사·건수·마감 시간)" : "(선택 · 준비할 것·시간)"}</i>
                <textarea
                  rows={2}
                  value={pMemo}
                  onChange={(e) => setPMemo(e.target.value)}
                  placeholder={pFormat === "배송" ? "예: 아이원츄 예약분 12건 · 우체국 · 16시 마감" : undefined}
                />
              </label>
              <p className="cc-msg">{pMsg}</p>
              <button type="submit" className="cc-btn primary full">
                달력에 올리기
              </button>
            </form>
          </section>

          <section className="win cc-ads">
            <div className="win-bar">
              <span>② 광고 일정</span>
            </div>
            <form className="win-body cc-form" onSubmit={addAd} noValidate autoComplete="off">
              <label>
                광고주
                <input value={aBrand} onChange={(e) => setABrand(e.target.value)} />
              </label>
              <label>
                광고명
                <input value={aTitle} onChange={(e) => setATitle(e.target.value)} />
              </label>
              <label>
                게시 예정일
                <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} />
              </label>
              <label>
                포맷
                <select value={aFormat} onChange={(e) => setAFormat(e.target.value)}>
                  {FORMATS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                메모 <i>(선택)</i>
                <textarea rows={2} value={aMemo} onChange={(e) => setAMemo(e.target.value)} />
              </label>
              <p className="cc-msg">{aMsg}</p>
              <button type="submit" className="cc-btn orange full">
                + 광고 일정 저장
              </button>
              <div className="cc-adlist">
                {adList.length ? (
                  adList.map((a) => (
                    <div key={a.id} className={`cc-row${a.done ? " addone" : ""}`}>
                      <span className="cc-date">{shortDate(a.date)}</span>
                      <div className="cc-main">
                        <div className="t">
                          {a.brand ? `${a.brand} · ` : ""}
                          {a.title}
                        </div>
                        <div className="s">
                          {a.format}
                          {a.memo ? ` · ${a.memo}` : ""}
                        </div>
                      </div>
                      <button type="button" className="cc-btn sm ok" onClick={() => toggleAd(a.id)}>
                        {a.done ? "되돌리기" : "완료"}
                      </button>
                      <button type="button" className="cc-btn sm x" onClick={() => delAd(a)}>
                        삭제
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="cc-empty">아직 없어요</p>
                )}
              </div>
            </form>
          </section>
        </aside>
      </div>

      {askDel ? (
        <div className="cc-modal" role="dialog" aria-modal="true" onClick={() => setAskDel(null)}>
          <div className="cc-modal-box" onClick={(e) => e.stopPropagation()}>
            <p>
              <b>"{askDel.title}"</b>
              <br />
              {askDel.kind === "plan" ? "계획을 지울까요?" : "광고 일정을 지울까요?"}
            </p>
            <div className="cc-modal-acts">
              <button type="button" className="cc-btn" onClick={() => setAskDel(null)} autoFocus>
                취소
              </button>
              <button type="button" className="cc-btn danger" onClick={confirmDel}>
                지우기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`cc-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
