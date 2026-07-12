import { expect, test } from "@playwright/test";

const testPost = `Testing grace and truth ${Date.now()}`;

const openCleanApp = async (page) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
};

const mockDate = async (page, isoDate) => {
  await page.addInitScript(({ isoDate: fixedDate }) => {
    const RealDate = Date;
    const fixedTime = new RealDate(fixedDate).valueOf();

    function MockDate(...args) {
      return args.length === 0 ? new RealDate(fixedTime) : new RealDate(...args);
    }

    MockDate.now = () => fixedTime;
    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    MockDate.prototype = RealDate.prototype;

    window.Date = MockDate;
    globalThis.Date = MockDate;
  }, { isoDate });
};

const mockMutableDate = async (page, isoDate) => {
  await page.addInitScript(({ isoDate: initialDate }) => {
    const RealDate = Date;
    let currentTime = new RealDate(initialDate).valueOf();

    function MockDate(...args) {
      return args.length === 0 ? new RealDate(currentTime) : new RealDate(...args);
    }

    MockDate.now = () => currentTime;
    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    MockDate.prototype = RealDate.prototype;

    window.Date = MockDate;
    globalThis.Date = MockDate;
    window.__advanceMockDate = (milliseconds) => {
      currentTime += milliseconds;
    };
  }, { isoDate });
};

test("onboarding renders first and reveals next after two seconds", async ({ page }) => {
  await openCleanApp(page);

  await expect(page.getByRole("heading", { name: /stand in christ/i })).toBeVisible();
  await expect(page.getByText("Walk in truth, speak with love.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 4000 });
});

test("next opens the home composer", async ({ page }) => {
  await openCleanApp(page);

  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByLabel("Stand in Christ", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("What’s on your heart?")).toBeVisible();
});

test("prototype includes test community activity across posting areas", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await expect(page.getByText("What is one belief you changed your mind about")).toBeVisible();
  await expect(page.getByText("Mara Ellis")).toBeVisible();
  await page.getByRole("button", { name: "Open Mara Ellis profile" }).click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mara Ellis" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit profile" })).toHaveCount(0);
  await expect(page.locator(".profile-tab-panel")).toContainText(
    "What is one belief you changed your mind about",
  );
  await page.getByRole("button", { name: "Back to Home" }).click();
  await expect(page.getByText("What is one belief you changed your mind about")).toBeVisible();

  await openSection(page, "Prayer Wall");
  await expect(page.getByText("Pray for this community to grow")).toBeVisible();
  await expect(page.locator(".prayer-note").filter({ hasText: "Pray for this community" })).toContainText(
    "12 prayed so far",
  );

  await openSection(page, "Discussions");
  await page.getByRole("button", { name: /How should Christians disagree/i }).click();
  await expect(page.getByText("Mara")).toBeVisible();
  await expect(page.getByText("Jonah")).toBeVisible();
  await page.getByRole("button", { name: "Open Mara Ellis profile" }).click();
  await expect(page.getByRole("heading", { name: "Discussions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mara Ellis" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Discussions" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Discussions" }).click();
  await expect(page.getByRole("heading", { name: "Truth-seeking, without the heat." })).toBeVisible();

  await openSection(page, "Houses");
  await page.getByRole("button", { name: "Join Orthodox" }).click();
  await expect(page.getByPlaceholder("Share with the Orthodox house...")).toBeVisible({
    timeout: 3000,
  });
  await expect(page.getByLabel("Orthodox house feed")).toContainText("Mara Ellis");
  await expect(page.getByLabel("Orthodox house feed")).toContainText("Welcome to the Orthodox house");
});

test("posting creates an item and persists after refresh", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await page.getByPlaceholder("What’s on your heart?").fill(testPost);
  await page.getByRole("button", { name: "Post", exact: true }).click();

  await expect(page.getByText(testPost)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await expect(page.getByText(testPost)).toBeVisible();
});

test("post actions menu edits and deletes a post", async ({ page }) => {
  const deletablePost = `Delete this post ${Date.now()}`;
  const editedPost = `Edited post ${Date.now()}`;

  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await page.getByPlaceholder("What’s on your heart?").fill(deletablePost);
  await page.getByRole("button", { name: "Post", exact: true }).click();

  const post = page.locator(".post-item").filter({ hasText: deletablePost });
  await post.getByRole("button", { name: "Post options" }).click();
  await page.getByRole("menuitem", { name: "Edit post" }).click();
  await page.getByLabel("Edit post text").fill(editedPost);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(deletablePost)).not.toBeVisible();
  await expect(page.getByText(editedPost)).toBeVisible();

  await page
    .locator(".post-item")
    .filter({ hasText: editedPost })
    .getByRole("button", { name: "Post options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete post" }).click();

  await expect(page.getByText(editedPost)).not.toBeVisible();
});

