import { create } from "zustand";
import { buildCrewWaypoints } from "../data/shipInteriorLayout";
import { canWorkWithInjury, normalizeInjury } from "../systems/injurySystem";

const WALK_SPEED_PER_SECOND = 22;
const ARRIVAL_EPSILON = 0.45;
const IDLE_ROLL_MIN_MS = 4500;
const IDLE_ROLL_SPREAD_MS = 6500;

const DEFAULT_IDLE_ACTIONS = ["stand", "look", "stretch"];
const ROOM_IDLE_ACTIONS = {
  living: ["stand", "look", "stretch", "coffee", "chat"],
  medbay: ["stand", "look"],
  bridge: ["stand", "look", "stretch"],
  ops: ["stand", "look"],
  engineering: ["stand", "look", "stretch"],
  cargo: ["stand", "look", "stretch"],
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
    const targetById = new Map(targets.map((target) => [target.crewId, target]));
    set((state) => {
      const next = {};
      targets.forEach((target) => {
        const existing = state.motionByCrewId[target.crewId];
        if (!existing) {
          next[target.crewId] = createMotionFromTarget(target);
          return;
        }
        if (sameTarget(existing, target)) {
          const animState = existing.waypoints?.length > 0 ? "walk" : target.animState;
          next[target.crewId] = {
            ...existing,
            targetAnimState: target.animState,
            animState,
            idleAction: animState === "idle" ? existing.idleAction ?? "stand" : null,
            updatedAt: target.updatedAt ?? existing.updatedAt,
          };
          return;
        }
        const finalPoint = { x: target.targetX, y: target.targetY };
        const fromRoomId = existing.currentRoomId ?? existing.targetRoomId ?? target.roomId;
        const waypoints = buildCrewWaypoints(fromRoomId, target.roomId, finalPoint);
        next[target.crewId] = {
          ...existing,
          targetX: target.targetX,
          targetY: target.targetY,
          targetRoomId: target.roomId,
          targetAnimState: target.animState,
          animState: "walk",
          idleAction: null,
          facing: facingFrom(existing.x, waypoints[0]?.x ?? target.targetX, existing.facing),
          waypoints,
          waypointIndex: 0,
          updatedAt: target.updatedAt ?? existing.updatedAt,
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
      Object.entries(state.motionByCrewId).forEach(([crewId, motion]) => {
        const waypoint = motion.waypoints?.[motion.waypointIndex ?? 0];
        if (!waypoint) {
          if (motion.animState === "idle" && nowMs >= (motion.nextIdleRollAt ?? 0)) {
            changed = true;
            next[crewId] = { ...motion, idleAction: pickIdleAction(motion, state.motionByCrewId), nextIdleRollAt: nextIdleRollAt(nowMs) };
            return;
          }
          next[crewId] = motion;
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
        next[crewId] = {
          ...motion,
          x: stepped.x,
          y: stepped.y,
          currentRoomId,
          facing: facingFrom(motion.x, stepped.x, motion.facing),
          animState,
          idleAction,
          nextIdleRollAt: idleRollAt,
          waypoints,
          waypointIndex,
        };
      });
      return changed ? { motionByCrewId: next } : state;
    });
  },
  getMotion: (crewId) => get().motionByCrewId[crewId] ?? null,
}));

export { deriveTargetAnimState };
