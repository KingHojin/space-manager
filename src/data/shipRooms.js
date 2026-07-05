import { Activity, Eye, FlaskConical, Leaf, Package, Radar, Radio, Shield, Utensils, Wrench } from "lucide-react";

export const ROOMS = [
  { id: "bridge", label: "브릿지", icon: Radar, left: 39, top: 6, width: 22, height: 15, tone: "border-cyan-300/45 bg-cyan-300/10" },
  { id: "ops", label: "관제실", icon: Radar, left: 10, top: 30, width: 23, height: 18, tone: "border-sky-300/35 bg-sky-300/10" },
  { id: "medbay", label: "의무실", icon: Activity, left: 67, top: 30, width: 23, height: 18, tone: "border-emerald-300/35 bg-emerald-300/10" },
  { id: "living", label: "생활구역", icon: Utensils, left: 10, top: 63, width: 23, height: 20, tone: "border-indigo-300/35 bg-indigo-300/10" },
  { id: "engineering", label: "기관실", icon: Wrench, left: 39, top: 63, width: 22, height: 20, tone: "border-amber-300/35 bg-amber-300/10" },
  { id: "cargo", label: "창고", icon: Package, left: 67, top: 63, width: 23, height: 20, tone: "border-violet-300/35 bg-violet-300/10" },
];

export const AUX_ZONES = [
  { id: "armory", label: "무기고", icon: Shield, left: 10, top: 51, width: 23, height: 9, tone: "border-red-300/30 bg-red-300/10", decorative: true, tag: "AUX" },
  { id: "lab", label: "연구실", icon: FlaskConical, left: 39, top: 24, width: 22, height: 12, tone: "border-fuchsia-300/30 bg-fuchsia-300/10", decorative: true, tag: "AUX" },
  { id: "observatory", label: "관측돔", icon: Eye, left: 67, top: 51, width: 23, height: 9, tone: "border-blue-300/30 bg-blue-300/10", decorative: true, tag: "AUX" },
  { id: "hydroponics", label: "수경재배실", icon: Leaf, left: 10, top: 85, width: 23, height: 8, tone: "border-lime-300/30 bg-lime-300/10", decorative: true, tag: "LIFE" },
  { id: "comms", label: "통신실", icon: Radio, left: 39, top: 38, width: 22, height: 12, tone: "border-cyan-200/30 bg-cyan-200/10", decorative: true, tag: "AUX" },
  { id: "survey-bay", label: "탐사 베이", icon: Package, left: 67, top: 85, width: 23, height: 8, tone: "border-teal-300/30 bg-teal-300/10", decorative: true, tag: "BAY" },
];

export const DISPLAY_ROOMS = [...ROOMS, ...AUX_ZONES];

export const ROUTES = [
  ["bridge", "ops"],
  ["bridge", "medbay"],
  ["ops", "living"],
  ["medbay", "cargo"],
  ["living", "engineering"],
  ["engineering", "cargo"],
  ["bridge", "engineering"],
];

export const DISPLAY_ROUTES = [
  ...ROUTES,
  ["ops", "armory"],
  ["bridge", "lab"],
  ["bridge", "comms"],
  ["medbay", "observatory"],
  ["living", "hydroponics"],
  ["cargo", "survey-bay"],
];

export const ROOM_IDS = ROOMS.map((room) => room.id);

export function getRoomDef(roomId) {
  return ROOMS.find((room) => room.id === roomId);
}

export function getDisplayRoomDef(roomId) {
  return DISPLAY_ROOMS.find((room) => room.id === roomId);
}
