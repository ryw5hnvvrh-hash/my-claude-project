// 서버 없이 도는 한 장짜리 오피스 — 아이패드 등 브라우저에서 바로 열기용
// `npm run build:static` 으로 dist-static/office.html 을 만듭니다.
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import "../app/office.css";
import Home from "../app/page";

createRoot(document.getElementById("root")!).render(<Home />);
