import { Clock3, Gift, MapPin, ShieldAlert } from "lucide-react";
import { formatMinutes } from "../../data/moduleRecipes";

const CATEGORY_VISUALS = {
  salvage: { icon: "▣", label: "SALVAGE", art: "mission-art-salvage" },
  survey: { icon: "◌", label: "SURVEY", art: "mission-art-survey" },
  courier: { icon: "▸", label: "COURIER", art: "mission-art-courier" },
  escort: { icon: "◆", label: "ESCORT", art: "mission-art-escort" },
  rescue: { icon: "+", label: "RESCUE", art: "mission-art-rescue" },
  bounty: { icon: "⌖", label: "BOUNTY", art: "mission-art-bounty" },
  mining: { icon: "⬡", label: "MINING", art: "mission-art-mining" },
  research: { icon: "✦", label: "RESEARCH", art: "mission-art-research" },
};

const RISK_VALUE = { low: 24, medium: 48, high: 72, extreme: 94 };
const RISK_LABEL = { low: "LOW", medium: "MID", high: "HIGH", extreme: "MAX" };

function rewardIcon(key) {
  if (key === "dust") return "✦";
  if (key === "scrap") return "▧";
  if (/blueprint/i.test(key)) return "▤";
  if (/artifact/i.test(key)) return "◈";
  if (/recruit/i.test(key)) return "◇";
  if (/reputation/i.test(key)) return "★";
  return "●";
}

function rewardShortValue(key, value) {
  if (/Chance$/.test(key)) return `${Math.round((value ?? 0) * 100)}%`;
  if (typeof value === "number" && value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return value;
}

export function MissionPoster({ mission, routePreview, compact = false }) {
  const visual = CATEGORY_VISUALS[mission?.category] ?? CATEGORY_VISUALS.survey;
  const risk = RISK_VALUE[mission?.risk] ?? 35;
  return (
    <div className={`mission-poster ${visual.art} ${compact ? "mission-poster-compact" : ""}`}>
      <div className="mission-poster-grid" />
      <div className="mission-poster-orbit" />
      <div className="mission-poster-ship" />
      <div className="mission-poster-emblem">{visual.icon}</div>
      <div className="mission-poster-label">{visual.label}</div>
      <div className="mission-poster-risk"><span style={{ width: `${risk}%` }} /></div>
      {routePreview?.ok && <div className="mission-poster-route"><Clock3 size={12} />{formatMinutes(routePreview.duration)}</div>}
    </div>
  );
}

export function MissionStatStrip({ mission, routePreview }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <div className="mission-stat-tile"><ShieldAlert size={14} /><span>{RISK_LABEL[mission.risk] ?? mission.riskLabel}</span></div>
      <div className="mission-stat-tile"><MapPin size={14} /><span className="truncate">{mission.destinationName}</span></div>
      <div className="mission-stat-tile"><Clock3 size={14} /><span>{routePreview?.ok ? `${routePreview.route.length - 1}구간` : "불가"}</span></div>
    </div>
  );
}

export function RewardIconRow({ reward = {}, max = 5 }) {
  const entries = Object.entries(reward).filter(([, value]) => value !== null && value !== undefined && value !== 0).slice(0, max);
  if (entries.length === 0) return <span className="text-xs text-slate-500">보상 미정</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => <span key={key} className="mission-reward-icon"><b>{rewardIcon(key)}</b>{rewardShortValue(key, value)}</span>)}
    </div>
  );
}

export function MissionProgressSteps({ arrived, pendingEncounter, completed = false }) {
  const steps = [
    { id: "travel", label: "항해", done: arrived || completed },
    { id: "encounter", label: "조우", done: (arrived && !pendingEncounter) || completed, active: arrived && pendingEncounter },
    { id: "reward", label: "보상", done: completed, active: arrived && !pendingEncounter && !completed },
  ];
  return (
    <div className="mission-steps">
      {steps.map((step) => <span key={step.id} className={`mission-step ${step.done ? "mission-step-done" : ""} ${step.active ? "mission-step-active" : ""}`}>{step.label}</span>)}
    </div>
  );
}
