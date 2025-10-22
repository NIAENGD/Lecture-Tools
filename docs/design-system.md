# Lecture Tools Design System

This document captures the core design tokens, component patterns, and utility classes that power the Lecture Tools interface. Use it as a reference when contributing new UI or refining existing layouts.

![Dashboard overview using design tokens](browser:/invocations/qbtgrbfm/artifacts/artifacts/design-system-overview.png)

## Tokens

Design tokens are authored in [`app/web/static/styles/tokens.scss`](../app/web/static/styles/tokens.scss) and emitted as CSS custom properties scoped to the `:root` element. Theme overrides for light, dark, and system-aware modes cascade from the same file.

### Typography

| Token | Value | Notes |
| --- | --- | --- |
| `--font-family-sans` | `Inter`, `system-ui`, ... | Primary sans-serif stack for UI copy. |
| `--font-family-mono` | `JetBrains Mono`, `SFMono-Regular`, ... | Diagnostic/debug output. |
| `--font-size-xs` | `0.75rem` | Microcopy, badges. |
| `--font-size-sm` | `0.875rem` | Form labels, helper text. |
| `--font-size-md` | `0.9375rem` | Body text base (exposed as `--font-size-base`). |
| `--font-size-lg` | `1.125rem` | Secondary headings. |
| `--font-size-xl` | `1.5rem` | Hero headers. |
| `--line-height-tight` | `1.2` | Titles and tabs. |
| `--line-height-base` | `1.5` | Default copy. |
| `--line-height-loose` | `1.7` | Long-form guidance. |
| `--font-weight-regular` | `400` | Paragraphs. |
| `--font-weight-medium` | `500` | Buttons and tabs. |
| `--font-weight-semibold` | `600` | Section titles. |

### Spacing, Radii, and Elevation

| Token | Value | Usage |
| --- | --- | --- |
| `--space-3xs` | `2px` | Hairline dividers. |
| `--space-2xs` | `4px` | Icon padding. |
| `--space-xs` | `8px` | Tight gaps. |
| `--space-sm` | `12px` | Form vertical rhythm. |
| `--space-md` | `16px` | Card padding, grid gutters. |
| `--space-lg` | `24px` | Section padding. |
| `--space-xl` | `32px` | Layout breathing room. |
| `--space-2xl` | `48px` | Hero spacing. |
| `--radius-sm` | `6px` | Inputs. |
| `--radius-md` | `8px` | Cards, panels. |
| `--radius-lg` | `12px` | Dialog windows. |
| `--radius-pill` | `999px` | Chip and pill buttons. |
| `--shadow-elevation-1` | `0 1px 2px rgba(15,23,42,0.08)` | Default panel elevation. |
| `--shadow-elevation-2` | `0 10px 30px rgba(15,23,42,0.12)` | Hover/raised cards. |
| `--shadow-overlay` | `0 20px 45px rgba(15,23,42,0.25)` | Dialog backdrops. |

### Color Palette

Light and dark values map to the same semantic token names. Use semantic tokens instead of hard-coding color ramps.

| Token | Light | Dark |
| --- | --- | --- |
| `--color-surface-background` | `#f5f6f8` | `#0f172a` |
| `--color-surface-panel` | `#ffffff` | `#1e293b` |
| `--color-border-subtle` | `#d2d6dc` | `#334155` |
| `--color-text-primary` | `#1f2933` | `#f8fafc` |
| `--color-text-secondary` | `#475569` | `#94a3b8` |
| `--color-text-placeholder` | `#64748b` | `#94a3b8` |
| `--color-accent` | `#2563eb` | `#38bdf8` |
| `--color-accent-soft` | `#e2e8f0` | `rgba(56,189,248,0.18)` |
| `--color-accent-contrast` | `#ffffff` | `#0f172a` |
| `--color-danger` | `#dc2626` | `#f87171` |
| `--color-danger-soft` | `#fee2e2` | `rgba(248,113,113,0.24)` |
| `--color-status-info-bg` | `#e0f2fe` | `rgba(14,165,233,0.2)` |
| `--color-status-success-bg` | `#dcfce7` | `rgba(74,222,128,0.22)` |
| `--color-status-error-bg` | `#fee2e2` | `rgba(248,113,113,0.24)` |
| `--color-overlay` | `rgba(15,23,42,0.45)` | `rgba(2,6,23,0.7)` |

