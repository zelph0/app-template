import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps border-ui next to a border colour, since it sets the width", () => {
    expect(cn("border-ui border-input")).toBe("border-ui border-input");
  });

  it("keeps ring-ui next to a ring colour, since it sets the width", () => {
    expect(cn("ring-ui ring-foreground/10")).toBe("ring-ui ring-foreground/10");
  });

  it("lets a later border width override border-ui", () => {
    expect(cn("border-ui", "border-2")).toBe("border-2");
  });
});
