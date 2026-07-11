import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CAMPAIGN, DRIFT, NAVIGATION_TRAVEL } from "../data/constants";
import {
  applySectorProgression,
  createGateRequisitionEncounter,
  createCampaignState,
  getGateEncounter,
  getGateClaimId,
  getSectorObjective,
  normalizeCampaignState,
  isFieldNode,
} from "../systems/campaignProgression";
import { evaluateTravelCrewReadiness, travelReadinessMessage } from "../systems/crewAvailability";
import { generateSector, findRoute, rollEncounter, routeDistance } from "../systems/navigationSystem";
import { useCrewStore } from "./crewStore";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";
import { useJobStore } from "./jobStore";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function firstNodeId(sector) {
  return sector?.nodes?.[0]?.id ?? null;
}

function normalizeSector(sector, sectorIndex = 0) {
  if (sector?.nodes?.length) return applySectorProgression(sector, sectorIndex);
  return generateSector("phase-8-start", { sectorIndex });
}

function revealNeighbors(sector, discoveredIds, nodeId) {
  const discovered = new Set(discoveredIds);
  discovered.add(nodeId);
  let frontier = [nodeId];
  for (let depth = 0; depth < NAVIGATION_TRAVEL.discoveryRadiusSteps; depth += 1) {
    const nextFrontier = [];
    frontier.forEach((id) => {
      const node = sector.nodes.find((entry) => entry.id === id);
      (node?.connections ?? []).forEach((connectedId) => {
        if (!discovered.has(connectedId)) nextFrontier.push(connectedId);
        discovered.add(connectedId);
      });
    });
    frontier = nextFrontier;
  }
  return [...discovered];
}

function withNodeFlags(sector, visitedIds, discoveredIds) {
  const visited = new Set(visitedIds);
  const discovered = new Set(discoveredIds);
  return { ...sector, nodes: sector.nodes.map((node) => ({ ...node, visited: visited.has(node.id), discovered: discovered.has(node.id) })) };
}

function nextSeed(seed, index) {
  return `${seed ?? "sector"}-${index + 1}`;
}

function createDriftState(currentMinute, reason = "fuel_empty") {
  return { reason, startedAt: currentMinute, lastTickAt: currentMinute, rescueEta: currentMinute + DRIFT.RESCUE_CHECK_MINUTES, severity: 1, pressure: 0 };
}

function driftSeverity(minutesDrifting) {
  if (minutesDrifting >= 720) return 4;
  if (minutesDrifting >= 360) return 3;
  if (minutesDrifting >= 120) return 2;
  return 1;
}

function currentTravelReadiness() {
  const crew = useCrewStore.getState();
  const jobs = useJobStore.getState();
  // jobs.jobs already carries busy/targeted crew for training, treatment and
  // recovery (see getBusyCrewIdsFromJobs), so the legacy crewStore queues are
  // no longer a separate source of truth here — jobStore is the single source.
  return evaluateTravelCrewReadiness({ crew: crew.crew, jobs: jobs.jobs });
}

function buildTravelPlan(state, targetNodeId, currentMinute = 0, metadata = {}) {
  if (state.campaign?.pendingRequisition) return { ok: false, reason: "pendingRequisition" };
  if (state.pendingEncounter) return { ok: false, reason: "pendingEncounter" };
  if (state.travel) return { ok: false, reason: "traveling" };
  if (state.driftState || state.fuel <= 0) return { ok: false, reason: "drifting" };
  const readiness = currentTravelReadiness();
  if (!readiness.ok) return { ok: false, reason: travelReadinessMessage(readiness), readiness };
  const route = findRoute(state.sector, state.currentNodeId, targetNodeId);
  if (route.length < 2) return { ok: false, reason: "noRoute" };
  // Every arrival pauses for a node encounter, so one travel order executes
  // only the immediate leg. Charging the full multi-hop route here made the
  // first hop consume the entire route's time/fuel and then charged it again
  // after the mandatory encounter.
  const distance = routeDistance(state.sector, route.slice(0, 2));
  const fuelCost = Math.max(2, distance * NAVIGATION_TRAVEL.fuelPerDistance);
  const duration = Math.max(18, Math.round(distance * NAVIGATION_TRAVEL.minutesPerDistance));
  const travel = {
    fromId: route[0],
    toId: route[1],
    targetId: targetNodeId,
    route,
    progress: 0,
    etaMinutes: duration,
    duration,
    fuelCost,
    startedAt: currentMinute,
    completeAt: currentMinute + duration,
    lastFuelAt: currentMinute,
    missionId: metadata.missionId ?? null,
    missionTitle: metadata.missionTitle ?? null,
    missionDestinationName: metadata.missionDestinationName ?? null,
  };
  return { ok: true, route, distance, fuelCost, duration, travel };
}

