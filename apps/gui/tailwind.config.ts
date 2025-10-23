import type { Config } from 'tailwindcss';
import { colors, spacing, typography, motion, radii } from '../../packages/design-tokens/src/index';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  content: ['index.html', 'src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: `${spacing.grid}px`,
      screens: {
        xl: '1280px',
      },
    },
    extend: {
      fontFamily: {
        sans: typography.fontStack.split(',').map((token) => token.trim()),
      },
      colors: {
        surface: {
          base: colors.surface.base,
          elevated: colors.surface.elevated,
          subtle: colors.surface.subtle,
          overlay: colors.surface.overlay,
        },
        foreground: {
          DEFAULT: colors.foreground.primary,
          secondary: colors.foreground.secondary,
          muted: colors.foreground.muted,
          accent: colors.foreground.accent,
        },
        border: {
          subtle: colors.border.subtle,
          strong: colors.border.strong,
        },
        focus: colors.focus,
        brand: {
          primary: colors.brand.primary.solid,
          success: colors.brand.success.solid,
          warning: colors.brand.warning.solid,
          danger: colors.brand.danger.solid,
        },
      },
      spacing: {
        grid: `${spacing.grid}px`,
        field: `${spacing.field}px`,
        fieldDesktop: `${spacing.fieldDesktop}px`,
        section: `${spacing.section}px`,
        cardPadding: `${spacing.cardPadding}px`,
      },
      transitionDuration: {
        entrance: `${motion.entrance}ms`,
        tap: `${motion.tap}ms`,
        crossfade: `${motion.crossfade}ms`,
      },
      borderRadius: {
        xs: radii.xs,
        sm: radii.sm,
        md: radii.md,
        lg: radii.lg,
        pill: radii.pill,
      },
      boxShadow: {
        panel: '0 24px 48px rgba(5, 6, 10, 0.45)',
        focus: `0 0 0 3px ${colors.focus}33`,
      },
      backdropBlur: {
        panel: '18px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
