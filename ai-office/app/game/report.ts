// 라이브 오피스의 하루 결과 → 보고서로 변환하고 서버(/api/report)로 발행한다
import type { Snapshot } from "./sim";
import { BLOCK_NEED, DEPT_BRIEF } from "./staff";
import { roomOf } from "./world";
import { COMPANY } from "../../company.config";

export type DayReport = {
  title: string;
  clock: string;
  phase: string;
  counts: { total: number; done: number; working: number; approval: number; blocked: number };
  highlights: string[];
  decisions: string[];
  risks: string[];
  next: string[];
  log: { time: string; text: string }[];
};

export type PublishResult = {
  notion: { ok: boolean; status: string; detail?: string; url?: string };
  discord: { ok: boolean; status: string; detail?: string };
  publishedAt: string;
};

export type IntegrationStatus = Record<
  string,
  { configured: boolean; label: string; need?: string }
>;

export function buildReport(snap: Snapshot): DayReport {
  const entries = Object.entries(snap.deptStatus);

  const highlights = entries
    .filter(([, status]) => status === "완료")
    .map(([dept]) => `${roomOf(dept).name} — ${DEPT_BRIEF[dept]?.report ?? "완료"}`);

  const risks = entries
    .filter(([, status]) => status === "연동 대기")
    .map(([dept]) => `${roomOf(dept).name} — ${BLOCK_NEED[dept] ?? "외부 연동"} 대기로 오늘 진행 불가`);

  const decisions = snap.approved
    ? ["TOP 1 콘텐츠 제작 승인 — 대본·제작까지 진행 완료"]
    : snap.approvalPending
      ? ["TOP 1 콘텐츠 승인 여부 (결재 대기 중)"]
      : ["오늘 대표 결재 안건 없음"];

  const next = [
    ...risks.map((risk) => `${risk.split(" — ")[0]}: 연동 완료되면 즉시 재가동`),
    snap.approved ? "제작된 콘텐츠 업로드 및 성과 기록" : "TOP 3 재검토",
  ];

  return {
    title: `${snap.clock} ${COMPANY.reportName} 일일 브리핑`,
    clock: snap.clock,
    phase: snap.phase,
    counts: {
      total: entries.length,
      done: snap.stats.done,
      working: snap.stats.working,
      approval: snap.stats.approval,
      blocked: snap.stats.blocked,
    },
    highlights,
    decisions,
    risks,
    next,
    log: [...snap.log].reverse().map((entry) => ({ time: entry.time, text: `${entry.icon} ${entry.text}` })),
  };
}

export async function publish(report: DayReport): Promise<PublishResult> {
  const response = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!response.ok) throw new Error(`발행 실패 (HTTP ${response.status})`);
  return (await response.json()) as PublishResult;
}

export async function fetchIntegrations(): Promise<IntegrationStatus> {
  const response = await fetch("/api/integrations");
  if (!response.ok) throw new Error("연동 상태 조회 실패");
  return (await response.json()) as IntegrationStatus;
}
