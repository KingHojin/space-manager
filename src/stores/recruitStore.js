import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CREW_CAPACITY_FALLBACK, CREW_TEMPLATES, RECRUIT_COST, RECRUIT_PITY, RECRUIT_RATES, getCandidateRecruitCost, getCrewTemplate, getTemplatesByRarity, validateRecruitRates } from "../data/recruitment";
import { useCrewStore } from "./crewStore";
import { useGameStore } from "./gameStore";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

function createRngSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pick(list) {
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length) % list.length];
}

function rollRarity(pity) {
  if (!validateRecruitRates()) return { rarity: "common", pityTriggered: false, error: "invalidRates" };
  if ((pity ?? 0) + 1 >= RECRUIT_PITY.threshold) return { rarity: RECRUIT_PITY.guaranteedRarity, pityTriggered: true };
  const roll = Math.random();
  let cursor = 0;
  for (const entry of RECRUIT_RATES) {
    cursor += entry.rate;
    if (roll <= cursor) return { rarity: entry.rarity, pityTriggered: false };
  }
  return { rarity: RECRUIT_RATES[RECRUIT_RATES.length - 1].rarity, pityTriggered: false };
}

function instantiateCrew(template) {
  return { id: `recruit-${template.templateId}-${createRngSeed()}`, templateId: template.templateId, name: template.name, role: template.role, morale: "보통", injury: "healthy", fatigue: 0, experience: 0, trait: template.trait, rarity: template.rarity, portrait: template.portrait, stats: { ...template.baseStats } };
}

function currentCapacity() {
  return CREW_CAPACITY_FALLBACK;
}

function canAcceptCrew(templateId) {
  const crew = useCrewStore.getState().crew ?? [];
  if (crew.length >= currentCapacity()) return { ok: false, reason: "capacity" };
  if (crew.some((member) => member.templateId === templateId)) return { ok: false, reason: "duplicate" };
  return { ok: true };
}

function refundFor(template, paidAmount = RECRUIT_COST.single) {
  return Math.min(Math.max(0, paidAmount), RECRUIT_COST.duplicateRefund[template?.rarity] ?? 35);
}

export const useRecruitStore = create(
  persist(
    (set, get) => ({
      currency: 0,
      pity: 0,
      pullHistory: [],
      candidatePool: [],
      lastResults: [],
      addCurrency: (amount) => set((state) => ({ currency: Math.max(0, (state.currency ?? 0) + amount) })),
      addCandidate: (templateId, source = "encounter") => {
        const template = getCrewTemplate(templateId);
        if (!template) return { ok: false, reason: "templateNotFound" };
        let candidate = null;
        set((state) => {
          if ((state.candidatePool ?? []).some((entry) => entry.templateId === templateId)) return state;
          candidate = { id: crypto.randomUUID(), templateId, source, createdAt: Date.now() };
          return { candidatePool: [candidate, ...(state.candidatePool ?? [])].slice(0, 12) };
        });
        return { ok: true, candidate };
      },
      removeCandidate: (candidateId) => set((state) => ({ candidatePool: (state.candidatePool ?? []).filter((candidate) => candidate.id !== candidateId) })),
      pull: (count = 1) => {
        const requestedCount = count === 10 ? 10 : 1;
        const crew = useCrewStore.getState().crew ?? [];
        const safeCount = Math.min(requestedCount, Math.max(0, currentCapacity() - crew.length));
        if (safeCount <= 0) return { ok: false, reason: "capacity" };
        const unitCost = requestedCount === 10 && safeCount >= 2 ? RECRUIT_COST.ten / 10 : RECRUIT_COST.single;
        const cost = unitCost * safeCount;
        if (!useGameStore.getState().spendCredits(cost)) return { ok: false, reason: "credits" };
        const results = [];
        let pity = get().pity ?? 0;
        let refund = 0;
        for (let index = 0; index < safeCount; index += 1) {
          const rarityRoll = rollRarity(pity);
          const template = pick(getTemplatesByRarity(rarityRoll.rarity)) ?? pick(CREW_TEMPLATES);
          const accept = canAcceptCrew(template.templateId);
          let member = null;
          let duplicateRefund = 0;
          if (accept.ok) {
            member = instantiateCrew(template);
            const recruitResult = useCrewStore.getState().recruitCrew(member);
            if (!recruitResult.ok) {
              member = null;
              duplicateRefund = refundFor(template, unitCost);
              refund += duplicateRefund;
            }
          } else {
            duplicateRefund = refundFor(template, unitCost);
            refund += duplicateRefund;
          }
          pity = rarityRoll.rarity === "epic" || rarityRoll.rarity === "legendary" || rarityRoll.pityTriggered ? 0 : pity + 1;
          results.push({ id: crypto.randomUUID(), templateId: template.templateId, name: template.name, role: template.role, rarity: template.rarity, trait: template.trait, portrait: template.portrait, stats: template.baseStats, memberId: member?.id ?? null, duplicate: !member, duplicateRefund, paidCost: unitCost, netCost: unitCost - duplicateRefund, pityTriggered: rarityRoll.pityTriggered, reason: accept.reason ?? null });
        }
        refund = Math.min(cost, refund);
        if (refund > 0) useGameStore.getState().addResources({ credits: refund });
        set((state) => ({ pity, lastResults: results, pullHistory: [...results, ...(state.pullHistory ?? [])].slice(0, 40) }));
        return { ok: true, results, cost, refund };
      },
      recruitFromCandidate: (candidateId) => {
        const candidate = (get().candidatePool ?? []).find((entry) => entry.id === candidateId);
        if (!candidate) return { ok: false, reason: "candidateNotFound" };
        const template = getCrewTemplate(candidate.templateId);
        if (!template) return { ok: false, reason: "templateNotFound" };
        const accept = canAcceptCrew(template.templateId);
        if (!accept.ok) return { ok: false, reason: accept.reason };
        const cost = getCandidateRecruitCost(template.rarity);
        if (!useGameStore.getState().spendCredits(cost)) return { ok: false, reason: "credits", cost };
        const member = instantiateCrew(template);
        const recruitResult = useCrewStore.getState().recruitCrew(member);
        if (!recruitResult.ok) {
          useGameStore.getState().addResources({ credits: cost });
          return { ...recruitResult, refunded: cost, cost };
        }
        set((state) => ({ candidatePool: (state.candidatePool ?? []).filter((entry) => entry.id !== candidateId), lastResults: [{ id: crypto.randomUUID(), templateId: template.templateId, name: template.name, role: template.role, rarity: template.rarity, trait: template.trait, portrait: template.portrait, stats: template.baseStats, memberId: member.id, duplicate: false, fromCandidate: true }] }));
        return { ok: true, member, cost };
      },
      getCapacity: () => currentCapacity(),
    }),
    {
      name: "space-manager-recruit",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => ({ ...currentState, ...(persistedState ?? {}), currency: persistedState?.currency ?? 0, pity: persistedState?.pity ?? 0, pullHistory: persistedState?.pullHistory ?? [], candidatePool: persistedState?.candidatePool ?? [], lastResults: persistedState?.lastResults ?? [] }),
    },
  ),
);

export { instantiateCrew };
