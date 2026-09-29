// node office/pathfinding.test.js
const assert = require('assert');
const path = require('path');
const { findPath, nearestFree } = require('./pathfinding');
const MAP = require(path.join(__dirname, 'map.json'));

const W = MAP.width, H = MAP.height;
const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && MAP.legend[MAP.tiles[y][x]].walkable;
const k = (p) => p[0] + ',' + p[1];

// 기준값: BFS 최단 거리
function bfs(s, g, blocked) {
  const seen = new Map([[k(s), 0]]), q = [s];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    if (x === g[0] && y === g[1]) return seen.get(k(q[i]));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [x + dx, y + dy];
      if (!seen.has(k(n)) && walkable(...n) && !(blocked && blocked.has(k(n)))) { seen.set(k(n), seen.get(k(q[i])) + 1); q.push(n); }
    }
  }
  return null;
}
function valid(p, s, blocked) {
  let prev = s;
  for (const c of p) {
    assert.strictEqual(Math.abs(c[0] - prev[0]) + Math.abs(c[1] - prev[1]), 1, '한 칸씩 이동');
    assert.ok(walkable(...c), '벽·가구 통과 금지 ' + k(c));
    assert.ok(!(blocked && blocked.has(k(c))), '다른 직원 칸 통과 금지 ' + k(c));
    prev = c;
  }
}

const seat = id => MAP.rooms.find(r => r.id === id).seats[0];
const spawn = MAP.spawn;
let n = 0;

// 1. 모든 책상 자리 쌍: A* 길이 = BFS 최단 거리, 경로 유효
const seats = MAP.rooms.flatMap(r => r.seats);
for (const a of seats) for (const b of seats) {
  const p = findPath(a, b, walkable);
  const d = bfs(a, b);
  assert.ok(p, `길 없음 ${k(a)}→${k(b)}`);
  assert.strictEqual(p.length, d, `최단 아님 ${k(a)}→${k(b)}: ${p.length} vs ${d}`);
  valid(p, a); n++;
}

// 2. 복도에 직원이 서 있으면 돌아간다
const s = [20, 8], g = [30, 8];
const direct = findPath(s, g, walkable);
assert.strictEqual(direct.length, 10);
const blocked = new Set(['25,8']);
const around = findPath(s, g, walkable, blocked);
valid(around, s, blocked);
assert.strictEqual(around.length, 12, '한 명 피하면 2걸음 더');
n++;

// 3. 문(1칸)을 막으면 그 방에는 못 들어간다 → null
const research = MAP.rooms.find(r => r.id === 'research');
const doorBlocked = new Set([k(research.doors[0])]);
assert.strictEqual(findPath(spawn, seat('research'), walkable, doorBlocked), null);
n++;

// 4. 복도 3칸을 한 줄로 다 막으면 null, 한 칸만 열면 그 칸으로 지나간다
const wall3 = new Set(['30,7', '30,8', '30,9']);
assert.strictEqual(findPath([20, 8], [40, 8], walkable, wall3), null);
wall3.delete('30,9');
const gap = findPath([20, 8], [40, 8], walkable, wall3);
valid(gap, [20, 8], wall3);
assert.ok(gap.some(c => k(c) === '30,9'), '열린 칸으로 통과');
n++;

// 5. 목적지가 가구(책상)면 가장 가까운 걸을 수 있는 칸을 고른다
const desk = [seat('qa')[0], seat('qa')[1] - 1];
assert.ok(!walkable(...desk));
const nf = nearestFree(desk, walkable, null, spawn);
assert.ok(walkable(...nf) && Math.abs(nf[0] - desk[0]) + Math.abs(nf[1] - desk[1]) === 1);
n++;

// 6. 목적지에 이미 직원이 있으면 옆 칸
const occ = new Set([k(seat('ceo'))]);
const nf2 = nearestFree(seat('ceo'), walkable, occ, spawn);
assert.ok(nf2 && k(nf2) !== k(seat('ceo')));
n++;

console.log(`통과: ${n}개 검사 (책상 자리 ${seats.length}×${seats.length} 쌍 최단 경로 포함)`);