## Utilities

Utility classes reside in [`app/web/static/styles/utilities.scss`](../app/web/static/styles/utilities.scss).

| Class | Description |
| --- | --- |
| `.u-flex` | Applies `display: flex`. |
| `.u-flex-column` | Flex direction column. |
| `.u-items-center` / `.u-items-start` | Align items shortcuts. |
| `.u-justify-between` | Distributes content with space-between. |
| `.u-gap-{2xs,xs,sm,md,lg}` | Gap spacing derived from tokens. |
| `.u-text-sm`, `.u-text-xs` | Semantic typography scales. |
| `.u-text-muted` | Applies secondary text color. |
| `.u-uppercase`, `.u-fw-medium`, `.u-fw-semibold` | Text transformations and weight utilities. |
| `.u-surface-subtle` | Background fill for subdued surfaces. |

Utilities can stack with component classes to reduce bespoke CSS.

## Components

Component styles live under [`app/web/static/styles/components/`](../app/web/static/styles/components/).

### Buttons (`_buttons.scss`)

Use the `.button` base class with modifier classes for intent.

```html
<button class="button button--primary">Save changes</button>
<button class="button button--secondary">Export archive</button>
<button class="button button--ghost button--pill">Enable edit mode</button>
<button class="button button--danger">Delete lecture</button>
```

### Layout (`_layout.scss`)

Handles the high-level shell (`.layout`, `.sidebar`, `.content`) and status bar presentation. Sticky status notifications use variant attributes:

```html
<div id="status-bar" class="status-bar" data-variant="info">
  <span class="status-message">Synchronising assets…</span>
  <div class="status-progress" role="presentation">
    <div class="status-progress-track">
      <div class="status-progress-fill" style="width: 45%"></div>
    </div>
    <span class="status-progress-text">45%</span>
  </div>
</div>
```

### Panels (`_panels.scss`)

`.panel` establishes shared card styling, with `.content-panel` removing internal padding when a section is composed of nested components like tab bars.

### Tabs (`_tabs.scss`)

`.tabs` wraps grouped navigation buttons.

```html
<div class="top-bar tabs" role="tablist">
  <div class="tabs__group">
    <button class="button button--tab" aria-pressed="true">Details</button>
    <button class="button button--ghost button--pill">Enable edit mode</button>
  </div>
  <div class="tabs__group tabs__group--end">
    <button class="button button--tab">Storage</button>
  </div>
</div>
```

### Dialogs (`_dialogs.scss`)

Dialog primitives (`.dialog`, `.dialog-window`, `.dialog-actions`, `.dialog-button`) apply consistent elevation, spacing, and type ramp across confirmation modals, slide selection windows, and upload workflows.

### Syllabus Lists (`_syllabus.scss`)

Curriculum navigation and syllabus rollups use `.curriculum`, `.curriculum-toolbar`, and `.syllabus` scaffolding for scrollable lists, management toolbars, and nested module sections.

## Template Conventions

- Templates extend [`partials/base.html`](../app/web/templates/partials/base.html), which injects the compiled CSS bundle.
- Shared components are composed via partials (e.g., [`top_bar.html`](../app/web/templates/partials/top_bar.html), [`sidebar.html`](../app/web/templates/partials/sidebar.html)).
- Inline styles are replaced with utility classes such as `.u-flex` and `.u-justify-between` to keep layout concerns within stylesheets.
- When authoring new templates, prefer component classes and utilities before introducing bespoke CSS.

## Working With Themes

The `body[data-theme]` attribute toggles between `light`, `dark`, and `system`. Custom tokens may be overridden inside the `[data-theme]` blocks inside `tokens.scss`. Always update the token file if you introduce a new semantic color so both themes stay aligned.

## Implementation Checklist

1. Add or adjust tokens in `tokens.scss`; include light and dark values.
2. Build component styles under `styles/components/` and expose them via `@use` in `main.scss`.
3. Update templates to reference component classes/utilities instead of inline styles.
4. Document additions here, providing code snippets and (when possible) updated screenshots.

Following this workflow keeps future redesigns confined to the design system layer without rewriting template markup or JavaScript behaviour.
