import { create } from "zustand";
import { pickBark, BARK_TRIGGERS } from "../data/barks";
import { buildCrewWaypoints } from "../data/shipInteriorLayout";
import { canWorkWithInjury, normalizeInjury } from "../systems/injurySystem";

const WALK_SPEED_PER_SECOND = 22;
const ARRIVAL_EPSILON = 0.45;
const IDLE_ROLL_MIN_MS = 4500;
const IDLE_ROLL_SPREAD_MS = 6500;
const BARK_ROLL_MIN_MS = 7000;
const BARK_ROLL_SPREAD_MS = 9000;
const BARK_DURATION_MS = 2600;
const BARK_COOLDOWN_MIN_MS = 12500;
const BARK_COOLDOWN_SPREAD_MS = 10500;
const MAX_VISIBLE_BARKS = 2;

const DEFAULT_IDLE_ACTIONS = ["stand", "look", "stretch"];
const ROOM_IDLE_ACTIONS = {
  living: ["stand", "look", "stretch", "coffee", "chat"],
  medbay: ["stand", "look"],
  bridge: ["stand", "look", "stretch"],
  ops: ["stand", "look"],
  engineering: ["stand", "look", "stretch"],
  cargo: ["stand", "look", "stretch"],
};

const PERIODIC_BARK_CHANCE = {
  [BARK_TRIGGERS.onIdle]: 0.16,
  [BARK_TRIGGERS.onChat]: 0.42,
  [BARK_TRIGGERS.onWork]: 0.1,
  [BARK_TRIGGERS.onRest]: 0.08,
  [BARK_TRIGGERS.onTreat]: 0.16,
  [BARK_TRIGGERS.onCrisis]: 0.18,
  [BARK_TRIGGERS.onDown]: 0.04,
  [BARK_TRIGGERS.onLowFuel]: 0.16,
  [BARK_TRIGGERS.onDrift]: 0.16,
};

const STATE_ENTRY_BARK_CHANCE = {
  [BARK_TRIGGERS.onWork]: 0.22,
  [BARK_TRIGGERS.onRest]: 0.34,
  [BARK_TRIGGERS.onTreat]: 0.55,
  [BARK_TRIGGERS.onCrisis]: 0.7,
  [BARK_TRIGGERS.onDown]: 0.6,
  [BARK_TRIGGERS.onLowFuel]: 0.62,
  [BARK_TRIGGERS.onDrift]: 0.62,
};

function stepToward(current, target, maxStep) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep || dist <= ARRIVAL_EPSILON) return { x: target.x, y: target.y, arrived: true };
  const ratio = maxStep / dist;
  return { x: current.x + dx * ratio, y: current.y + dy * ratio, arrived: false };
}

function nextIdleRollAt(nowMs) {
  return nowMs + IDLE_ROLL_MIN_MS + Math.random() * IDLE_ROLL_SPREAD_MS;
}

function nextBarkRollAt(nowMs) {
  return nowMs + BARK_ROLL_MIN_MS + Math.random() * BARK_ROLL_SPREAD_MS;
}

function nextBarkCooldownUntil(nowMs) {
  return nowMs + BARK_COOLDOWN_MIN_MS + Math.random() * BARK_COOLDOWN_SPREAD_MS;
}

function facingFrom(currentX, nextX, fallback = "right") {
  if (Math.abs(nextX - currentX) < 0.05) return fallback;
  return nextX >= currentX ? "right" : "left";
}

function pickIdleAction(motion, allMotions) {
  const roomId = motion.currentRoomId ?? motion.targetRoomId;
  const roomActions = ROOM_IDLE_ACTIONS[roomId] ?? DEFAULT_IDLE_ACTIONS;
  const hasNearbyIdleCrew = Object.values(allMotions).some((entry) => entry.crewId !== motion.crewId && (entry.currentRoomId ?? entry.targetRoomId) === roomId && entry.animState === "idle");
  const pool = roomActions.filter((action) => action !== "chat" || hasNearbyIdleCrew);
  return pool[Math.floor(Math.random() * pool.length)] ?? "stand";
}

function activeBarkCount(allMotions, nowMs) {
  return Object.values(allMotions).filter((entry) => entry?.bark?.until > nowMs).length;
}

function expireBark(motion, nowMs) {
  if (!motion?.bark || motion.bark.until > nowMs) return motion;
  return { ...motion, bark: null };
}

function triggerForAnimState(animState, idleAction = "stand") {
  if (animState === "idle") return idleAction === "chat" ? BARK_TRIGGERS.onChat : BARK_TRIGGERS.onIdle;
  if (animState === "work") return BARK_TRIGGERS.onWork;
  if (animState === "rest") return BARK_TRIGGERS.onRest;
  if (animState === "treat") return BARK_TRIGGERS.onTreat;
  if (animState === "panic") return BARK_TRIGGERS.onCrisis;
  if (animState === "down") return BARK_TRIGGERS.onDown;
  return null;
}