test("post detail opens comments and persists a comment", async ({ page }) => {
  const postWithComment = `Clickable post ${Date.now()}`;
  const testComment = `A gracious comment ${Date.now()}`;
  const editedComment = `Edited gracious comment ${Date.now()}`;

  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await page.getByPlaceholder("What’s on your heart?").fill(postWithComment);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.locator(".post-item").filter({ hasText: postWithComment }).click();

  await expect(page.getByRole("heading", { name: postWithComment })).toBeVisible();
  await expect(page.getByPlaceholder("Write a gracious comment...")).toBeVisible();

  await page.getByPlaceholder("Write a gracious comment...").fill(testComment);
  await page.getByRole("button", { name: "Comment" }).click();

  await expect(page.getByText(testComment)).toBeVisible();
  await expect(page.getByText("1 comment")).toBeVisible();

  await page
    .locator(".comment-item")
    .filter({ hasText: testComment })
    .getByRole("button", { name: "Reply options" })
    .click();
  await page.getByRole("menuitem", { name: "Edit reply" }).click();
  await page.getByLabel("Edit reply text").fill(editedComment);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(testComment)).not.toBeVisible();
  await expect(page.getByText(editedComment)).toBeVisible();

  await page
    .locator(".comment-item")
    .filter({ hasText: editedComment })
    .getByRole("button", { name: "Reply options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete reply" }).click();
  await expect(page.getByText(editedComment)).not.toBeVisible();
  await expect(page.getByText("0 comments")).toBeVisible();

  await page.getByPlaceholder("Write a gracious comment...").fill(testComment);
  await page.getByRole("button", { name: "Comment" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await page.locator(".post-item").filter({ hasText: postWithComment }).click();

  await expect(page.getByText(testComment)).toBeVisible();
});

const openSection = async (page, sectionName) => {
  await page.getByRole("button", { name: "Open sections" }).click();
  await page
    .getByRole("navigation", { name: "Stand in Christ sections" })
    .getByRole("button", { name: sectionName, exact: true })
    .click();
};

test("hamburger opens the section drawer and navigates between sections", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await page.getByRole("button", { name: "Open sections" }).click();

  await expect(page.getByRole("complementary", { name: "App sections" })).toBeVisible();
  await page.getByRole("button", { name: "Prayer Wall" }).click();

  await expect(page.getByRole("heading", { name: "Prayer Wall" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /carry one another gently/i })).toBeVisible();
});

