# Modern CSS Standard (2025 Baseline)

Load this memory when writing or reviewing CSS/Tailwind code.

## Quick Rules

| Forbidden | Required |
|-----------|----------|
| Media queries for fluid sizing | `clamp(min, preferred, max)` |
| Media queries for component layout | Container queries `@container` |
| JS for parent-based styling | `:has()` pseudo-class |
| SCSS-only nesting | Native CSS nesting `& selector` |
| Padding hack for aspect ratio | `aspect-ratio: width / height` |
| Physical properties (`margin-left`) | Logical properties (`margin-inline-start`) |
| Hex/RGB/HSL design colors | `oklch()` for perceptual uniformity |
| Preprocessor color functions | `color-mix()` and relative colors |

**Exceptions** (media queries OK): major layout restructuring, `@media print`, `prefers-reduced-motion`, `@supports` guards.

---

## Fluid Typography & Spacing

```css
/* Forbidden: Multiple media queries */
.heading { font-size: 1.5rem; }
@media (min-width: 768px) { .heading { font-size: 2rem; } }

/* Required: Single clamp() */
.heading { font-size: clamp(1.5rem, 1rem + 2vw, 2.5rem); }
```

- Use `rem` for min/max (respects user font preferences)
- Use `vw` or container units for preferred value
- Use `min()` / `max()` for constrained layouts:

```css
.container {
  width: min(100% - 2rem, 1200px);
  padding: max(1rem, 2vw);
}
```

## Container Queries

```css
/* Forbidden: Viewport-based component layout */
.card { display: block; }
@media (min-width: 600px) { .card { display: grid; grid-template-columns: 200px 1fr; } }

/* Required: Container-based */
.card-wrapper { container-type: inline-size; }
.card {
  display: block;
  @container (min-width: 400px) {
    display: grid;
    grid-template-columns: 200px 1fr;
  }
}
```

- `container-type: inline-size` for width queries (most common)
- `container-type: size` only for both dimensions
- Name containers with `container-name` for nested layouts
- Units: `cqw`, `cqh`, `cqi`, `cqb`

## :has() Selector

```css
/* Forbidden: JS classList manipulation for parent styling */

/* Required: CSS :has() */
.card:has(img) { display: grid; grid-template-columns: 200px 1fr; }
.form-group:has(:invalid) { border-color: var(--color-error); }
.form-group:has(:focus-visible) label { color: var(--color-primary); }
.sidebar:has(.widget:nth-child(4)) { grid-template-rows: repeat(2, 1fr); }
```

## Native CSS Nesting

```css
.card {
  padding: 1rem;
  & .title {
    font-size: 1.25rem;
    &:hover { color: var(--color-primary); }
  }
  & .content { margin-block-start: 0.5rem; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
}
```

Note: `&` is required for element selectors: `& p { }` not `p { }`

## Aspect Ratio

```css
/* Forbidden: Padding hack */
.video-container { position: relative; height: 0; padding-top: 56.25%; }

/* Required */
.video-container { aspect-ratio: 16 / 9; }
```

## Logical Properties

```css
/* Forbidden */
.element { margin-left: 1rem; margin-right: 1rem; padding-top: 0.5rem; }

/* Required */
.element { margin-inline: 1rem; padding-block: 0.5rem; border-inline-start: 2px solid; text-align: start; }
```

| Physical | Logical |
|----------|---------|
| `left` / `right` | `inline-start` / `inline-end` |
| `top` / `bottom` | `block-start` / `block-end` |
| `width` / `height` | `inline-size` / `block-size` |
| `margin-left` | `margin-inline-start` |
| `padding-top` | `padding-block-start` |

## Modern Colors (OKLCH)

```css
/* Forbidden: HSL color scales */
:root { --blue-50: hsl(210, 100%, 95%); }

/* Required: OKLCH */
:root {
  --blue-50: oklch(97% 0.02 250);
  --blue-500: oklch(55% 0.18 250);
  --blue-900: oklch(25% 0.08 250);
}
```

Dynamic manipulation with `color-mix()`:
```css
.button {
  background: var(--color-primary);
  &:hover { background: color-mix(in oklch, var(--color-primary) 85%, black); }
  &:disabled { background: color-mix(in oklch, var(--color-primary) 50%, transparent); }
}
```

Relative color syntax:
```css
.overlay { background: oklch(from var(--bg-color) calc(l * 0.8) c h / 0.9); }
```

## Popover API

```html
<button popovertarget="menu">Open Menu</button>
<div id="menu" popover><nav><!-- content --></nav></div>
```

```css
[popover] { &::backdrop { background: oklch(0% 0 0 / 0.5); } }
```

## Tailwind Integration

```html
<!-- Container queries -->
<div class="@container">
  <div class="block @md:grid @md:grid-cols-2">...</div>
</div>

<!-- Logical properties -->
<div class="ms-4 me-2 ps-4 pe-2">...</div>

<!-- Fluid sizing -->
<h1 class="text-[clamp(1.5rem,1rem+2vw,2.5rem)]">...</h1>
```
