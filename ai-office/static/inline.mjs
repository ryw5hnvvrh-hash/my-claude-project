// dist-static/office.js + office.css → dist-static/office.html (한 파일)
import { readFileSync, writeFileSync } from "node:fs";

const js = readFileSync("dist-static/office.js", "utf8");
const css = readFileSync("dist-static/office.css", "utf8");
const name = /\bname:\s*"([^"]+)"/.exec(readFileSync("company.config.ts", "utf8"))?.[1] ?? "AI";
const title = `${name} 오피스`;
const html = `<title>${title}</title>
<style>body{background:#ffe6f2;margin:0}</style>
<style>${css}</style>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, "<\\/script")}</script>
`;
writeFileSync("dist-static/office.html", html);
console.log(`dist-static/office.html (${(html.length / 1024).toFixed(0)} KB)`);
