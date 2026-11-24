import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";

for (const [path, heading] of [
  ["/", undefined],
  ["/tasks", "Tasks"],
  ["/styleguide", "Styleguide"],
] as const) {
  test(`${path} has no serious accessibility violations (light and dark)`, async ({ page }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      if (heading) await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectNoSeriousA11yViolations(page);
    }
  });
}
