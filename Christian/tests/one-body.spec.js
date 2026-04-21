import { expect, test } from "@playwright/test";

const testPost = `Testing grace and truth ${Date.now()}`;

const openCleanApp = async (page) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
};

test("onboarding renders first and reveals next after two seconds", async ({ page }) => {
  await openCleanApp(page);

  await expect(page.getByRole("heading", { name: /walk in truth/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 4000 });
});

test("next opens the home composer", async ({ page }) => {
  await openCleanApp(page);

  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByPlaceholder("What’s on your heart?")).toBeVisible();
});

test("posting creates an item and persists after refresh", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await page.getByPlaceholder("What’s on your heart?").fill(testPost);
  await page.getByRole("button", { name: "Post" }).click();

  await expect(page.getByText(testPost)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await expect(page.getByText(testPost)).toBeVisible();
});

test("hamburger opens the section drawer with soon labels", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await page.getByRole("button", { name: "Open sections" }).click();

  await expect(page.getByRole("complementary", { name: "App sections" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Prayer Wall Soon/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Discussions Soon/i })).toBeDisabled();
});

test("mobile and laptop layouts avoid horizontal overflow", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  const hasHorizontalOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });

  expect(hasHorizontalOverflow).toBe(false);
});
