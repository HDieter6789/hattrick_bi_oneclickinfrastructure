import { expect, test } from "@playwright/test";

// These tests only exercise the unauthenticated redirect path (src/proxy.ts's
// `authorized` callback), which needs no database connection — safe to run
// even without a live Postgres instance. The full wizard/portal/admin flows
// require a seeded database and are covered by tests/e2e/wizard.spec.ts
// (see that file's header comment for prerequisites).

test("unauthenticated visitors are redirected to sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("unauthenticated visitors hitting the portal are redirected to sign-in", async ({ page }) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("the callbackUrl is preserved through the sign-in redirect", async ({ page }) => {
  await page.goto("/admin/customers");
  await expect(page).toHaveURL(/callbackUrl=%2Fadmin%2Fcustomers/);
});

test("sign-in page renders", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("OneClick Fabric Infrastructure")).toBeVisible();
});
