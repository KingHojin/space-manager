import { Activity, Package, Radar, Utensils, Wrench } from "lucide-react";

export const ROOMS = [
  { id: "bridge", label: "브릿지", icon: Radar, left: 38, top: 8, width: 24, height: 18, tone: "border-cyan-300/40 bg-cyan-300/10" },
  { id: "ops", label: "관제실", icon: Radar, left: 12, top: 33, width: 25, height: 22, tone: "border-sky-300/35 bg-sky-300/10" },
  { id: "medbay", label: "의무실", icon: Activity, left: 63, top: 33, width: 25, height: 22, tone: "border-emerald-300/35 bg-emerald-300/10" },
  { id: "living", label: "생활구역", icon: Utensils, left: 12, top: 61, width: 25, height: 24, tone: "border-indigo-300/35 bg-indigo-300/10" },
  { id: "engineering", label: "기관실", icon: Wrench, left: 38, top: 61, width: 24, height: 24, tone: "border-amber-300/35 bg-amber-300/10" },
  { id: "cargo", label: "창고", icon: Package, left: 63, top: 61, width: 25, height: 24, tone: "border-violet-300/35 bg-violet-300/10" },
];

export const ROUTES = [
  ["bridge", "ops"],
  ["bridge", "medbay"],
  ["ops", "living"],
  ["medbay", "cargo"],
  ["living", "engineering"],
  ["engineering", "cargo"],
  ["bridge", "engineering"],
];

export const ROOM_IDS = ROOMS.map((room) => room.id);

export function getRoomDef(roomId) {
  return ROOMS.find((room) => room.id === roomId);
}
