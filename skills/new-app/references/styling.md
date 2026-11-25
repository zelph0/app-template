# Style candidates: formats and how to apply one

Read with `docs/theming.md` in the app (the theme contract). Everything here happens in the app's
folder. A candidate is a full style expressed three ways so several can render on one page:
scoped CSS (tokens and variant previews), fonts, and a list entry.

## Files (src/styles/candidates/)

### `index.ts`: the list

Importable outside Next (`pnpm style:check` reads it), so no imports here.

```ts
export type StyleCandidate = { id: string; name: string; summary: string };

export const candidates: StyleCandidate[] = [
  { id: "a", name: "Soft & friendly", summary: "Warm coral primary, big radius, diffuse shadows, rounded type." },
  { id: "b", name: "Dense & technical", summary: "Tight controls, square corners, mono headings, flat borders." },
  { id: "c", name: "Editorial", summary: "Serif headings, borderless surfaces, underline buttons, ink-black neutrals." },
];
```

Ids are lowercase letters (`a`, `b`, …): they scope the CSS and label the options you show.

### `fonts.ts`: one font set per candidate

`next/font/google` loaders; the variable names are fixed because the app maps them to
`font-sans`, `font-heading` and `font-mono`. Each candidate's classNames go on its preview scope.

```ts
import { DM_Sans, Fraunces } from "next/font/google";

const aSans = DM_Sans({ variable: "--font-family-sans", subsets: ["latin"] });
const aHeading = Fraunces({ variable: "--font-family-heading", subsets: ["latin"], weight: ["600"] });

export const candidateFonts: Record<string, string> = {
  a: [aSans.variable, aHeading.variable].join(" "),
};
```

Omit a family to keep the app's current one (e.g. no mono override). Every loader runs at
module load, so keep it to two or three families per candidate. Restart the preview server after
changing fonts.

### `candidates.css`: tokens and variant previews, scoped

```css
[data-theme-preview="a"] {            /* light tokens */
  --background: oklch(0.985 0.01 60);
  --primary: oklch(0.55 0.17 30);
  --radius: 1rem;
  /* … */
}
.dark [data-theme-preview="a"] {      /* dark tokens: colours (and shadows) */
  --background: oklch(0.2 0.02 40);
  /* … */
}
[data-theme-preview="a"] [data-slot="button"] {   /* variant preview: pill buttons */
  border-radius: 9999px;
}
```

**Tokens.** Set the full colour list in BOTH light and dark blocks, or the app's defaults leak
through and a dark background ends up behind a light-mode primary (axe catches it, but it's
wasted round-trips). The names, all in `src/styles/theme.css`:

- Colour: `--background --foreground --card --card-foreground --popover --popover-foreground
  --primary --primary-foreground --secondary --secondary-foreground --muted --muted-foreground
  --accent --accent-foreground --destructive --success --border --input --ring --chart-1..5
  --sidebar --sidebar-foreground --sidebar-primary --sidebar-primary-foreground --sidebar-accent
  --sidebar-accent-foreground --sidebar-border --sidebar-ring`. Use oklch, like the app.
- Shape `--radius --border-width` · Density `--control-height --control-height-sm
  --control-height-lg --surface-padding --surface-padding-sm` · Depth `--surface-shadow
  --overlay-shadow` · Motion `--motion-duration --motion-ease` · Type `--heading-tracking
  --heading-weight`.

Every `*-foreground` on its pair needs ≥ 4.5:1 contrast; `--muted-foreground` on `--background`
and `--card` is the usual failure, then `--primary` used as link text on `--background`.

**Variant previews.** Things tokens can't express (pill or uppercase buttons, underline inputs,
uppercase badges, flat cards) go in scoped rules on the components' `data-slot`s: `button`,
`badge`, `input`, `textarea`, `checkbox`, `card`, `card-header`, `card-title`, `card-content`,
`card-footer`, `alert`, `dialog-content`, `field-label`, `field-error`, `tabs-list`,
`tabs-trigger`, `select-trigger`, `dropdown-menu-content`. Keep each rule to what you'll be able
to express as a `cva` change later, and use tokens (`var(--radius)`, `var(--border)`), not raw
colours.

## What makes a good set of directions

- 3–4 directions that a person would describe differently, not one style in four colours. Vary
  at least two of: shape (radius, borders), density, depth, type, motion, variant personality.
- Anchor each in the user's vibe and references; the `frontend-design` skill helps you commit to
  a clear point of view per direction instead of averaging them.
- With a user palette: keep its colours in every direction; vary their roles and the neutrals.
- Dark mode is part of the style, not an inversion: pick dark neutrals with the same temperature
  as the light ones, and lighten the primary enough for contrast.

## Applying the chosen candidate

1. **Tokens → `src/styles/theme.css`.** Copy the light block's values into `:root` and the dark
   block's into `.dark`, keeping every existing variable (fill anything the candidate didn't set
   from the current file). Keep the file's comments.
2. **Fonts → `src/config/fonts.ts`.** Replace the loaders but keep the three exports
   (`fontSans`, `fontHeading`, `fontMono`), their CSS variable names, and `fontVariables`.
3. **Variant previews → `cva` edits** in `src/components/ui/*`: e.g. `border-radius: 9999px` on
   `button` becomes `rounded-full` in the base classes of `buttonVariants`; uppercase badges become
   `uppercase tracking-wide` in `badgeVariants`. Use token utilities (`rounded-lg`, `h-control`,
   `border-ui`, `shadow-surface`), never raw values.
4. A **mix** ("A's colours with C's shapes") is a new candidate first: write it, check it, show
   it, then apply it like any other.
5. `pnpm style:reset`, then check `git status`: only `theme.css`, `fonts.ts` and the edited
   `components/ui` files should have changed.
