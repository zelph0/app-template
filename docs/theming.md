# Theming

Every app gets its own visual style without forking components. A style is **tokens + variants**:
tokens set colour, shape, density, depth, motion and type. Variants set what components look like
beyond what tokens can express.

## What `/new-app` changes to restyle an app

1. **`src/styles/theme.css`**: rewrite the token values in `:root` (light) and `.dark`. Keep every
   variable name; components depend on them.
2. **`src/config/fonts.ts`**: pick fonts via `next/font/google` (or `next/font/local`). Keep the three
   exports and their CSS variable names (`--font-family-sans`, `--font-family-heading`, `--font-family-mono`).
3. **Component variants** in `src/components/ui/*` (optional, for personality): edit the `cva`
   variant strings, e.g. pill buttons, uppercase labels, underline inputs, solid vs. ghost defaults. Use
   tokens inside variants (`rounded-lg`, `h-control`, `border-ui`, `shadow-surface`), not raw values.
4. Verify on **`/styleguide`** in light and dark, then run `pnpm test:e2e` (axe checks contrast there).

Nothing else should need to change. If a style needs a new token, add it to `theme.css`, map it
in `src/app/globals.css` (`@theme inline`) and show it on `/styleguide`.

## Tokens

| Group | Variables | Notes |
|---|---|---|
| Colour | `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--success`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--sidebar-*` | oklch. Each `*-foreground` pair must reach ≥ 4.5:1 contrast |
| Shape | `--radius` (scales `rounded-sm…4xl`), `--border-width` | `border-width: 0` gives a borderless, flat style |
| Density | `--control-height(-sm/-lg)`, `--surface-padding(-sm)` | buttons/inputs use `h-control`; cards use surface padding |
| Depth | `--surface-shadow`, `--overlay-shadow` | cards vs. menus/dialogs |
| Motion | `--motion-duration`, `--motion-ease` | default for every `transition-*`; `prefers-reduced-motion` is honoured globally |
| Type | `--heading-tracking`, `--heading-weight` + fonts | headings use `font-heading` |

How tokens reach components (`src/app/globals.css`):

- `--spacing-control` makes `h-control`, `size-control`.
- `--shadow-surface` makes `shadow-surface`.
- `border-ui` and `ring-ui` are utilities that read `--border-width`.
- `--default-transition-*` makes every `transition` use the motion tokens.

## Rules for components

- No hard-coded colours (`bg-zinc-100`, `#fff`, `text-black`), radii in px, shadows or control heights
  in features. Use semantic classes (`bg-muted`, `text-muted-foreground`, `rounded-lg`, `h-control`).
- New UI primitives go in `src/components/ui/` and read tokens the same way. Add them to `/styleguide`.
- Feature components compose `components/ui`; they don't restyle primitives with long class overrides.
  If many call sites need the same override, it's a new variant.

## Example: three styles from the same tokens

| Vibe | Changes |
|---|---|
| Soft & friendly | `--radius: 1rem`, warm `--primary`, `--surface-shadow` larger and diffuse, rounded font, `--motion-duration: 220ms` |
| Dense & technical | `--radius: 0.25rem`, `--control-height: 2rem`, `--surface-padding: 0.875rem`, mono headings, `--surface-shadow: none`, `--border-width: 1px` |
| Editorial | serif heading font, `--heading-tracking: -0.03em`, `--border-width: 0`, buttons variant → underline links, high-contrast neutrals |
