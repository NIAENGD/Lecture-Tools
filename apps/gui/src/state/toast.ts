import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { useTimelineStore } from './timeline';

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
  actionLabel?: string;
};

type ToastStore = {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'> & { id?: string }) => void;
  removeToast: (id: string) => void;
};

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  pushToast: ({ id = nanoid(), ...toast }) => {
    useTimelineStore.getState().push({ title: toast.title, status: toast.description ?? 'Update' });
    set((state) => ({ toasts: [...state.toasts.filter((t) => t.id !== id), { id, ...toast }] }));
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
