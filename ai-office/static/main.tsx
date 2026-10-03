// 서버 없이 도는 한 장짜리 오피스 — 아이패드 등 브라우저에서 바로 열기용
// `npm run build:static` 으로 dist-static/office.html 을 만듭니다.
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import "../app/office.css";
import "../app/theme-nature.css";
import "../app/insta.css";
import Home from "../app/page";

// 보고 발행 서버가 없다는 표시 — 화면이 발행을 시도하지 않고 안내만 한다
(window as { __AI_OFFICE_SERVERLESS__?: boolean }).__AI_OFFICE_SERVERLESS__ = true;

createRoot(document.getElementById("root")!).render(<Home />);