function triggerForMotion(motion) {
  return motion.barkTrigger ?? triggerForAnimState(motion.animState, motion.idleAction);
}

function tryAttachBark(motion, allMotions, nowMs, trigger, chance = 1) {
  if (!trigger || Math.random() > chance) return motion;
  if (motion.bark?.until > nowMs) return motion;
  if ((motion.barkCooldownUntil ?? 0) > nowMs) return motion;
  if (activeBarkCount(allMotions, nowMs) >= MAX_VISIBLE_BARKS) return motion;

  const text = pickBark(trigger, {
    roomId: motion.currentRoomId ?? motion.targetRoomId,
    idleAction: motion.idleAction,
  });
  if (!text) return motion;

  return {
    ...motion,
    bark: { text, until: nowMs + BARK_DURATION_MS, trigger },
    barkCooldownUntil: nextBarkCooldownUntil(nowMs),
    nextBarkRollAt: nextBarkRollAt(nowMs),
  };
}

function maybeRollBark(motion, allMotions, nowMs) {
  if (nowMs < (motion.nextBarkRollAt ?? 0)) return motion;
  const prepared = { ...motion, nextBarkRollAt: nextBarkRollAt(nowMs) };
  const trigger = triggerForMotion(prepared);
  const chance = PERIODIC_BARK_CHANCE[trigger] ?? 0.08;
  return tryAttachBark(prepared, allMotions, nowMs, trigger, chance);
}

function maybeAttachStateEntryBark(motion, allMotions, nowMs, trigger) {
  const chance = STATE_ENTRY_BARK_CHANCE[trigger] ?? 0.2;
  return tryAttachBark(motion, allMotions, nowMs, trigger, chance);
}

function deriveTargetAnimState(activity, member) {
  if (!member?.alive) return "down";
  const injury = normalizeInjury(member.injury);
  const medicalIntent = ["medical", "medical-care"].includes(activity?.intent);
  if (!canWorkWithInjury(injury)) return medicalIntent ? "treat" : "down";
  if (activity?.intent === "rest") return "rest";
  if (medicalIntent) return "treat";
  if (activity?.intent === "crisis-response" || activity?.priority === "emergency") return "panic";
  if (["room-job", "engineering", "repair", "navigation", "combat", "security", "training"].includes(activity?.intent)) return "work";
  return "idle";
}

function createMotionFromTarget(target) {
  const nowMs = performance.now();
  return {
    crewId: target.crewId,
    x: target.targetX,
    y: target.targetY,
    targetX: target.targetX,
    targetY: target.targetY,
    currentRoomId: target.roomId,
    targetRoomId: target.roomId,
    facing: "right",
    animState: target.animState ?? "idle",
    targetAnimState: target.animState ?? "idle",
    idleAction: target.animState === "idle" ? "stand" : null,
    nextIdleRollAt: nextIdleRollAt(nowMs),
    nextBarkRollAt: nextBarkRollAt(nowMs),
    barkCooldownUntil: nowMs + Math.random() * 3000,
    barkTrigger: target.barkTrigger ?? null,
    bark: null,
    waypointIndex: 0,
    waypoints: [],
    updatedAt: target.updatedAt ?? 0,
  };
}

function sameTarget(motion, target) {
  return motion.targetRoomId === target.roomId && Math.abs(motion.targetX - target.targetX) < 0.1 && Math.abs(motion.targetY - target.targetY) < 0.1;
}

