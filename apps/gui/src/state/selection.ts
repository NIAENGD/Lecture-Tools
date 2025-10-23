import { create } from 'zustand';

type SelectionMap = Record<string, string[]>;

type SelectionStore = {
  selections: SelectionMap;
  toggle: (scope: string, id: string) => void;
  clear: () => void;
};

export const useSelectionStore = create<SelectionStore>((set) => ({
  selections: {},
  toggle: (scope, id) =>
    set((state) => {
      const current = new Set(state.selections[scope] ?? []);
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      return {
        selections: {
          ...state.selections,
          [scope]: Array.from(current.values()),
        },
      };
    }),
  clear: () => set({ selections: {} }),
}));