test("section drawer scrolls independently when hovered", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await page.getByRole("button", { name: "Open sections" }).click();

  const drawer = page.locator(".side-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveCSS("overscroll-behavior-y", "contain");

  const canScroll = await drawer.evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(canScroll).toBe(true);

  await drawer.hover();
  await page.mouse.wheel(0, 500);

  await expect
    .poll(() => drawer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test("discussion glow appears only on hover", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Discussions");

  const firstTopic = page.locator(".topic-row").nth(0);
  const secondTopic = page.locator(".topic-row").nth(1);

  await expect(firstTopic).toBeVisible();
  await expect(secondTopic).toBeVisible();
  await expect(firstTopic).toHaveCSS("box-shadow", "none");

  await secondTopic.hover();
  await page.waitForTimeout(220);

  await expect(firstTopic).toHaveCSS("box-shadow", "none");
  await expect(secondTopic).not.toHaveCSS("box-shadow", "none");
});

test("discussion topic opens a chat room and sends a message", async ({ page }) => {
  const testMessage = `A gentle test reply ${Date.now()}`;
  const keyboardMessageFirstLine = `Keyboard reply ${Date.now()}`;
  const keyboardMessageSecondLine = "with a second line";
  const editedKeyboardMessage = `Edited discussion reply ${Date.now()}`;

  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Discussions");

  await page.getByRole("button", { name: /How should Christians disagree/i }).click();

  await expect(
    page.getByRole("heading", { name: "How should Christians disagree with love?" }),
  ).toBeVisible();
  await expect(page.getByText(/Based on: Ephesians 4:2/i)).toBeVisible();
  await expect(page.getByLabel(/How should Christians disagree with love\? chat/i)).toBeVisible();

  await page.getByPlaceholder("Share a thoughtful reply...").fill(testMessage);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(testMessage)).toBeVisible();

  const replyBox = page.getByPlaceholder("Share a thoughtful reply...");
  await replyBox.fill(keyboardMessageFirstLine);
  await replyBox.press("Shift+Enter");
  await replyBox.pressSequentially(keyboardMessageSecondLine);
  await expect(replyBox).toHaveValue(`${keyboardMessageFirstLine}\n${keyboardMessageSecondLine}`);

  await replyBox.press("Enter");
  await expect(
    page
      .locator(".chat-message")
      .filter({ hasText: keyboardMessageFirstLine })
      .filter({ hasText: keyboardMessageSecondLine }),
  ).toBeVisible();
  await expect(replyBox).toHaveValue("");

  const keyboardReply = page
    .locator(".chat-message")
    .filter({ hasText: keyboardMessageFirstLine })
    .filter({ hasText: keyboardMessageSecondLine });
  await keyboardReply.getByRole("button", { name: "Reply options" }).click();
  await page.getByRole("menuitem", { name: "Edit reply" }).click();
  await page.getByLabel("Edit reply text").fill(editedKeyboardMessage);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(keyboardReply).not.toBeVisible();
  const editedKeyboardReply = page.locator(".chat-message").filter({ hasText: editedKeyboardMessage });
  await expect(editedKeyboardReply).toBeVisible();
  await editedKeyboardReply.getByRole("button", { name: "Reply options" }).click();
  await page.getByRole("menuitem", { name: "Delete reply" }).click();
  await expect(editedKeyboardReply).not.toBeVisible();

  await page
    .locator(".chat-message")
    .filter({ hasText: testMessage })
    .getByRole("button", { name: "Open Stand in Christ Tester profile" })
    .click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

  await openSection(page, "Discussions");
  await expect(page.getByRole("heading", { name: "Truth-seeking, without the heat." })).toBeVisible();
});

test("common ground shows commandments and community guidelines", async ({ page }) => {
  await openCleanApp(page);
  await page.evaluate(() => {
    const today = new Date();
    const dateKey = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
      .map((datePart) => String(datePart).padStart(2, "0"))
      .join("-");
    const steps = [
      ["love-god", "Love the Lord your God"],
      ["love-neighbor", "Love your neighbor as yourself"],
      ...[
        "Have no other gods before God.",
        "Do not make idols.",
        "Do not misuse the name of the Lord your God.",
        "Remember the Sabbath day and keep it holy.",
        "Honor your father and mother.",
        "Do not murder.",
        "Do not commit adultery.",
        "Do not steal.",
        "Do not bear false witness against your neighbor.",
        "Do not covet.",
      ].map((title, index) => [`commandment-${index + 1}`, title]),
    ];

    window.localStorage.setItem(
      "one-body-common-ground-review-v1",
      JSON.stringify(
        steps.map(([stepId, title], index) => ({
          id: `completed-${stepId}`,
          dateKey,
          stepId,
          title,
          rating: "Good",
          note: "",
          createdAt: Date.now() - index,
        })),
      ),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Common Ground");

  await expect(page.getByRole("heading", { name: "The way we walk together." })).toBeVisible();
  await page.getByRole("tab", { name: "Commandments" }).click();
  await expect(page.getByText("Love your neighbor as yourself")).toBeVisible();
  await expect(page.getByText("Do not bear false witness against your neighbor.")).toBeVisible();

  await page.getByRole("tab", { name: "Community Guidelines" }).click();

  await expect(page.getByText("Respond with love first")).toBeVisible();
  await expect(page.getByText("Assume good faith")).toBeVisible();
  await expect(page.getByText("Disagree with ideas, not people")).toBeVisible();
});

test("common ground daily review saves notes and only runs once per day", async ({ page }) => {
  const firstNote = `Loved God through prayer ${Date.now()}`;
  const secondNote = `Loved neighbor through patience ${Date.now()}`;

  await mockDate(page, "2026-05-08T10:30:00");
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Common Ground");

  await expect(page.getByText("Step 1 of 12")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Love the Lord your God" })).toBeVisible();

  await expect(page.locator(".common-rating-options button")).toHaveText([
    "Excellent",
    "Good",
    "Okay",
    "Bad",
    "Terrible",
  ]);

  await page.getByRole("button", { name: "Good" }).click();
  await page.getByLabel("Private review note").fill(firstNote);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 2 of 12")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Love your neighbor as yourself" })).toBeVisible();

  await page.getByRole("button", { name: "Excellent" }).click();
  await page.getByLabel("Private review note").fill(secondNote);
  await page.getByRole("button", { name: "Next" }).click();

  for (let stepNumber = 3; stepNumber <= 12; stepNumber += 1) {
    await expect(page.getByText(`Step ${stepNumber} of 12`)).toBeVisible();
    await page.getByRole("button", { name: "Okay" }).click();
    await page
      .getByRole("button", { name: stepNumber === 12 ? "Finish" : "Next" })
      .click();
  }

  await expect(page.getByRole("tab", { name: "Notes 12" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: "Notes 12" }).locator("span")).toHaveCSS(
    "color",
    "rgb(32, 94, 91)",
  );
  await expect(page.getByText(firstNote)).toBeVisible();
  await expect(page.getByText(secondNote)).toBeVisible();
  await expect(page.getByText("Have no other gods before God.")).toBeVisible();
  await expect(page.getByText("Good")).toBeVisible();
  await expect(page.getByText("Excellent")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Common Ground");

  await expect(page.getByRole("tab", { name: "Notes 12" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Step 1 of 12")).toHaveCount(0);
  await page.getByRole("tab", { name: "Commandments" }).click();
  await expect(page.getByText("Do not bear false witness against your neighbor.")).toBeVisible();

  await page.getByRole("tab", { name: "Community Guidelines" }).click();
  await expect(page.getByText("Respond with love first")).toBeVisible();
});

test("bible study saves dated reflection logs", async ({ page }) => {
  const studyThought = `A saved Bible study thought ${Date.now()}`;

  await mockDate(page, "2026-05-07T19:45:00");
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Bible Study");

  await expect(page.getByRole("heading", { name: "Today’s Scripture, slowly." })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Today’s Scripture" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByLabel("Study note").fill(studyThought);
  await page.getByRole("button", { name: "Save thought" }).click();

  await expect(page.getByRole("tab", { name: "Logs 1" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText(studyThought)).toBeVisible();
  await expect(page.locator(".study-log-item time")).toBeVisible();
  await expect(page.locator(".study-log-item")).toContainText("WEB");

  await page.reload();
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Bible Study");
  await page.getByRole("tab", { name: "Logs 1" }).click();

  await expect(page.getByText(studyThought)).toBeVisible();
});

test("houses section opens tradition homes with their own feed", async ({ page }) => {
  const housePost = `Orthodox house reflection ${Date.now()}`;
  const editedHousePost = `Edited Orthodox reflection ${Date.now()}`;
  const houseComment = `Orthodox house comment ${Date.now()}`;
  const editedHouseComment = `Edited Orthodox house comment ${Date.now()}`;

  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Houses");

  await expect(page.getByRole("heading", { name: "Three houses, one Lord." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Orthodox House" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Catholic House" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Protestant House" })).toBeVisible();

  await page.getByRole("button", { name: "Join Orthodox" }).click();
  await expect(page.getByRole("status")).toContainText("Orthodox House");
  await expect(page.getByRole("heading", { name: "Three houses, one Lord." })).toBeVisible({
    timeout: 150,
  });
  await expect(page.getByPlaceholder("Share with the Orthodox house...")).toBeVisible({
    timeout: 3000,
  });
  await expect(page.getByRole("heading", { name: "Three houses, one Lord." })).toBeHidden();
  await expect(page.getByRole("status")).toBeHidden({ timeout: 3000 });
  await expect(page.locator(".house-home").getByRole("button", { name: "Houses" })).toHaveCount(0);

  const houseComposerAvatarButton = page.locator(".house-composer .avatar-link");
  await expect(houseComposerAvatarButton).toBeVisible();
  const houseComposerAvatarBox = await houseComposerAvatarButton.boundingBox();
  expect(houseComposerAvatarBox).not.toBeNull();
  expect(Math.abs(houseComposerAvatarBox.width - houseComposerAvatarBox.height)).toBeLessThanOrEqual(
    1,
  );
  expect(houseComposerAvatarBox.width).toBeLessThanOrEqual(56);

  await page.getByPlaceholder("Share with the Orthodox house...").fill(housePost);
  await page.getByRole("button", { name: "Post to House" }).click();

  await expect(page.getByLabel("Orthodox house feed")).toContainText(housePost);
  const feedOpenPaddingLeft = await page
    .locator(".house-feed-open-button")
    .first()
    .evaluate((element) => parseFloat(window.getComputedStyle(element).paddingLeft));
  expect(feedOpenPaddingLeft).toBeGreaterThanOrEqual(70);

  await page.locator(".house-feed-item").filter({ hasText: housePost }).click();
  await expect(page.getByRole("heading", { name: housePost })).toBeVisible();

  await page
    .locator(".house-detail-card")
    .getByRole("button", { name: "Post options" })
    .click();
  await page.getByRole("menuitem", { name: "Edit post" }).click();
  await page.getByLabel("Edit post text").fill(editedHousePost);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: editedHousePost })).toBeVisible();
  await expect(page.getByText(housePost)).not.toBeVisible();
  await expect(page.getByPlaceholder("Reply inside the Orthodox house...")).toBeVisible();

  await page.getByPlaceholder("Reply inside the Orthodox house...").fill(houseComment);
  await page.getByRole("button", { name: "Comment" }).click();

  await expect(page.getByLabel("Orthodox house comments")).toContainText(houseComment);
  await expect(page.getByText("1 comment")).toBeVisible();

  await page
    .locator(".house-comment-item")
    .filter({ hasText: houseComment })
    .getByRole("button", { name: "Reply options" })
    .click();
  await page.getByRole("menuitem", { name: "Edit reply" }).click();
  await page.getByLabel("Edit reply text").fill(editedHouseComment);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(houseComment, { exact: true })).not.toBeVisible();
  await expect(page.getByText(editedHouseComment)).toBeVisible();

  await page
    .locator(".house-comment-item")
    .filter({ hasText: editedHouseComment })
    .getByRole("button", { name: "Reply options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete reply" }).click();
  await expect(page.getByText(editedHouseComment)).not.toBeVisible();
  await expect(page.getByText("0 comments")).toBeVisible();

  await page.getByPlaceholder("Reply inside the Orthodox house...").fill(houseComment);
  await page.getByRole("button", { name: "Comment" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Houses");
  await expect(page.getByPlaceholder("Share with the Orthodox house...")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Three houses, one Lord." })).toBeHidden();
  await page.locator(".house-feed-item").filter({ hasText: editedHousePost }).click();

  await expect(page.getByLabel("Orthodox house comments")).toContainText(houseComment);

  await page
    .locator(".house-detail-card")
    .getByRole("button", { name: "Post options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete post" }).click();

  await expect(page.getByText(editedHousePost)).not.toBeVisible();
});

test("profile settings shows the chosen house and can leave it", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Houses");

  await page.getByRole("button", { name: "Join Catholic" }).click();
  await expect(page.getByPlaceholder("Share with the Catholic house...")).toBeVisible({
    timeout: 3000,
  });

  await openSection(page, "Profile");
  await page.getByRole("button", { name: "Profile settings" }).click();

  await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
  await expect(page.getByText("Chosen house is Catholic House")).toBeVisible();

  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByText("No house selected yet")).toBeVisible();

  await openSection(page, "Houses");
  await expect(page.getByRole("heading", { name: "Three houses, one Lord." })).toBeVisible();
});

test("daily Bible verse changes with the day", async ({ browser }) => {
  const firstPage = await browser.newPage();
  await mockDate(firstPage, "2026-01-01T12:00:00Z");
  await openCleanApp(firstPage);
  await firstPage.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await firstPage.getByRole("button", { name: "Open sections" }).click();

  await expect(firstPage.locator(".daily-verse-card cite")).toHaveText("Psalm 84:11 · WEB");

  const secondPage = await browser.newPage();
  await mockDate(secondPage, "2026-01-02T12:00:00Z");
  await openCleanApp(secondPage);
  await secondPage.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await secondPage.getByRole("button", { name: "Open sections" }).click();

  await expect(secondPage.locator(".daily-verse-card cite")).toHaveText(
    "Proverbs 19:21 · WEB",
  );

  await firstPage.close();
  await secondPage.close();
});

test("daily Bible verse refreshes after local midnight while open", async ({ page }) => {
  await mockMutableDate(page, "2026-01-01T23:59:59");
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await page.getByRole("button", { name: "Open sections" }).click();

  await expect(page.locator(".daily-verse-card cite")).toHaveText("Psalm 84:11 · WEB");

  await page.evaluate(() => {
    window.__advanceMockDate(2000);
  });

  await expect(page.locator(".daily-verse-card cite")).toHaveText(
    "Proverbs 19:21 · WEB",
    { timeout: 3000 },
  );
});

test("prayer wall creates a prayer board and removes it after prayer", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Prayer Wall");

  await page.getByRole("button", { name: /Prayer options/i }).click();
  await page.getByRole("button", { name: "Urgent" }).click();
  await page.getByPlaceholder("What can we pray for?").fill("Please pray for courage today.");
  await page.getByRole("button", { name: "Share Prayer" }).click();

  const newPrayer = page.getByText("Please pray for courage today.");
  const newPrayerNote = page.locator(".prayer-note").filter({ hasText: "Please pray for courage today." });

  await expect(newPrayer).toBeVisible();
  await expect(newPrayerNote).toContainText("Public");
  await expect(newPrayerNote).toContainText("Urgent");

  await newPrayerNote.getByRole("button", { name: "Open Stand in Christ Tester profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stand in Christ Tester" })).toBeVisible();

  await openSection(page, "Prayer Wall");
  await expect(newPrayer).toBeVisible();

  await newPrayerNote.getByRole("button", { name: "I prayed" }).click();
  await expect(newPrayer).not.toBeVisible({ timeout: 3000 });

  await page.getByRole("button", { name: /Prayer options/i }).click();
  await page.getByRole("button", { name: "Anonymous" }).click();
  await page.getByRole("button", { name: "Urgent" }).click();
  await page.getByPlaceholder("What can we pray for?").fill("Please pray privately and quickly.");
  await page.getByRole("button", { name: "Share Prayer" }).click();

  const anonymousPrayerNote = page
    .locator(".prayer-note")
    .filter({ hasText: "Please pray privately and quickly." });

  await expect(anonymousPrayerNote).toContainText("Anonymous");
  await expect(anonymousPrayerNote).toContainText("Urgent");
  await expect(anonymousPrayerNote.getByRole("button", { name: /Open/i })).toHaveCount(0);
});

test("prayer type selector keeps every selected label readable", async ({ page }) => {
  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Prayer Wall");

  const trigger = page.locator("button.prayer-type-trigger");
  const actions = page.locator(".quiet-form .composer-actions");
  const options = page.locator(".prayer-type-options");
  const assertOptionsPanelFits = async () => {
    await expect(options).toBeVisible();

    const [triggerBox, optionsBox] = await Promise.all([
      trigger.boundingBox(),
      options.boundingBox(),
    ]);
    const viewport = page.viewportSize();

    expect(triggerBox).not.toBeNull();
    expect(optionsBox).not.toBeNull();
    expect(viewport).not.toBeNull();

    expect(Math.abs(optionsBox.x + optionsBox.width / 2 - (triggerBox.x + triggerBox.width / 2))).toBeLessThan(
      2,
    );
    expect(optionsBox.x).toBeGreaterThanOrEqual(-1);
    expect(optionsBox.x + optionsBox.width).toBeLessThanOrEqual(viewport.width + 1);

    for (const label of ["Public", "Anonymous", "Urgent", "Answered"]) {
      const optionBox = await options.getByRole("button", { name: label, exact: true }).boundingBox();

      expect(optionBox).not.toBeNull();
      expect(optionBox.x).toBeGreaterThanOrEqual(optionsBox.x - 1);
      expect(optionBox.x + optionBox.width).toBeLessThanOrEqual(optionsBox.x + optionsBox.width + 1);
    }
  };
  const assertActionsShareOneRow = async () => {
    const [counterBox, triggerBox, shareButtonBox] = await Promise.all([
      actions.locator(".counter").boundingBox(),
      trigger.boundingBox(),
      actions.getByRole("button", { name: "Share Prayer", exact: true }).boundingBox(),
    ]);

    expect(counterBox).not.toBeNull();
    expect(triggerBox).not.toBeNull();
    expect(shareButtonBox).not.toBeNull();

    const centers = [counterBox, triggerBox, shareButtonBox].map((box) => box.y + box.height / 2);

    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(10);
  };
  const assertSelectedLabelFits = async (label) => {
    await expect(trigger).toContainText("Share as");
    await expect(trigger).toContainText(label);
    await expect
      .poll(
        async () =>
          trigger.evaluate((node) => {
            const labelNode = node.querySelector("strong");

            return labelNode.scrollWidth <= labelNode.clientWidth + 1;
          }),
        {
          message: `Expected "${label}" to fit inside the prayer type selector`,
        },
      )
      .toBeTruthy();
  };

  await assertActionsShareOneRow();
  await assertSelectedLabelFits("Public");

  await trigger.click();
  await assertOptionsPanelFits();
  await options.getByRole("button", { name: "Answered", exact: true }).click();
  await assertSelectedLabelFits("Public, Answered");

  await options.getByRole("button", { name: "Urgent", exact: true }).click();
  await assertSelectedLabelFits("Public, Answered, Urgent");

  await options.getByRole("button", { name: "Anonymous", exact: true }).click();
  await assertActionsShareOneRow();
  await assertSelectedLabelFits("Anonymous, Answered, Urgent");

  await options.getByRole("button", { name: "Answered", exact: true }).click();
  await assertSelectedLabelFits("Anonymous, Urgent");

  await options.getByRole("button", { name: "Urgent", exact: true }).click();
  await assertSelectedLabelFits("Anonymous");

  await options.getByRole("button", { name: "Public", exact: true }).click();
  await assertSelectedLabelFits("Public");

  await options.getByRole("button", { name: "Urgent", exact: true }).click();
  await assertSelectedLabelFits("Public, Urgent");
});

test("profile edits persist after switching sections", async ({ page }) => {
  const visibleAvatarPost = `Visible avatar home post ${Date.now()}`;
  const visibleAvatarPrayer = `Visible avatar prayer ${Date.now()}`;
  const visibleAvatarHousePost = `Visible avatar house post ${Date.now()}`;
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );

  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Profile");

  await page.getByRole("button", { name: "Edit profile" }).click();
  await expect(page.getByRole("dialog", { name: "Edit profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change banner image" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change profile picture" })).toBeVisible();

  await page.getByLabel("Name").fill("Grace Tester");
  await page.getByLabel("Tradition").selectOption("Orthodox");
  await page.getByLabel("Favorite Bible verse").fill("John 13:35");
  await page.getByLabel("Description").fill("Walking with Jesus in patient unity.");
  await page.getByRole("button", { name: "Rose profile border" }).click();
  await page.getByLabel("Banner image file").setInputFiles({
    name: "banner.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await page.getByLabel("Profile picture file").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await expect(page.getByRole("button", { name: "Remove profile picture" })).toBeVisible();
  await expect(page.getByText("Remove photo")).toHaveCount(0);

  await page.getByRole("button", { name: "Remove profile picture" }).click();
  await expect(page.getByRole("button", { name: "Change profile picture" })).toBeVisible();
  await expect(page.locator(".profile-edit-avatar img")).toHaveCount(0);

  await page.getByLabel("Profile picture file").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await page.getByLabel("Banner image size").evaluate((input) => {
    input.value = "1.35";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("dialog", { name: "Edit profile" })).not.toBeVisible();
  await expect(page.getByText("Grace Tester")).toBeVisible();
  await expect(page.locator(".profile-card").getByText("Orthodox")).toBeVisible();
  await expect(page.locator(".profile-card").getByText("John 13:35")).toBeVisible();
  await expect(page.locator(".profile-cover-image")).toBeVisible();
  await expect(page.locator(".profile-avatar img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".profile-avatar")
        .evaluate((element) =>
          window.getComputedStyle(element).getPropertyValue("--avatar-border-color").trim(),
        ),
    )
    .toBe("#cf7067");
  await expect(page.getByRole("button", { name: "Profile settings" })).toBeVisible();

  await openSection(page, "Home");
  await expect(page.locator(".composer .avatar img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".composer .avatar")
        .evaluate((element) =>
          window.getComputedStyle(element).getPropertyValue("--avatar-border-color").trim(),
        ),
    )
    .toBe("#cf7067");
  await page.getByPlaceholder("What’s on your heart?").fill(visibleAvatarPost);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const homePostWithAvatar = page.locator(".post-item").filter({ hasText: visibleAvatarPost });
  await expect(homePostWithAvatar.locator(".avatar-link img")).toBeVisible();
  await homePostWithAvatar.getByRole("button", { name: "Open Grace Tester profile" }).click();
  await expect(page.getByRole("heading", { name: "Grace Tester" })).toBeVisible();

  await openSection(page, "Prayer Wall");
  await page.getByPlaceholder("What can we pray for?").fill(visibleAvatarPrayer);
  await page.getByRole("button", { name: "Share Prayer" }).click();
  const prayerWithAvatar = page.locator(".prayer-note").filter({ hasText: visibleAvatarPrayer });
  await expect(prayerWithAvatar.locator(".prayer-author-button img")).toBeVisible();
  await prayerWithAvatar.getByRole("button", { name: "Open Grace Tester profile" }).click();
  await expect(page.getByRole("heading", { name: "Grace Tester" })).toBeVisible();

  await openSection(page, "Houses");
  await page.getByRole("button", { name: "Join Orthodox" }).click();
  await expect(page.getByPlaceholder("Share with the Orthodox house...")).toBeVisible({
    timeout: 3000,
  });
  await expect(page.locator(".house-composer .house-avatar img")).toBeVisible();
  await page.getByPlaceholder("Share with the Orthodox house...").fill(visibleAvatarHousePost);
  await page.getByRole("button", { name: "Post to House" }).click();
  const housePostWithAvatar = page
    .locator(".house-feed-item")
    .filter({ hasText: visibleAvatarHousePost });
  await expect(housePostWithAvatar.locator(".avatar-link img")).toBeVisible();
  await housePostWithAvatar.getByRole("button", { name: "Open Grace Tester profile" }).click();
  await expect(page.getByRole("heading", { name: "Grace Tester" })).toBeVisible();
  await openSection(page, "Profile");

  await expect(page.getByText("Grace Tester")).toBeVisible();
  await expect(page.locator(".profile-card").getByText("Orthodox")).toBeVisible();
  await expect(page.locator(".profile-cover-image")).toBeVisible();
  await expect(page.locator(".profile-avatar img")).toBeVisible();
});

test("profile tabs show posts, replies, and prayers", async ({ page }) => {
  const profilePost = `Profile post ${Date.now()}`;
  const profileReply = `Profile reply ${Date.now()}`;
  const profilePrayer = `Profile prayer ${Date.now()}`;
  const editedProfilePost = `Edited profile post ${Date.now()}`;
  const editedProfileReply = `Edited profile reply ${Date.now()}`;
  const editedProfilePrayer = `Edited profile prayer ${Date.now()}`;

  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await page.getByPlaceholder("What’s on your heart?").fill(profilePost);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.locator(".post-item").filter({ hasText: profilePost }).click();
  await page.getByPlaceholder("Write a gracious comment...").fill(profileReply);
  await page.getByRole("button", { name: "Comment" }).click();
  await page.locator(".room-back-button").click();

  await openSection(page, "Prayer Wall");
  await page.getByPlaceholder("What can we pray for?").fill(profilePrayer);
  await page.getByRole("button", { name: "Share Prayer" }).click();

  await openSection(page, "Profile");
  const profilePanel = page.locator(".profile-tab-panel");
  const profilePanelMinHeight = async () =>
    profilePanel.evaluate((element) => parseFloat(window.getComputedStyle(element).minHeight));

  await expect(profilePanel).toContainText(profilePost);
  await expect.poll(profilePanelMinHeight).toBeGreaterThanOrEqual(300);
  await profilePanel
    .locator(".profile-activity-item")
    .filter({ hasText: profilePost })
    .getByRole("button", { name: "Post options" })
    .click();
  await page.getByRole("menuitem", { name: "Edit post" }).click();
  await page.getByLabel("Edit post text").fill(editedProfilePost);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(profilePanel).toContainText(editedProfilePost);
  await expect(profilePanel).not.toContainText(profilePost);

  await page.getByRole("button", { name: "Replies" }).click();
  await expect(profilePanel).toContainText(profileReply);
  await expect.poll(profilePanelMinHeight).toBeGreaterThanOrEqual(300);
  await profilePanel
    .locator(".profile-activity-item")
    .filter({ hasText: profileReply })
    .getByRole("button", { name: "Reply options" })
    .click();
  await page.getByRole("menuitem", { name: "Edit reply" }).click();
  await page.getByLabel("Edit reply text").fill(editedProfileReply);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(profilePanel).toContainText(editedProfileReply);
  await expect(profilePanel).not.toContainText(profileReply);

  await page.getByRole("button", { name: "Prayers" }).click();
  await expect(profilePanel).toContainText(profilePrayer);
  await expect(profilePanel).toContainText("Prayer ·");
  await expect.poll(profilePanelMinHeight).toBeGreaterThanOrEqual(300);
  await profilePanel
    .locator(".profile-activity-item")
    .filter({ hasText: profilePrayer })
    .getByRole("button", { name: "Prayer options" })
    .click();
  await page.getByRole("menuitem", { name: "Edit prayer" }).click();
  await page.getByLabel("Edit prayer text").fill(editedProfilePrayer);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(profilePanel).toContainText(editedProfilePrayer);
  await expect(profilePanel).not.toContainText(profilePrayer);

  await profilePanel
    .locator(".profile-activity-item")
    .filter({ hasText: editedProfilePrayer })
    .getByRole("button", { name: "Prayer options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete prayer" }).click();
  await expect(profilePanel).not.toContainText(editedProfilePrayer);
});

test("malformed local browser data is cleaned up instead of crashing", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "one-body-posts-v1",
      JSON.stringify([
        { body: "Recovered home post", createdAt: "not-a-date" },
        { id: "empty-post", body: "   ", createdAt: 0 },
        null,
      ]),
    );
    window.localStorage.setItem(
      "one-body-prayers-v1",
      JSON.stringify([
        {
          body: "Recovered prayer request",
          types: ["unknown-type", "urgent"],
          prayedCount: "not-a-number",
          createdAt: "not-a-date",
        },
      ]),
    );
    window.localStorage.setItem(
      "one-body-profile-v1",
      JSON.stringify({
        name: "  Recovered Tester  ",
        tradition: "Invalid tradition",
        verse: "",
        bio: 42,
        avatarImage: "data:text/html,<script></script>",
        bannerImage: "https://example.com/banner.png",
        bannerScale: 99,
      }),
    );
    window.localStorage.setItem("one-body-house-selection-v1", "unknown-house");
    window.localStorage.setItem(
      "one-body-discussion-messages-v1",
      JSON.stringify({
        "disagree-love": [
          {
            body: "Recovered discussion message",
            author: 7,
            initials: "",
            createdAt: "not-a-date",
          },
        ],
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });

  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByText("Recovered home post")).toBeVisible();
  await expect(page.getByText("empty-post")).toHaveCount(0);

  await openSection(page, "Prayer Wall");
  await expect(page.getByText("Recovered prayer request")).toBeVisible();
  await expect(page.locator(".prayer-note").filter({ hasText: "Recovered prayer request" })).toContainText(
    "Public",
  );

  await openSection(page, "Profile");
  await expect(page.getByRole("heading", { name: "Recovered Tester" })).toBeVisible();
  await expect(page.locator(".profile-card").getByText("Exploring")).toBeVisible();
  await expect(page.locator(".profile-cover-image")).toHaveCount(0);
  await expect(page.locator(".profile-avatar img")).toHaveCount(0);

  await openSection(page, "Houses");
  await expect(page.getByRole("heading", { name: "Three houses, one Lord." })).toBeVisible();

  await openSection(page, "Discussions");
  await page.getByRole("button", { name: /How should Christians disagree/i }).click();
  await expect(page.getByText("Recovered discussion message")).toBeVisible();
});

test("profile editor keeps working when browser storage refuses a save", async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;

    Storage.prototype.setItem = function setItemWithProfileQuotaFailure(key, value) {
      if (key === "one-body-profile-v1") {
        throw new Error("Simulated profile storage quota failure");
      }

      return originalSetItem.call(this, key, value);
    };
  });

  await openCleanApp(page);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
  await openSection(page, "Profile");

  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByLabel("Name").fill("Storage Safe Tester");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: "Storage Safe Tester" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Edit profile" })).not.toBeVisible();
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
