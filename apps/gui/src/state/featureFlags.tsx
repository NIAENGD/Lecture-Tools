import { PropsWithChildren, createContext, useContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FeatureFlags = {
  enableGpuControls: boolean;
  enableDebug: boolean;
};

type FeatureFlagStore = {
  flags: FeatureFlags;
  setFlag: <K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]) => void;
};

const defaultFlags: FeatureFlags = {
  enableGpuControls: true,
  enableDebug: false,
};

export const useFeatureFlagsStore = create<FeatureFlagStore>()(
  persist(
    (set) => ({
      flags: defaultFlags,
      setFlag: (key, value) =>
        set((state) => ({
          flags: {
            ...state.flags,
            [key]: value,
          },
        })),
    }),
    {
      name: 'lecture-tools-feature-flags',
    },
  ),
);

const FeatureFlagContext = createContext({ flags: defaultFlags });

export const FeatureFlagProvider = ({ children }: PropsWithChildren) => {
  const flags = useFeatureFlagsStore((state) => state.flags);
  return <FeatureFlagContext.Provider value={{ flags }}>{children}</FeatureFlagContext.Provider>;
};

export const useFeatureFlags = () => useContext(FeatureFlagContext);
