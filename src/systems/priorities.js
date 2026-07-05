export const PRIORITY_ORDER = ["emergency", "high", "normal", "low"];

export const PRIORITY_CONFIG = {
  emergency: {
    label: "긴급",
    shortLabel: "긴급",
    score: 0,
    tone: "hud-chip-danger",
    cardTone: "border-red-400/45 bg-red-400/10 text-red-100",
  },
  high: {
    label: "높음",
    shortLabel: "높음",
    score: 1,
    tone: "hud-chip-warn",
    cardTone: "border-amber-300/45 bg-amber-300/10 text-amber-100",
  },
  normal: {
    label: "보통",
    shortLabel: "보통",
    score: 2,
    tone: "hud-chip-accent",
    cardTone: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
  },
  low: {
    label: "낮음",
    shortLabel: "낮음",
    score: 3,
    tone: "",
    cardTone: "border-slate-500/40 bg-slate-500/10 text-slate-100",
  },
};

export function normalizePriority(priority) {
  return PRIORITY_CONFIG[priority] ? priority : "normal";
}

export function getPriorityConfig(priority) {
  return PRIORITY_CONFIG[normalizePriority(priority)];
}

export function getNextPriority(priority) {
  const current = normalizePriority(priority);
  const index = PRIORITY_ORDER.indexOf(current);
  return PRIORITY_ORDER[(index + 1) % PRIORITY_ORDER.length];
}

export function comparePriorityTasks(a, b) {
  const priorityDelta = getPriorityConfig(a.priority).score - getPriorityConfig(b.priority).score;
  if (priorityDelta !== 0) return priorityDelta;
  return (a.completeAt ?? 0) - (b.completeAt ?? 0);
}

export function inferTreatmentPriority(injury) {
  const state = typeof injury === "object" ? injury.state : injury;
  if (["전사", "중상", "위독", "전투불능", "serious", "critical", "incapacitated"].includes(state)) return "emergency";
  if (["경상", "minor"].includes(state)) return "high";
  return "normal";
}

export function inferTrainingPriority(member) {
  if (!member?.alive) return "low";
  if ((member.fatigue ?? 0) >= 70) return "low";
  return "normal";
}

export function inferModulePriority(module, type = "upgrade") {
  if (type === "equip") return "high";
  if (["epic", "legendary"].includes(module?.rarity)) return "high";
  return "normal";
}
