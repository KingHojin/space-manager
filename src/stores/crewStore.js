import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialCrew } from "../data/crew";

export const useCrewStore = create(
  persist(
    (set, get) => ({
      crew: initialCrew,
      recruitCrew: (member) => {
        if (get().crew.some((crewMember) => crewMember.id === member.id)) return false;
        set((state) => ({ crew: [...state.crew, member] }));
        return true;
      },
    }),
    { name: "space-manager-crew" },
  ),
);
