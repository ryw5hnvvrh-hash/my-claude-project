// performance/instagram_<날짜>.json 들을 모아 app/insights-data.json 으로 만든다.
// 인스타 데이터 담당 세션이 매일 08:50 에 올리는 파일을 오피스 대시보드가 읽을 수 있게 한다.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../../performance/", import.meta.url).pathname;
const snapshots = [];
for (const name of readdirSync(dir).filter((f) => /^instagram_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
  try {
    const data = JSON.parse(readFileSync(join(dir, name), "utf8"));
    snapshots.push(data);
  } catch (error) {
    console.warn(`건너뜀 (JSON 오류): ${name} — ${error.message}`);
  }
}
const out = new URL("../app/insights-data.json", import.meta.url).pathname;
writeFileSync(out, JSON.stringify({ snapshots }, null, 1));
console.log(`insights-data.json: 스냅샷 ${snapshots.length}개`);
