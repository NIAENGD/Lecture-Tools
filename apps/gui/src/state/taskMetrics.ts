import { create } from 'zustand';

type TaskMetricsState = {
  cpuLoad: number;
  activeTasks: number;
  storageUsage: number;
  setMetrics: (metrics: Partial<Omit<TaskMetricsState, 'setMetrics'>>) => void;
};

export const useTaskMetrics = create<TaskMetricsState>((set) => ({
  cpuLoad: 18,
  activeTasks: 3,
  storageUsage: 62,
  setMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
}));
