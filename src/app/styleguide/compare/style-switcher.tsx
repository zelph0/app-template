"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StyleCandidate } from "@/styles/candidates";
import { ExampleAppScreen, ExampleSignInScreen } from "./example-screen"; // @auth-module
// @no-auth: import { ExampleAppScreen } from "./example-screen";
import { PreviewSheet } from "./preview-sheet";

/** The app's own style (theme.css + fonts.ts), next to the candidates, as a baseline. */
const CURRENT = "current";

const SCREENS = [
  { id: "app", label: "App screen" },
  { id: "sign-in", label: "Sign-in" }, // @auth-module
  { id: "components", label: "Every component" },
] as const;
type ScreenId = (typeof SCREENS)[number]["id"];

type Props = {
  candidates: StyleCandidate[];
  /** candidate id -> next/font classNames, from src/styles/candidates/fonts.ts. */
  fonts: Record<string, string>;
};

/**
 * One example screen in one style at a time, with a switcher, so you can flip between styles
 * and see the same screen change. Keys: 1–9 pick a style, 0 the current one, ← → step through.
 * The URL hash (#b) remembers the pick across reloads.
 */
export function StyleSwitcher({ candidates, fonts }: Props) {
  const options = [...candidates.map((c) => c.id), CURRENT];
  const [selected, setSelected] = useState(options[0] ?? CURRENT);
  const [screen, setScreen] = useState<ScreenId>("app");

  // Picking a style also records it in the URL hash, so a reload keeps it.
  const pick = useCallback((id: string) => {
    setSelected(id);
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  // The hash is read after hydration so server and client render the same first frame.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (fromHash === CURRENT || candidates.some((c) => c.id === fromHash)) setSelected(fromHash);
  }, [candidates]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const ids = [...candidates.map((c) => c.id), CURRENT];
      let next: string | undefined;
      if (event.key === "0") next = CURRENT;
      else if (/^[1-9]$/.test(event.key)) next = candidates[Number(event.key) - 1]?.id;
      else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const step = event.key === "ArrowRight" ? 1 : -1;
        next = ids[(ids.indexOf(selected) + step + ids.length) % ids.length];
      }
      if (!next) return;
      event.preventDefault();
      pick(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidates, selected, pick]);

  const candidate = candidates.find((c) => c.id === selected);
  const scopeId = candidate ? candidate.id : CURRENT;

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-4 z-30 md:sticky md:top-14 flex flex-col gap-3 border-b-(length:--border-width) border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span id="style-picker-label" className="mr-1 font-medium text-sm">
            Style
          </span>
          <fieldset aria-labelledby="style-picker-label" className="flex flex-wrap gap-2">
            {candidates.map((c, index) => (
              <Button
                key={c.id}
                size="sm"
                variant={selected === c.id ? "default" : "outline"}
                aria-pressed={selected === c.id}
                aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                onClick={() => pick(c.id)}
              >
                {c.id.toUpperCase()}. {c.name}
              </Button>
            ))}
            <Button
              size="sm"
              variant={selected === CURRENT ? "default" : "outline"}
              aria-pressed={selected === CURRENT}
              aria-keyshortcuts="0"
              onClick={() => pick(CURRENT)}
            >
              Current
            </Button>
          </fieldset>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span id="screen-picker-label" className="mr-1 font-medium text-sm">
            Screen
          </span>
          <fieldset aria-labelledby="screen-picker-label" className="flex flex-wrap gap-2">
            {SCREENS.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={screen === s.id ? "secondary" : "ghost"}
                aria-pressed={screen === s.id}
                onClick={() => setScreen(s.id)}
              >
                {s.label}
              </Button>
            ))}
          </fieldset>
          <p className="ml-auto hidden text-muted-foreground text-xs md:block">
            Keys: 1–{Math.min(candidates.length, 9)} pick a style, 0 the current one, ← → step through
          </p>
        </div>
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {candidate
            ? `${candidate.id.toUpperCase()}. ${candidate.name}: ${candidate.summary}`
            : "Current: the app's own style (theme.css and fonts.ts), for comparison."}
        </p>
      </div>

      <div
        key={scopeId}
        data-theme-preview={candidate?.id}
        className={cn(candidate && fonts[candidate.id], "font-sans text-foreground")}
      >
        {screen === "app" && <ExampleAppScreen id={scopeId} />}
        {/* @auth-module:start */}
        {screen === "sign-in" && <ExampleSignInScreen />}
        {/* @auth-module:end */}
        {screen === "components" && (
          <div className="rounded-xl border-ui border-border bg-background p-6">
            <PreviewSheet id={scopeId} />
          </div>
        )}
      </div>
    </div>
  );
}