export const useCrewMotionStore = create((set, get) => ({
  motionByCrewId: {},
  syncTargets: (targets = []) => {
    const nowMs = performance.now();
    const targetById = new Map(targets.map((target) => [target.crewId, target]));
    set((state) => {
      const next = {};
      targets.forEach((target) => {
        const existing = state.motionByCrewId[target.crewId];
        if (!existing) {
          next[target.crewId] = createMotionFromTarget(target);
          return;
        }
        const cleaned = expireBark(existing, nowMs);
        if (sameTarget(cleaned, target)) {
          const animState = cleaned.waypoints?.length > 0 ? "walk" : target.animState;
          let nextMotion = {
            ...cleaned,
            targetAnimState: target.animState,
            animState,
            idleAction: animState === "idle" ? cleaned.idleAction ?? "stand" : null,
            barkTrigger: target.barkTrigger ?? null,
            updatedAt: target.updatedAt ?? cleaned.updatedAt,
          };
          const targetChanged = cleaned.targetAnimState !== target.animState || cleaned.barkTrigger !== (target.barkTrigger ?? null) || cleaned.updatedAt !== (target.updatedAt ?? cleaned.updatedAt);
          const entryTrigger = target.barkTrigger ?? (targetChanged ? triggerForAnimState(target.animState, nextMotion.idleAction) : null);
          if (targetChanged && animState !== "walk") nextMotion = maybeAttachStateEntryBark(nextMotion, state.motionByCrewId, nowMs, entryTrigger);
          next[target.crewId] = nextMotion;
          return;
        }
        const finalPoint = { x: target.targetX, y: target.targetY };
        const fromRoomId = cleaned.currentRoomId ?? cleaned.targetRoomId ?? target.roomId;
        const waypoints = buildCrewWaypoints(fromRoomId, target.roomId, finalPoint);
        next[target.crewId] = {
          ...cleaned,
          targetX: target.targetX,
          targetY: target.targetY,
          targetRoomId: target.roomId,
          targetAnimState: target.animState,
          animState: "walk",
          idleAction: null,
          barkTrigger: target.barkTrigger ?? null,
          facing: facingFrom(cleaned.x, waypoints[0]?.x ?? target.targetX, cleaned.facing),
          waypoints,
          waypointIndex: 0,
          updatedAt: target.updatedAt ?? cleaned.updatedAt,
        };
      });
      Object.entries(state.motionByCrewId).forEach(([crewId, motion]) => {
        if (!targetById.has(crewId)) return;
        next[crewId] = next[crewId] ?? motion;
      });
      return { motionByCrewId: next };
    });
  },
  tick: (deltaMs = 0, nowMs = performance.now()) => {
    if (deltaMs <= 0) return;
    const maxStep = WALK_SPEED_PER_SECOND * (deltaMs / 1000);
    set((state) => {
      let changed = false;
      const next = {};
      Object.entries(state.motionByCrewId).forEach(([crewId, rawMotion]) => {
        let motion = expireBark(rawMotion, nowMs);
        if (motion !== rawMotion) changed = true;
        const waypoint = motion.waypoints?.[motion.waypointIndex ?? 0];
        if (!waypoint) {
          let nextMotion = motion;
          if (motion.animState === "idle" && nowMs >= (motion.nextIdleRollAt ?? 0)) {
            const idleAction = pickIdleAction(motion, state.motionByCrewId);
            nextMotion = { ...motion, idleAction, nextIdleRollAt: nextIdleRollAt(nowMs) };
            const trigger = idleAction === "chat" ? BARK_TRIGGERS.onChat : BARK_TRIGGERS.onIdle;
            nextMotion = tryAttachBark(nextMotion, state.motionByCrewId, nowMs, trigger, idleAction === "chat" ? 0.46 : 0.18);
          } else {
            nextMotion = maybeRollBark(motion, state.motionByCrewId, nowMs);
          }
          if (nextMotion !== motion) changed = true;
          next[crewId] = nextMotion;
          return;
        }
        const stepped = stepToward({ x: motion.x, y: motion.y }, waypoint, maxStep);
        const remainingWaypoints = motion.waypoints ?? [];
        let waypointIndex = motion.waypointIndex ?? 0;
        let waypoints = remainingWaypoints;
        let animState = "walk";
        let currentRoomId = motion.currentRoomId;
        let idleAction = null;
        let idleRollAt = motion.nextIdleRollAt ?? nextIdleRollAt(nowMs);
        let barkTrigger = motion.barkTrigger ?? null;
        if (stepped.arrived) {
          waypointIndex += 1;
          if (waypointIndex >= remainingWaypoints.length) {
            waypoints = [];
            waypointIndex = 0;
            animState = motion.targetAnimState ?? "idle";
            currentRoomId = motion.targetRoomId;
            idleAction = animState === "idle" ? "stand" : null;
            idleRollAt = nextIdleRollAt(nowMs);
          }
        }
        changed = true;
        let nextMotion = {
          ...motion,
          x: stepped.x,
          y: stepped.y,
          currentRoomId,
          facing: facingFrom(motion.x, stepped.x, motion.facing),
          animState,
          idleAction,
          nextIdleRollAt: idleRollAt,
          barkTrigger,
          waypoints,
          waypointIndex,
        };
        if (waypoints.length === 0 && animState !== "walk") {
          const entryTrigger = barkTrigger ?? triggerForAnimState(animState, idleAction);
          nextMotion = maybeAttachStateEntryBark(nextMotion, state.motionByCrewId, nowMs, entryTrigger);
        }
        next[crewId] = nextMotion;
      });
      return changed ? { motionByCrewId: next } : state;
    });
  },
  getMotion: (crewId) => get().motionByCrewId[crewId] ?? null,
}));

export { deriveTargetAnimState };
