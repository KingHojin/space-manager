import { useMemo, useState } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { getReportCategory, REPORT_CATEGORIES } from "../../data/reports";
import { getReportsByCategory, getUnacknowledgedCount, getUnreadCount, useReportStore } from "../../stores/reportStore";
import { PRIORITY_LABEL, PRIORITY_TONE } from "../../systems/commandCenter";
import { formatGameDate } from "../../systems/gameClock";

// Phase 20-C: the captain's report inbox. Follows PolicyModal.jsx's pattern —
// a catalog-driven filter row, hud-chip toggles, and a card list — since that
// is this codebase's most recent modal shipped for a similar "catalog +
// recent activity" shape (docs/PHASE_20_REPORT_SYSTEM.md's "20-C" section).
//
// Render-stability note: `reports` itself is a plain field selector (stable
// reference between renders unless the store actually changes). Anything
// that derives a NEW array from it (the category filter below) is wrapped in
// useMemo, per reportStore.js's "Derived selectors and render stability"
// comment — getReportsByCategory must never be called directly inside a
// useReportStore(...) selector.
function ReportCard({ report, onOpen, onAcknowledge }) {
  const category = getReportCategory(report.category);
  const priorityLabel = PRIORITY_LABEL[report.priority] ?? report.priority;
  const priorityTone = PRIORITY_TONE[report.priority] ?? PRIORITY_TONE.info;
  const unacknowledgedCritical = report.priority === "critical" && !report.acknowledged;
  const emphasisClass = unacknowledgedCritical
    ? "border-red-400/60 bg-red-400/10"
    : !report.read
      ? "border-cyan-300/50 bg-cyan-400/5"
      : "border-slate-700/70 bg-slate-950/60";

  return (
    <div
      className={`rounded border p-3 text-left transition hover:border-cyan-300/60 ${emphasisClass}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(report.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen(report.id);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {!report.read && <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-300" title="미확인" />}
          <span className="shrink-0 text-lg">{category?.icon ?? "📋"}</span>
          <span className="truncate font-semibold text-slate-50">{report.title}</span>
        </div>
        <span className={`hud-chip shrink-0 ${priorityTone}`}>{priorityLabel}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{report.body}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="hud-label">{formatGameDate(report.createdAtMinute)}</span>
        {report.acknowledged ? (
          <span className="hud-chip hud-chip-success" aria-disabled="true">
            확인됨
          </span>
        ) : (
          <button
            className="secondary-button min-h-8 px-3 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              onAcknowledge(report.id);
            }}
          >
            확인
          </button>
        )}
      </div>
    </div>
  );
}

export default function ReportsModal() {
  const reports = useReportStore((state) => state.reports);
  const markRead = useReportStore((state) => state.markRead);
  const markAllRead = useReportStore((state) => state.markAllRead);
  const acknowledge = useReportStore((state) => state.acknowledge);
  const clearAcknowledged = useReportStore((state) => state.clearAcknowledged);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const unreadCount = getUnreadCount(reports);
  const unacknowledgedCount = getUnacknowledgedCount(reports);
  const acknowledgedCount = reports.length - unacknowledgedCount;

  const filteredReports = useMemo(
    () => (categoryFilter === "all" ? reports : getReportsByCategory(reports, categoryFilter)),
    [reports, categoryFilter],
  );

  return (
    <div className="grid gap-4">
      <section>
        <div className="section-title">
          <Bell size={18} />
          함장 보고서
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          정책 자동 집행, 전투, 항해·조우, 함내 위기, 작업 완료, 계약 이벤트가 발생하면 이곳에 접수됩니다.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="hud-chip hud-chip-accent">전체 {reports.length}</span>
          <span className={`hud-chip ${unreadCount > 0 ? "hud-chip-warn" : ""}`}>미확인 {unreadCount}</span>
          <button className="secondary-button min-h-8 px-3 text-xs" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck size={14} />
            모두 읽음
          </button>
          {acknowledgedCount > 0 && (
            <button className="secondary-button min-h-8 px-3 text-xs" onClick={clearAcknowledged}>
              <Trash2 size={14} />
              확인한 보고서 정리
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-wrap gap-1.5">
        <button className={`hud-chip ${categoryFilter === "all" ? "hud-chip-accent" : ""}`} onClick={() => setCategoryFilter("all")}>
          전체
        </button>
        {REPORT_CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`hud-chip ${categoryFilter === category.id ? "hud-chip-accent" : ""}`}
            onClick={() => setCategoryFilter(category.id)}
          >
            {category.icon} {category.label}
          </button>
        ))}
      </section>

      <section className="grid gap-2">
        {filteredReports.length === 0 ? (
          <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-6 text-center text-sm text-slate-500">
            {reports.length === 0 ? "아직 접수된 보고서가 없습니다." : "선택한 카테고리에 해당하는 보고서가 없습니다."}
          </div>
        ) : (
          filteredReports.map((report) => (
            <ReportCard key={report.id} report={report} onOpen={markRead} onAcknowledge={acknowledge} />
          ))
        )}
      </section>
    </div>
  );
}
