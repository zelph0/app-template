import "@/styles/candidates/candidates.css";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { candidates } from "@/styles/candidates";
import { candidateFonts } from "@/styles/candidates/fonts";
import { StyleSwitcher } from "./style-switcher";

export const metadata: Metadata = { title: "Compare styles", robots: { index: false } };

/**
 * Style candidates, one at a time on an example screen, with a switcher. Each renders inside
 * [data-theme-preview="<id>"], so it never touches the real theme. Dev only: 404 unless
 * STYLE_PREVIEW=1. /styleguide/compare/side-by-side shows them all at once (and is what
 * `pnpm style:check` tests). The /new-app styling step writes the candidates
 * (src/styles/candidates/) and `pnpm style:reset` removes them. See docs/theming.md.
 */
export default function CompareStylesPage() {
  if (process.env.STYLE_PREVIEW !== "1") notFound();

  return (
    <main id="main" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-balance text-3xl">Compare styles</h1>
        <p className="text-muted-foreground">
          {candidates.length === 0
            ? "No candidates yet, so only the app's current style is shown. The /new-app styling step writes them to src/styles/candidates/."
            : "Pick a style to see the same screen change. Use the theme switch in the header for light and dark."}
        </p>
        <Link href="/styleguide/compare/side-by-side" className="text-sm underline underline-offset-4">
          See all styles side by side
        </Link>
      </header>
      <StyleSwitcher candidates={candidates} fonts={candidateFonts} />
    </main>
  );
}