export function mergePersistedNavState(persistedState, currentState) {
  const sectorIndex = Math.max(0, persistedState?.sectorIndex ?? currentState.sectorIndex ?? 0);
  const sector = normalizeSector(persistedState?.sector ?? currentState.sector, sectorIndex);
  const start = firstNodeId(sector);
  const visited = persistedState?.visited ?? currentState.visited ?? [start];
  const discovered = persistedState?.discovered ?? revealNeighbors(sector, visited, persistedState?.currentNodeId ?? start);
  const visitedFieldCount = sector.nodes.filter((node) => isFieldNode(node) && visited.includes(node.id)).length;
  const campaign = normalizeCampaignState(persistedState?.campaign, sectorIndex, visitedFieldCount);
  const savedEncounter = persistedState?.pendingEncounter ?? null;
  const isSavedGateEncounter = savedEncounter?.nodeType === "exit"
    || (savedEncounter?.options ?? []).some((option) => (option.outcome ?? []).some((effect) => effect.kind === "nextSector"));
  const pendingEncounter = campaign.pendingRequisition
    ? createGateRequisitionEncounter(campaign.pendingRequisition)
    : isSavedGateEncounter
      ? (campaign.status === "completed" ? null : getGateEncounter(savedEncounter, getSectorObjective({ sector, sectorIndex, visited, campaign })))
      : savedEncounter;
  return {
    ...currentState,
    ...(persistedState ?? {}),
    sector: withNodeFlags(sector, visited, discovered),
    sectorIndex,
    campaign,
    currentNodeId: persistedState?.currentNodeId ?? start,
    selectedNodeId: persistedState?.selectedNodeId ?? null,
    route: persistedState?.route ?? [persistedState?.currentNodeId ?? start],
    travel: persistedState?.travel ?? null,
    fuel: persistedState?.fuel ?? currentState.fuel,
    fuelAuthorityVersion: persistedState ? (persistedState.fuelAuthorityVersion ?? 0) : 1,
    discovered,
    visited,
    pendingEncounter,
    driftState: persistedState?.driftState ?? null,
    rescueUsesBySector: persistedState?.rescueUsesBySector ?? {},
    recruitCandidates: persistedState?.recruitCandidates ?? [],
    navLog: persistedState?.navLog ?? currentState.navLog,
  };
}

