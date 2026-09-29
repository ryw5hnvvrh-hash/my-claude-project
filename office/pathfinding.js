// A* 경로 탐색 (4방향 격자, 맨해튼 거리). 브라우저에서는 window.OfficePath, Node에서는 require로 쓴다.
(function (root) {
  // 최소 힙: f가 작은 칸부터 꺼낸다. 동점이면 h가 작은 칸(목적지에 가까운 칸) 먼저.
  function Heap() { this.a = []; }
  Heap.prototype.less = function (i, j) {
    const a = this.a[i], b = this.a[j];
    return a.f < b.f || (a.f === b.f && a.h < b.h);
  };
  Heap.prototype.push = function (n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [a[i], a[p]] = [a[p], a[i]]; i = p;
    }
  };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.a.length; };

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /**
   * start, goal: [x, y]
   * walkable(x, y): 벽·가구가 아니면 true
   * blocked: Set of "x,y" — 다른 직원이 서 있는 칸. 이 칸은 지나가지 않는다.
   * 반환: start 다음 칸부터 goal까지의 [x, y] 배열. 길이 없으면 null.
   */
  function findPath(start, goal, walkable, blocked) {
    const key = (x, y) => x + ',' + y;
    const sk = key(start[0], start[1]), gk = key(goal[0], goal[1]);
    if (sk === gk) return [];
    if (!walkable(goal[0], goal[1]) || (blocked && blocked.has(gk))) return null;
    const h = (x, y) => Math.abs(x - goal[0]) + Math.abs(y - goal[1]);
    const g = new Map([[sk, 0]]), from = new Map(), closed = new Set();
    const open = new Heap();
    open.push({ x: start[0], y: start[1], f: h(start[0], start[1]), h: h(start[0], start[1]) });
    while (open.size()) {
      const cur = open.pop(), ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      if (ck === gk) {
        const path = [];
        let k = gk;
        while (k !== sk) { const [x, y] = k.split(',').map(Number); path.push([x, y]); k = from.get(k); }
        return path.reverse();
      }
      closed.add(ck);
      const cg = g.get(ck);
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy, nk = key(nx, ny);
        if (closed.has(nk) || !walkable(nx, ny) || (blocked && blocked.has(nk))) continue;
        const ng = cg + 1;
        if (ng < (g.has(nk) ? g.get(nk) : Infinity)) {
          g.set(nk, ng); from.set(nk, ck);
          const hh = h(nx, ny);
          open.push({ x: nx, y: ny, f: ng + hh, h: hh });
        }
      }
    }
    return null;
  }

  /** target에서 가장 가까운(걸음 수 기준) 비어 있는 칸. target 자신이 비어 있으면 target. */
  function nearestFree(target, walkable, blocked, from) {
    const key = (x, y) => x + ',' + y;
    const seen = new Set([key(target[0], target[1])]), q = [target];
    // target이 벽·가구면 주변으로 퍼져 나가며 찾는다. 가구 너머로도 퍼지되 결과는 걸을 수 있는 칸만.
    for (let i = 0; i < q.length && i < 4000; i++) {
      const [x, y] = q[i];
      const k = key(x, y);
      if (walkable(x, y) && !(blocked && blocked.has(k)) && (!from || findPath(from, [x, y], walkable, blocked))) return [x, y];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, nk = key(nx, ny);
        if (!seen.has(nk) && nx >= 0 && ny >= 0 && nx < 999 && ny < 999) { seen.add(nk); q.push([nx, ny]); }
      }
    }
    return null;
  }

  const api = { findPath, nearestFree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OfficePath = api;
})(typeof window !== 'undefined' ? window : this);
