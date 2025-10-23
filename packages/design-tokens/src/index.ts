export const colors = {
  brand: {
    primary: {
      gradientStops: ['#EAF4FF', '#EEE4FF', '#FFE8FA'],
      solid: '#C9AFFF',
    },
    success: {
      gradientStops: ['#E8FFF4', '#D4FFFA', '#F0FFE8'],
      solid: '#9CF6CD',
    },
    warning: {
      gradientStops: ['#FFF1E4', '#FFE4EC', '#FFFBE4'],
      solid: '#FFD28C',
    },
    danger: {
      gradientStops: ['#FFE9F0', '#FFC9D2', '#FFEBE0'],
      solid: '#FFA9B5',
    },
    cpuLoad: {
      gradientStops: ['#F0E8FF', '#DDEFFF', '#CFFFF9'],
    },
    slides: {
      gradientStops: ['#E4FFFB', '#D2FAFF', '#EAF5FF'],
    },
    transcripts: {
      gradientStops: ['#E4FFF0', '#E9FFD8', '#FFFDEB'],
    },
  },
  surface: {
    base: '#05060A',
    elevated: '#0F1118',
    subtle: '#161923',
    overlay: '#1F2330',
  },
  foreground: {
    primary: '#F5F7FA',
    secondary: '#C7CBD6',
    muted: '#96A0B5',
    accent: '#C9AFFF',
  },
  focus: '#9CF6CD',
  border: {
    subtle: '#1F2433',
    strong: '#2E364A',
  },
};

export const spacing = {
  grid: 8,
  field: 48,
  fieldDesktop: 40,
  section: 16,
  cardPadding: 24,
};

export const motion = {
  entrance: 150,
  tap: 100,
  crossfade: 250,
};

export const typography = {
  fontStack:
    "'Inter', 'SF Pro Display', 'SF Pro Text', 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif",
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    '2xl': 32,
  },
};

export const radii = {
  xs: '6px',
  sm: '10px',
  md: '16px',
  lg: '24px',
  pill: '999px',
};

export const zIndices = {
  megaRail: 20,
  topBar: 30,
  actionDock: 40,
  cart: 45,
  overlays: 100,
};

export type DesignTokens = {
  colors: typeof colors;
  spacing: typeof spacing;
  motion: typeof motion;
  typography: typeof typography;
  radii: typeof radii;
  zIndices: typeof zIndices;
};

export const tokens: DesignTokens = {
  colors,
  spacing,
  motion,
  typography,
  radii,
  zIndices,
};
