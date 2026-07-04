import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialCrew } from "../data/crew";

export const useCrewStore = create(
  persist(
    () => ({
      crew: initialCrew,
    }),
    { name: "space-manager-crew" },
  ),
);