export const useNavStore = create(
  persist(
    (set, get) => {
      const initialSector = generateSector("phase-8-start");
      const startId = firstNodeId(initialSector);
      return {
        sector: withNodeFlags(initialSector, [startId], revealNeighbors(initialSector, [startId], startId)),
        sectorIndex: 0,
        campaign: createCampaignState(),
        currentNodeId: startId,
        selectedNodeId: null,
        route: [startId],
        travel: null,
        fuel: 100,
        discovered: revealNeighbors(initialSector, [startId], startId),
        visited: [startId],
        pendingEncounter: null,
        driftState: null,
        rescueUsesBySector: {},
        fuelAuthorityVersion: 1,
        recruitCandidates: [],
        navLog: ["항해 컴퓨터 초기화: 노드 기반 성계 지도가 활성화되었습니다."],
        selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
        generateSector: (seed = Date.now()) => {
          const sector = generateSector(seed, { sectorIndex: 0 });
          const start = firstNodeId(sector);
          const discovered = revealNeighbors(sector, [start], start);
          set({ sector: withNodeFlags(sector, [start], discovered), sectorIndex: 0, campaign: createCampaignState(), currentNodeId: start, selectedNodeId: null, route: [start], travel: null, discovered, visited: [start], pendingEncounter: null, driftState: null, rescueUsesBySector: {}, navLog: ["새 1차 개척 원정이 시작되었습니다."] });
        },
        getCurrentObjective: () => getSectorObjective(get()),
        previewRoute: (targetNodeId, currentMinute = 0) => buildTravelPlan(get(), targetNodeId, currentMinute),
        planRoute: (targetNodeId, currentMinute = 0, metadata = {}) => {
          const state = get();
          const plan = buildTravelPlan(state, targetNodeId, currentMinute, metadata);
          if (!plan.ok) return plan;
          const missionPrefix = plan.travel.missionTitle ? `임무 항로 결재: ${plan.travel.missionTitle} · ` : "항로 결재: ";
          const targetSuffix = plan.route[1] === targetNodeId ? "" : ` (최종 ${targetNodeId})`;
          set({ route: plan.route, selectedNodeId: targetNodeId, travel: plan.travel, navLog: [`${missionPrefix}${plan.route[0]} → ${plan.route[1]}${targetSuffix} · 다음 구간 ${Math.round(plan.distance)}u`, ...state.navLog].slice(0, 10) });
          return { ok: true, travel: plan.travel, route: plan.route, distance: plan.distance };
        },
        enterDrift: (currentMinute = 0, reason = "fuel_empty") => {
          const state = get();
          const driftState = state.driftState ?? createDriftState(currentMinute, reason);
          set({ driftState, travel: null, fuel: 0, navLog: ["연료 고갈: 함선이 표류 상태에 들어갔습니다.", ...state.navLog].slice(0, 10) });
          return { effects: [{ kind: "log", message: "연료 고갈로 표류 상태가 되었습니다. 이동이 중단되고 승무원 생활 압박이 증가합니다." }], logs: ["연료 고갈로 표류 상태가 되었습니다."] };
        },
        tickTravel: (deltaMinutes = 0, currentMinute = 0) => {
          if (deltaMinutes <= 0) return { effects: [], logs: [] };
          const state = get();
          if (state.driftState) return { effects: [], logs: [] };
          const currentNode = state.sector?.nodes?.find((node) => node.id === state.currentNodeId);
          // Fuel can also reach zero through ambient/exploration effects while
          // parked in the field. Materialize drift even without active travel
          // so the paid rescue path remains reachable and the save cannot
          // softlock. A real station remains a safe zero-fuel berth.
          if (state.fuel <= 0 && (state.travel || currentNode?.type !== "station")) {
            return get().enterDrift(currentMinute, state.travel ? "fuel_empty" : "fuel_depleted_in_field");
          }
          if (!state.travel || state.pendingEncounter) return { effects: [], logs: [] };
          const elapsed = Math.max(0, currentMinute - state.travel.startedAt);
          const progress = clamp((elapsed / Math.max(1, state.travel.duration)) * 100, 0, 100);
          // Bill only the portion of this tick that overlaps the travel leg.
          // A coarse clock tick may overshoot completeAt; charging the whole
          // tick made actual fuel exceed the route preview.
          const burnStart = Math.max(state.travel.startedAt, state.travel.lastFuelAt ?? state.travel.startedAt);
          const burnEnd = Math.min(currentMinute, state.travel.completeAt ?? (state.travel.startedAt + state.travel.duration));
          const billableMinutes = Math.max(0, burnEnd - burnStart);
          const requestedBurn = (state.travel.fuelCost / Math.max(1, state.travel.duration)) * billableMinutes;
          const fuelBurn = Math.min(state.fuel, requestedBurn);
          const fuel = clamp(state.fuel - fuelBurn, 0, 100);
          const fuelEffects = fuelBurn > 0 ? [{ kind: "fuel", delta: -fuelBurn }] : [];
          if (fuel <= 0 && progress < 100) {
            const drift = get().enterDrift(currentMinute, "fuel_depleted_mid_route");
            return { effects: [...fuelEffects, ...(drift.effects ?? [])], logs: drift.logs ?? [] };
          }
          if (progress < 100) {
            set({ travel: { ...state.travel, progress, lastFuelAt: currentMinute } });
            return { effects: fuelEffects, logs: [] };
          }
          const arrival = get().arriveNode(state.travel.toId, currentMinute);
          return { effects: [...fuelEffects, ...(arrival.effects ?? [])], logs: arrival.logs ?? [] };
        },
        tickDrift: (deltaMinutes = 0, currentMinute = 0) => {
          const state = get();
          if (!state.driftState || deltaMinutes <= 0) return { effects: [], logs: [] };
          if (state.driftState.rescue?.arrivesAt <= currentMinute) {
            const fuel = DRIFT.RESCUE_FUEL;
            set({ driftState: null, navLog: [`구조선 도착: 비상 연료 ${fuel}을 인계받아 표류를 종료했습니다.`, ...state.navLog].slice(0, 10) });
            return { effects: [{ kind: "fuel", delta: fuel }, { kind: "log", message: `구조선이 도착했습니다. 비상 연료 +${fuel}.` }], logs: ["유료 구조 계약 이행 완료: 표류 상태가 해제되었습니다."] };
          }
          const minutesDrifting = Math.max(0, currentMinute - state.driftState.startedAt);
          const severity = driftSeverity(minutesDrifting);
          const hours = deltaMinutes / 60;
          const pressure = clamp((state.driftState.pressure ?? 0) + hours * severity * 4, 0, 100);
          const effects = [{ kind: "driftPressure", severity, deltaMinutes, minutesDrifting }, { kind: "crewNeeds", mode: "drift", severity, deltaMinutes }, { kind: "resource", delta: { oxygen: -DRIFT.OXYGEN_LOSS_PER_HOUR * hours * severity, hull: -DRIFT.HULL_LOSS_PER_HOUR * hours * severity } }];
          const logs = [];
          if (severity !== state.driftState.severity) logs.push(`표류 단계 상승: severity ${severity}. 승무원 스트레스와 고립감이 증가합니다.`);
          if (Math.random() < DRIFT.CRISIS_ROLL_PER_HOUR * hours * severity) effects.push({ kind: "spawnCrisis", roomId: "engineering", type: "power_loss", severity: Math.min(3, severity) });
          set({ driftState: { ...state.driftState, lastTickAt: currentMinute, severity, pressure } });
          return { effects, logs };
        },
        getRescueQuote: (currentMinute = 0) => {
          const state = get();
          if (!state.driftState) return { ok: false, reason: "notDrifting" };
          if (state.driftState.rescue) return { ok: false, reason: "alreadyRequested", rescue: state.driftState.rescue };
          const used = state.rescueUsesBySector?.[state.sectorIndex] ?? 0;
          if (used >= DRIFT.RESCUE_LIMIT_PER_SECTOR) return { ok: false, reason: "sectorLimit", used };
          return { ok: true, cost: DRIFT.RESCUE_CREDIT_COST, fuel: DRIFT.RESCUE_FUEL, delayMinutes: DRIFT.RESCUE_CHECK_MINUTES, arrivesAt: currentMinute + DRIFT.RESCUE_CHECK_MINUTES };
        },
        requestRescue: (currentMinute = 0) => {
          const state = get();
          const quote = get().getRescueQuote(currentMinute);
          if (!quote.ok) return quote;
          const rescue = { requestedAt: currentMinute, arrivesAt: quote.arrivesAt, cost: quote.cost, fuel: quote.fuel };
          const rescueUsesBySector = { ...(state.rescueUsesBySector ?? {}), [state.sectorIndex]: (state.rescueUsesBySector?.[state.sectorIndex] ?? 0) + 1 };
          set({ driftState: { ...state.driftState, rescue }, rescueUsesBySector, navLog: [`구조 계약 체결: ${DRIFT.RESCUE_CHECK_MINUTES}분 후 도착 예정.`, ...state.navLog].slice(0, 10) });
          return { ok: true, rescue };
        },
        arriveNode: (nodeId, currentMinute = 0) => {
          const state = get();
          const node = state.sector.nodes.find((entry) => entry.id === nodeId);
          if (!node) return { effects: [], logs: [] };
          const visited = Array.from(new Set([...state.visited, nodeId]));
          const discovered = revealNeighbors(state.sector, state.discovered, nodeId);
          const remainingRoute = (state.travel?.route ?? []).slice(1);
          const sector = withNodeFlags(state.sector, visited, discovered);
          const objective = getSectorObjective({ ...state, visited });
          const encounter = getGateEncounter(rollEncounter({ ...node, discovered: true, visited: true }, visited.length), objective);
          const missionArrival = state.travel?.missionId && state.travel.targetId === nodeId;
          const logs = missionArrival ? [`임무 목적지 도착: ${state.travel.missionTitle ?? "계약 임무"} · ${node.name}. 조우 결재 후 임무 처리가 가능합니다.`] : [`노드 도착: ${node.name}. 결재 대기 조우가 발생했습니다.`];
          const isNewFieldVisit = !state.visited.includes(nodeId) && isFieldNode(node);
          const campaign = isNewFieldVisit
            ? { ...state.campaign, totalFieldNodesVisited: (state.campaign?.totalFieldNodesVisited ?? 0) + 1 }
            : state.campaign;
          set({ sector, campaign, currentNodeId: nodeId, selectedNodeId: null, route: remainingRoute.length > 0 ? remainingRoute : [nodeId], travel: null, discovered, visited, pendingEncounter: encounter, navLog: [...logs, ...state.navLog].slice(0, 10) });
          return { effects: [{ kind: "log", message: logs[0] }], logs };
        },
        resolveEncounter: (optionId, currentMinute = 0, context = {}) => {
          const state = get();
          const encounter = state.pendingEncounter;
          if (!encounter) return { effects: [], logs: [] };
          const option = encounter.options.find((entry) => entry.id === optionId);
          if (!option) return { ok: false, reason: "invalidOption", effects: [], logs: [] };
          let effects = option?.outcome ?? [];
          const logs = [`조우 결재: ${encounter.title} · ${option?.label ?? "선택"}`];
          let nextSectorState = {};
          if (effects.some((effect) => effect.kind === "nextSector")) {
            if (!context.allowGateTransit) {
              const message = `관문 진입 차단: ${context.gateBlockReason ?? "함장의 수동 결재가 필요합니다."}`;
              set({ navLog: [message, ...state.navLog].slice(0, 10) });
              return { effects: [{ kind: "log", message }], logs: [message] };
            }
            const objective = getSectorObjective(state);
            if (!objective.gateUnlocked) {
              const message = objective.expeditionCompleted
                ? "1차 개척 원정은 이미 완주했습니다. 현재 항해 기록을 계속 유지합니다."
                : `관문 진입 차단: 현장 조사 ${objective.visitedFieldCount}/${objective.requiredFieldVisits}, 위험 ${objective.dangerThreshold}+ 생존 기록 ${objective.dangerousVisitedCount}/1.`;
              set({ pendingEncounter: null, navLog: [message, ...state.navLog].slice(0, 10) });
              return { effects: [{ kind: "log", message }], logs: [message] };
            }
            if (state.campaign?.pendingRequisition) {
              const message = "관문 진입 차단: 이전 관문 보급을 먼저 결재해야 합니다.";
              set({ navLog: [message, ...state.navLog].slice(0, 10) });
              return { effects: [{ kind: "log", message }], logs: [message] };
            }
            const claimId = getGateClaimId(state.campaign, objective.sectorNumber);
            if (state.campaign?.claimedRequisitions?.[claimId]) {
              const message = "관문 진입 차단: 이 섹터의 관문 보급은 이미 처리되었습니다.";
              set({ pendingEncounter: null, navLog: [message, ...state.navLog].slice(0, 10) });
              return { effects: [{ kind: "log", message }], logs: [message] };
            }
            const pendingRequisition = {
              claimId,
              sectorNumber: objective.sectorNumber,
              baseCredits: objective.gateRewardCredits,
              skillPoints: 1,
              isExpeditionFinale: objective.isExpeditionFinale,
              createdAtMinute: currentMinute,
            };
            effects = [];
            const campaignWithPending = {
              ...state.campaign,
              pendingRequisition,
            };
            if (objective.isExpeditionFinale) {
              nextSectorState = {
                campaign: campaignWithPending,
                pendingEncounter: createGateRequisitionEncounter(pendingRequisition),
              };
              logs.push("최종 관문 통과 승인: 마지막 보급 패키지 선택 후 1차 원정이 완주됩니다.");
            } else {
              const nextIndex = state.sectorIndex + 1;
              const seed = nextSeed(state.sector.seed, state.sectorIndex);
              const sector = generateSector(seed, { sectorIndex: nextIndex });
              const start = firstNodeId(sector);
              const discovered = revealNeighbors(sector, [start], start);
              nextSectorState = {
                sector: withNodeFlags(sector, [start], discovered),
                sectorIndex: nextIndex,
                campaign: {
                  ...campaignWithPending,
                  sectorsCleared: nextIndex,
                  highestSectorReached: Math.max(state.campaign?.highestSectorReached ?? 1, nextIndex + 1),
                },
                currentNodeId: start,
                selectedNodeId: null,
                route: [start],
                discovered,
                visited: [start],
                driftState: null,
                pendingEncounter: createGateRequisitionEncounter(pendingRequisition),
              };
              logs.push(`관문 돌파: 원정 섹터 ${nextIndex + 1} 진입 · 보급 패키지 결재 대기.`);
            }
          }
          set({ pendingEncounter: null, ...nextSectorState, navLog: [...logs, ...state.navLog].slice(0, 10) });
          return { effects, logs };
        },
        prepareGateRequisitionClaim: (packageId, claimId, optionId, currentMinute = 0) => {
          const state = get();
          const pending = state.campaign?.pendingRequisition;
          if (!pending) return { ok: false, reason: "noPendingRequisition", newlyClaimed: false, effects: [] };
          const packageDef = CAMPAIGN.GATE_REQUISITION_PACKAGES[packageId];
          if (!packageDef) return { ok: false, reason: "invalidPackage", newlyClaimed: false, effects: [] };
          const expectedClaimId = getGateClaimId(state.campaign, pending.sectorNumber);
          if (claimId !== expectedClaimId || pending.claimId !== expectedClaimId) return { ok: false, reason: "staleClaim", newlyClaimed: false, effects: [] };
          const expectedOptionId = `claim:${expectedClaimId}:${packageId}`;
          if (optionId !== expectedOptionId) return { ok: false, reason: "staleOption", newlyClaimed: false, effects: [] };
          if (state.campaign.claimedRequisitions?.[expectedClaimId]) {
            return { ok: true, newlyClaimed: false, effects: [] };
          }
          const claim = {
            packageId,
            claimedAtMinute: currentMinute,
            baseCredits: pending.baseCredits,
            bonusCredits: packageDef.credits ?? 0,
            items: packageDef.items ?? [],
            skillPoints: pending.skillPoints ?? 1,
          };
          const completedCampaign = pending.isExpeditionFinale;
          const effect = {
            kind: "gateRequisition",
            claimId: expectedClaimId,
            sectorNumber: pending.sectorNumber,
            packageId,
            packageLabel: packageDef.label,
            baseCredits: pending.baseCredits,
            bonusCredits: packageDef.credits ?? 0,
            items: packageDef.items ?? [],
            skillPoints: pending.skillPoints ?? 1,
            isExpeditionFinale: completedCampaign,
          };
          const effects = completedCampaign
            ? [effect, { kind: "campaignComplete", expeditionId: state.campaign.expeditionId, sectorsCleared: CAMPAIGN.EXPEDITION_SECTORS }]
            : [effect];
          return { ok: true, newlyClaimed: true, claim, effects };
        },
        finalizeGateRequisitionClaim: (claimId, claim, currentMinute = 0) => {
          const state = get();
          const pending = state.campaign?.pendingRequisition;
          if (!pending || pending.claimId !== claimId || !claim) return { ok: false, reason: "staleClaim" };
          if (state.campaign.claimedRequisitions?.[claimId]) return { ok: true, newlyClaimed: false };
          const completedCampaign = Boolean(pending.isExpeditionFinale);
          const campaign = {
            ...state.campaign,
            status: completedCampaign ? "completed" : state.campaign.status,
            sectorsCleared: completedCampaign ? CAMPAIGN.EXPEDITION_SECTORS : state.campaign.sectorsCleared,
            highestSectorReached: completedCampaign ? CAMPAIGN.EXPEDITION_SECTORS : state.campaign.highestSectorReached,
            completedAtMinute: completedCampaign ? currentMinute : state.campaign.completedAtMinute,
            pendingRequisition: null,
            claimedRequisitions: { ...(state.campaign.claimedRequisitions ?? {}), [claimId]: claim },
          };
          set({ campaign, pendingEncounter: null, navLog: [`관문 보급 결재: ${claim.packageId}.`, ...state.navLog].slice(0, 10) });
          return { ok: true, newlyClaimed: true, completedCampaign };
        },
        setFuelSnapshot: (fuel) => set({ fuel: clamp(fuel, 0, 100), fuelAuthorityVersion: 1 }),
        revealHiddenNodes: (count = 1) => {
          const state = get();
          const discoveredSet = new Set(state.discovered);
          const currentNode = state.sector.nodes.find((node) => node.id === state.currentNodeId);
          const hiddenNodes = state.sector.nodes.filter((node) => !discoveredSet.has(node.id));
          if (hiddenNodes.length === 0) return [];
          const sorted = [...hiddenNodes].sort((a, b) => {
            const distA = currentNode ? Math.hypot((a.pos?.x ?? 0) - (currentNode.pos?.x ?? 0), (a.pos?.y ?? 0) - (currentNode.pos?.y ?? 0)) : 0;
            const distB = currentNode ? Math.hypot((b.pos?.x ?? 0) - (currentNode.pos?.x ?? 0), (b.pos?.y ?? 0) - (currentNode.pos?.y ?? 0)) : 0;
            return distA - distB;
          });
          const revealed = sorted.slice(0, Math.max(0, count));
          if (revealed.length === 0) return [];
          const discovered = Array.from(new Set([...state.discovered, ...revealed.map((node) => node.id)]));
          const sector = withNodeFlags(state.sector, state.visited, discovered);
          set({ sector, discovered, navLog: [`해독으로 새 좌표 확보: ${revealed.map((node) => node.name).join(", ")}`, ...state.navLog].slice(0, 10) });
          return revealed;
        },
        addRecruitCandidate: (templateId) => set((state) => ({ recruitCandidates: Array.from(new Set([...(state.recruitCandidates ?? []), templateId])) })),
      };
    },
    {
      name: "space-manager-nav",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: mergePersistedNavState,
    },
  ),
);
