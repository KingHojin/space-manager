import { create } from "zustand";
import { buildCrewWaypoints } from "../data/shipInteriorLayout";

const WALK_SPEED_PER_SECOND = 22;
const ARRIVAL_EPSILON = 0.45;

function distance(a, b) {
  return Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0));
}

function stepToward(current, target, maxStep) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep || dist <= ARRIVAL_EPSILON) return { x: target.x, y: target.y, arrived: true };
  const ratio = maxStep / dist;
  return { x: current.x + dx * ratio, y: current.y + dy * ratio, arrived: false };
}

function facingFrom(currentX, nextX, fallback = "right") {
  if (Math.abs(nextX - currentX) < 0.05) return fallback;
  return nextX >= currentX ? "right" : "left";
}

function deriveTargetAnimState(activity, member) {
  if (!member?.alive) return "down";
  if (activity?.intent === "rest") return "rest";
  if (["medical", "medical-care"].includes(activity?.intent)) return "treat";
  if (activity?.intent === "crisis-response" || activity?.priority === "emergency") return "work";
  if (["room-job", "engineering", "repair", "navigation", "combat", "security", "training"].includes(activity?.intent)) return "work";
  return "idle";
}

function createMotionFromTarget(target) {
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
    idleAction: "stand",
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
          next[target.crewId] = {
            ...existing,
            targetAnimState: target.animState,
            animState: existing.waypoints?.length > 0 ? "walk" : target.animState,
            updatedAt: target.updatedAt ?? existing.updatedAt,
          };
          return;
        }
        const finalPoint = { x: target.targetX, y: target.targetY };
        const fromRoomId = existing.targetRoomId ?? existing.currentRoomId ?? target.roomId;
        const waypoints = buildCrewWaypoints(fromRoomId, target.roomId, finalPoint);
        next[target.crewId] = {
          ...existing,
          targetX: target.targetX,
          targetY: target.targetY,
          targetRoomId: target.roomId,
          targetAnimState: target.animState,
          animState: "walk",
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
  tick: (deltaMs = 0) => {
    if (deltaMs <= 0) return;
    const maxStep = WALK_SPEED_PER_SECOND * (deltaMs / 1000);
    set((state) => {
      let changed = false;
      const next = {};
      Object.entries(state.motionByCrewId).forEach(([crewId, motion]) => {
        const waypoint = motion.waypoints?.[motion.waypointIndex ?? 0];
        if (!waypoint) {
          next[crewId] = motion;
          return;
        }
        const stepped = stepToward({ x: motion.x, y: motion.y }, waypoint, maxStep);
        const remainingWaypoints = motion.waypoints ?? [];
        let waypointIndex = motion.waypointIndex ?? 0;
        let waypoints = remainingWaypoints;
        let animState = "walk";
        let currentRoomId = motion.currentRoomId;
        if (stepped.arrived) {
          waypointIndex += 1;
          if (waypointIndex >= remainingWaypoints.length) {
            waypoints = [];
            waypointIndex = 0;
            animState = motion.targetAnimState ?? "idle";
            currentRoomId = motion.targetRoomId;
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
