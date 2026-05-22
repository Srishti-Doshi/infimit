# Infimit — Design Tokens

The complete token spec for the Infimit frontend. Every visible value in the UI flows through one of these tokens — there are **no raw hex colors, font sizes, or spacings** in component code.

> Tokens are defined as CSS variables (raw `R G B` triples) in [`src/styles/tailwind.css`](../src/styles/tailwind.css) and wired through Tailwind utilities in [`tailwind.config.ts`](../tailwind.config.ts). Dark mode in Phase 2 = redefining these same variables under a `[data-theme="dark"]` selector. No component code changes required.

---

## Colors

### Brand red

Used for primary CTAs, accent links, status emphasis, and the masthead tagline.

| Token           | Value         | Tailwind class                                               | Where used                                                                  |
| --------------- | ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `brand-red-50`  | `#FEF2F2`     | `bg-brand-red-50`                                            | Ghost-button hover background                                               |
| `brand-red-100` | `#FEE2E2`     | `bg-brand-red-100`                                           | Ghost-button active background                                              |
| `brand-red-500` | **`#DC2626`** | `bg-brand-red-500` `text-brand-red-500` `ring-brand-red-500` | Primary buttons, CTAs, accent links, masthead tagline, breaking-news ticker |
| `brand-red-600` | `#B91C1C`     | `bg-brand-red-600`                                           | Primary button hover, gradient end-stop                                     |
| `brand-red-700` | `#991B1B`     | `bg-brand-red-700`                                           | Pressed state, ticker label background                                      |

### Ink (text)

Semantic hierarchy for text. Always prefer these over `text-gray-XXX`.

| Token           | Value     | Tailwind class       | Where used                                  |
| --------------- | --------- | -------------------- | ------------------------------------------- |
| `ink-primary`   | `#0F0F10` | `text-ink-primary`   | Headings, body emphasis, dark buttons       |
| `ink-secondary` | `#4B5563` | `text-ink-secondary` | Body text, descriptions                     |
| `ink-tertiary`  | `#9CA3AF` | `text-ink-tertiary`  | Placeholders, dividers, captions            |
| `ink-inverse`   | `#FFFFFF` | `text-ink-inverse`   | Text on dark surfaces (button labels, etc.) |

### Surface (backgrounds)

| Token               | Value     | Tailwind class         | Where used                              |
| ------------------- | --------- | ---------------------- | --------------------------------------- |
| `surface` (DEFAULT) | `#FFFFFF` | `bg-surface`           | Page background, content cards          |
| `surface-subtle`    | `#F9FAFB` | `bg-surface-subtle`    | Alternate row background, soft sections |
| `surface-rose-tint` | `#FFF1F2` | `bg-surface-rose-tint` | Soft auth surfaces (OTP modal in Figma) |
| `surface-blue-tint` | `#EFF6FF` | `bg-surface-blue-tint` | Stat cards on admin dashboards          |
| `surface-inverse`   | `#0F0F10` | `bg-surface-inverse`   | Welcome splash, dark modals             |

### Line (borders / dividers)

| Token            | Value     | Tailwind class            | Where used                                     |
| ---------------- | --------- | ------------------------- | ---------------------------------------------- |
| `line` (DEFAULT) | `#E5E7EB` | `border-line` `ring-line` | Card borders, input borders, hairline dividers |
| `line-strong`    | `#D1D5DB` | `border-line-strong`      | Stronger borders on hover                      |

### Status

Semantic color-coded states. Each status has a paired `*-bg` and `*-text` token so the pill always meets WCAG contrast.

| Status    | `bg`      | `text`    | Used for                                    |
| --------- | --------- | --------- | ------------------------------------------- |
| `success` | `#D1FAE5` | `#065F46` | Approved / Accepted pills                   |
| `warning` | `#FEF3C7` | `#92400E` | Pending pills                               |
| `error`   | `#FEE2E2` | `#991B1B` | Rejected pills, error toasts                |
| `info`    | `#DBEAFE` | `#1E40AF` | Informational pills, "Coming in Subphase X" |

Use via `<StatusPill tone="success">Approved</StatusPill>` — never paste status hex values directly.

---

## Typography

### Families

| Token          | Family                                  | Where used                                    |
| -------------- | --------------------------------------- | --------------------------------------------- |
| `font-display` | **Fraunces** (variable, optical sizing) | Wordmark, headlines (`h1`–`h6`), big numerals |
| `font-sans`    | **Inter** (variable, OpenType features) | Everything else — UI labels, buttons, body    |

Both fonts are self-hosted via `@fontsource-variable/fraunces` and `@fontsource-variable/inter`. One file per family loads the full weight axis (no per-weight HTTP requests).

### Size scale

**Body sizes** — fixed (never fluid). Body text fluidity hurts readability.

| Token       | Size  | Line-height | Where used                    |
| ----------- | ----- | ----------- | ----------------------------- |
| `body-xs`   | 12 px | 16 px       | Labels, captions, small print |
| `body-sm`   | 14 px | 20 px       | Inputs, dense UI, helper text |
| `body-base` | 16 px | 24 px       | Default body text             |
| `body-lg`   | 18 px | 28 px       | Lead paragraphs, intro text   |
| `body-xl`   | 20 px | 28 px       | Small section headings        |

**Display sizes** — fluid via `clamp()` between mobile and ultrawide.

| Token         | Mobile → ultrawide | Tracking  | Where used                    |
| ------------- | ------------------ | --------- | ----------------------------- |
| `display-sm`  | 24 px → 32 px      | -0.01 em  | Sub-section headings          |
| `display-md`  | 30 px → 40 px      | -0.015 em | Page subtitles, modal titles  |
| `display-lg`  | 36 px → 56 px      | -0.02 em  | Article titles, page headings |
| `display-xl`  | 44 px → 72 px      | -0.025 em | Hero headlines                |
| `display-2xl` | 56 px → 96 px      | -0.03 em  | Splash wordmarks, 404 numeral |

