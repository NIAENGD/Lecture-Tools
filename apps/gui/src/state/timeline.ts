import { create } from 'zustand';
import { nanoid } from 'nanoid';

type TimelineEvent = {
  id: string;
  title: string;
  status: string;
  timestamp: number;
};

type TimelineStore = {
  events: TimelineEvent[];
  push: (event: Omit<TimelineEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) => void;
};

export const useTimelineStore = create<TimelineStore>((set) => ({
  events: [
    { id: nanoid(), title: 'Nightly Transcribe', status: 'Completed', timestamp: Date.now() - 1000 * 60 * 5 },
    { id: nanoid(), title: 'Slides Sync', status: 'Running', timestamp: Date.now() - 1000 * 60 * 2 },
  ],
  push: ({ id = nanoid(), timestamp = Date.now(), ...event }) =>
    set((state) => ({ events: [{ id, timestamp, ...event }, ...state.events].slice(0, 25) })),
}));
