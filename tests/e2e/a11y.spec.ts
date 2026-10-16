import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

async function check(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = res.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(bad.map((v) => `${path} ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const PUBLIC = ["/login", "/register", "/forgot", "/accessibility"];
const BY_ROLE: Record<string, string[]> = {
  "student1@demo.test": ["/student", "/student/report", "/student/report?absence=1", "/student/reports", "/student/profile", "/places", "/certificate/ME"],
  "coord1@demo.test": ["/coordinator", "/reports", "/students", "/analytics", "/analytics/students", "/places"],
  "interviewer@demo.test": ["/interviewer", "/students"],
  "manager@demo.test": ["/manager", "/manager/users", "/manager/settings", "/manager/custom-fields", "/analytics", "/analytics/milestones", "/reports", "/places"],
};

for (const p of PUBLIC) test(`נגישות ללא התחברות: ${p}`, async ({ page }) => { await check(page, p); });

for (const [email, paths] of Object.entries(BY_ROLE)) {
  test(`נגישות ${email}`, async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, email);
    for (const path of paths) {
      if (path.endsWith("/ME")) { await page.goto("/student"); await page.getByRole("link", { name: "תעודת שעות" }).click(); await page.waitForLoadState("networkidle"); const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze(); expect(r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id)).toEqual([]); continue; }
      await check(page, path);
    }
  });
}

test("נגישות במסך הראיון והכרטיס", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await login(page, "manager@demo.test");
  await page.goto("/students");
  await page.getByRole("link", { name: /שירה/ }).click();
  await check(page, page.url().replace("http://localhost:3100", ""));
});

test("אנגלית: הכניסה LTR ונגישה", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /English/ }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id)).toEqual([]);
});