---

## Spacing

Tailwind's default spacing scale, used religiously. No ad-hoc paddings.

| Token | Value | Common usage                      |
| ----- | ----- | --------------------------------- |
| `1`   | 4 px  | Icon-to-text inline gap           |
| `2`   | 8 px  | Tight grouping                    |
| `3`   | 12 px | Component internal spacing        |
| `4`   | 16 px | Default card padding (mobile)     |
| `6`   | 24 px | Section spacing within cards      |
| `8`   | 32 px | Card-to-card spacing              |
| `12`  | 48 px | Section spacing within pages      |
| `16`  | 64 px | Major page section separators     |
| `24`  | 96 px | Page top/bottom padding (desktop) |

---

## Border radius

Subtle and consistent — pills reserved for status indicators and ceremonial moments (Welcome splash, OTP confirm).

| Token          | Value   | Where used                              |
| -------------- | ------- | --------------------------------------- |
| `rounded-sm`   | 4 px    | Small buttons, badges                   |
| `rounded`      | 6 px    | Default — small primitives              |
| `rounded-md`   | 8 px    | Medium/large buttons, inputs            |
| `rounded-lg`   | 12 px   | Cards, modals                           |
| `rounded-xl`   | 16 px   | Hero cards, prominent surfaces          |
| `rounded-2xl`  | 24 px   | Brand-led visual moments                |
| `rounded-full` | 9999 px | Status pills, avatar, "Get Started" CTA |

---

## Elevation (shadows)

Reserved for floating elements. Default UI uses borders, not shadows.

| Token           | Where used                                |
| --------------- | ----------------------------------------- |
| `shadow-elev-1` | Subtle lift — buttons, hovered cards      |
| `shadow-elev-2` | Floating UI — toasts, dropdowns, tooltips |
| `shadow-elev-3` | Modals, drawers                           |

---

## Breakpoints

Standard Tailwind breakpoints + one custom for ultrawide.

| Token | Min width | Common usage                           |
| ----- | --------- | -------------------------------------- |
| `sm`  | 640 px    | Phone landscape, small tablet portrait |
| `md`  | 768 px    | Tablet portrait                        |
| `lg`  | 1024 px   | Tablet landscape, small desktop        |
| `xl`  | 1280 px   | Desktop                                |
| `2xl` | 1536 px   | Large desktop                          |
| `3xl` | 1920 px   | Ultrawide                              |
| `4xl` | 2560 px   | 4K monitors                            |

---

## Container widths

| Token                   | Max width | Used for                                  |
| ----------------------- | --------- | ----------------------------------------- |
| `max-w-content-narrow`  | 576 px    | Prose, auth modals, focused reading       |
| `max-w-content-default` | 1152 px   | Most page content                         |
| `max-w-content-wide`    | 1408 px   | Hero sections, full-width article layouts |

Use via the `<Container width="narrow|default|wide">` primitive — never raw `max-w-*` classes in page code.

---

## Motion

| Token                         | Value                           | Used for                  |
| ----------------------------- | ------------------------------- | ------------------------- |
| `transition duration default` | 150 ms                          | Hover/focus state changes |
| `ease-soft-out`               | `cubic-bezier(0.16, 1, 0.3, 1)` | Polished entrances/exits  |
| `animate-ticker`              | 50 s linear infinite            | Breaking-news scroll      |

All animations are **disabled when the user's OS reports `prefers-reduced-motion: reduce`** (CSS in `tailwind.css` `@layer base`). This is intentional and required for WCAG 2.3.3 — don't override.

---

## Focus rings

```css
:focus-visible {
  outline: 2px solid rgb(var(--brand-red-500));
  outline-offset: 2px;
  border-radius: 2px;
}
```

Applied globally. **Never** use `outline: none` without a replacement. Components that need a custom focus state should compose `focus-visible:outline-2 focus-visible:outline-brand-red-500 focus-visible:outline-offset-2`.

---

## Iconography

- **Library**: `lucide-react`, imported per-icon (`import { Search } from 'lucide-react'`).
- **Default size**: `h-4 w-4` (16 px) for inline icons, `h-5 w-5` (20 px) for header chrome, `h-6 w-6` (24 px) for prominent triggers.
- **Stroke**: default Lucide stroke (1.5 px) at default sizes; bump to `[strokeWidth:2]` for small icons on red backgrounds where the default reads thin.

---

## Conventions

1. **Never raw hex** outside `tailwind.css` and `tailwind.config.ts`. If a component needs a one-off color, add a token first.
2. **Compose, don't override**. If a Button needs a different background per page, that's a missing variant — add it to `variants.variant`, don't override at the call site.
3. **Mobile-first**. Every utility is mobile by default; `sm:`, `md:`, `lg:` extend upward.
4. **Tokens for everything semantic** (color, type, spacing, radius). Use raw Tailwind utilities only for one-shot geometry (`absolute inset-0`, `flex-1`, etc.).
5. **Dark mode is a future variable-swap** — every component reads through CSS variables, so the dark-mode PR will be additive.

---

## How to add a new token

1. Add the CSS variable to `:root` in [`src/styles/tailwind.css`](../src/styles/tailwind.css) as a raw `R G B` triple.
2. Expose it through Tailwind in [`tailwind.config.ts`](../tailwind.config.ts) under `theme.extend.colors` (or appropriate section).
3. Document it here — name, value, semantic intent, where it's used.
4. Update the dark-mode variable redefinition (when Phase 2 lands).

Keep the surface small. Adding tokens is cheap; removing them is hard.
