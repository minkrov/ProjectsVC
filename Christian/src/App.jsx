import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dailyVerses } from "./data/dailyVerses";

const POSTS_STORAGE_KEY = "one-body-posts-v1";
const POST_COMMENTS_STORAGE_KEY = "one-body-post-comments-v1";
const PRAYERS_STORAGE_KEY = "one-body-prayers-v1";
const PROFILE_STORAGE_KEY = "one-body-profile-v1";
const STUDY_NOTE_STORAGE_KEY = "one-body-study-note-v1";
const STUDY_LOGS_STORAGE_KEY = "one-body-study-logs-v1";
const COMMON_GROUND_REVIEW_STORAGE_KEY = "one-body-common-ground-review-v1";
const DISCUSSION_MESSAGES_STORAGE_KEY = "one-body-discussion-messages-v1";
const HOUSE_SELECTION_STORAGE_KEY = "one-body-house-selection-v1";
const HOUSE_POSTS_STORAGE_KEY = "one-body-house-posts-v1";
const HOUSE_COMMENTS_STORAGE_KEY = "one-body-house-comments-v1";
const TEST_CONTENT_SEED_VERSION = "test-community-v1";
const MAX_POST_LENGTH = 280;
const MAX_COMMENT_LENGTH = 280;
const MAX_PRAYER_LENGTH = 220;
const MAX_DISCUSSION_MESSAGE_LENGTH = 360;
const MAX_STUDY_THOUGHT_LENGTH = 520;
const MAX_COMMON_GROUND_NOTE_LENGTH = 260;
const HOUSE_BACKGROUND_SWAP_DELAY_MS = 520;
const HOUSE_WELCOME_DURATION_MS = 1450;

const sectionLabels = {
  home: "Home",
  prayer: "Prayer Wall",
  discussions: "Discussions",
  study: "Bible Study",
  houses: "Houses",
  common: "Common Ground",
  profile: "Profile",
  settings: "Settings",
};

const sections = [
  { id: "home", label: sectionLabels.home },
  { id: "prayer", label: sectionLabels.prayer },
  { id: "discussions", label: sectionLabels.discussions },
  { id: "study", label: sectionLabels.study },
  { id: "houses", label: sectionLabels.houses },
  { id: "common", label: sectionLabels.common },
  { id: "profile", label: sectionLabels.profile },
];

const testAuthors = {
  mara: {
    id: "test-mara",
    name: "Mara Ellis",
    handle: "@mara.ellis",
    initials: "ME",
    avatarBorderColor: "#3f8297",
    tradition: "Orthodox",
    verse: "John 13:35",
    bio: "Practicing patient listening across Christian traditions.",
  },
  jonah: {
    id: "test-jonah",
    name: "Jonah Reed",
    handle: "@jonah.reed",
    initials: "JR",
    avatarBorderColor: "#6d8f58",
    tradition: "Protestant",
    verse: "Micah 6:8",
    bio: "Learning to ask better questions before answering.",
  },
  elena: {
    id: "test-elena",
    name: "Elena Cruz",
    handle: "@elena.cruz",
    initials: "EC",
    avatarBorderColor: "#c39436",
    tradition: "Catholic",
    verse: "Romans 12:18",
    bio: "Drawn to prayer, mercy, and thoughtful disagreement.",
  },
  theo: {
    id: "test-theo",
    name: "Theo Marin",
    handle: "@theo.marin",
    initials: "TM",
    avatarBorderColor: "#2e8b86",
    tradition: "Non-denominational",
    verse: "Ephesians 4:2",
    bio: "Trying to make room for truth and tenderness together.",
  },
};

const avatarBorderColors = [
  { name: "Teal", value: "#2e8b86" },
  { name: "Gold", value: "#c39436" },
  { name: "Oak", value: "#7b5137" },
  { name: "Rose", value: "#cf7067" },
  { name: "Olive", value: "#6d8f58" },
  { name: "Sky", value: "#3f8297" },
];

const christianHouses = [
  {
    id: "orthodox",
    name: "Orthodox",
    accent: "#3f8297",
    accentSoft: "rgba(63, 130, 151, 0.18)",
    roof: "#376f82",
    wall: "#bdd7d5",
    initials: "OX",
    motto: "Ancient worship, holy mystery, and patient prayer.",
    welcome:
      "A peaceful house for icons, liturgy, fathers of the faith, and learning to worship with reverence.",
    starterPosts: [
      "Welcome to the Orthodox house. Share questions with humility and a desire to understand.",
      "What helps you experience prayer as something ancient and living?",
    ],
  },
  {
    id: "catholic",
    name: "Catholic",
    accent: "#c39436",
    accentSoft: "rgba(195, 148, 54, 0.2)",
    roof: "#a97032",
    wall: "#e8cd96",
    initials: "CA",
    motto: "Sacrament, unity, tradition, and works of mercy.",
    welcome:
      "A warm house for Scripture, sacraments, church history, and practicing charity in conversation.",
    starterPosts: [
      "Welcome to the Catholic house. Let every answer be both truthful and charitable.",
      "Where do you see mercy and tradition strengthening each other?",
    ],
  },
  {
    id: "protestant",
    name: "Protestant",
    accent: "#6d8f58",
    accentSoft: "rgba(109, 143, 88, 0.18)",
    roof: "#5c784a",
    wall: "#cedbbb",
    initials: "PR",
    motto: "Scripture, grace, discipleship, and everyday faith.",
    welcome:
      "A hopeful house for Bible-centered discussion, discipleship, worship, and living by grace.",
    starterPosts: [
      "Welcome to the Protestant house. Bring Scripture, grace, and a listening heart.",
      "What passage has helped you follow Jesus this week?",
    ],
  },
];

const getHouseById = (houseId) =>
  christianHouses.find((house) => house.id === houseId) ?? null;

const defaultHousePosts = christianHouses.reduce((postsByHouse, house) => {
  const houseAuthors = {
    orthodox: [testAuthors.mara, testAuthors.theo],
    catholic: [testAuthors.elena, testAuthors.jonah],
    protestant: [testAuthors.jonah, testAuthors.mara],
  }[house.id];

  postsByHouse[house.id] = house.starterPosts.map((body, index) => ({
    id: `${house.id}-starter-${index + 1}`,
    author: houseAuthors[index % houseAuthors.length],
    body,
    createdAt: Date.now() - 1000 * 60 * (90 + index * 28),
  }));

  return postsByHouse;
}, {});

const defaultHouseComments = {
  "orthodox-starter-1": [
    {
      id: "orthodox-starter-1-comment-1",
      author: testAuthors.elena,
      body: "I appreciate the invitation to understand before answering. That feels like a peaceful way to enter.",
      createdAt: Date.now() - 1000 * 60 * 74,
    },
  ],
  "catholic-starter-1": [
    {
      id: "catholic-starter-1-comment-1",
      author: testAuthors.mara,
      body: "Truthful and charitable is such a helpful pairing. One without the other can feel incomplete.",
      createdAt: Date.now() - 1000 * 60 * 71,
    },
  ],
  "protestant-starter-1": [
    {
      id: "protestant-starter-1-comment-1",
      author: testAuthors.theo,
      body: "I like the phrase listening heart. That should probably be a house rule everywhere.",
      createdAt: Date.now() - 1000 * 60 * 69,
    },
  ],
};

const starterTopics = [
  {
    id: "disagree-love",
    title: "How should Christians disagree with love?",
    meta: "Unity",
    replies: 14,
    body: "Start by naming what you respect in the other person before explaining where you differ.",
    basedOn: "Ephesians 4:2 and the call to patience, humility, and love.",
  },
  {
    id: "baptism-traditions",
    title: "What does baptism mean across traditions?",
    meta: "Bible Interpretation",
    replies: 9,
    body: "A guided place to compare convictions without turning the conversation into a fight.",
    basedOn: "Matthew 28:19 and the shared desire to follow Jesus faithfully.",
  },
  {
    id: "judging-rightly",
    title: "What does Jesus mean by judging rightly?",
    meta: "Hard Questions",
    replies: 7,
    body: "Truth and humility belong together. This thread asks how we practice both.",
    basedOn: "John 7:24 and Jesus' warning against shallow judgment.",
  },
];

const defaultDiscussionMessages = {
  "disagree-love": [
    {
      id: "disagree-love-1",
      author: "Mara",
      initials: "M",
      body: "I think the first step is proving we actually heard the other person before we answer them.",
      createdAt: Date.now() - 1000 * 60 * 44,
    },
    {
      id: "disagree-love-2",
      author: "Jonah",
      initials: "J",
      body: "That feels right. If I cannot summarize someone's belief fairly, I probably should ask another question first.",
      createdAt: Date.now() - 1000 * 60 * 21,
    },
  ],
  "baptism-traditions": [
    {
      id: "baptism-traditions-1",
      author: "Elena",
      initials: "E",
      body: "It helps me when people explain what baptism means in their tradition before debating what it should mean.",
      createdAt: Date.now() - 1000 * 60 * 52,
    },
    {
      id: "baptism-traditions-2",
      author: "Theo",
      initials: "T",
      body: "Maybe this room can collect the shared parts first, then name the differences without rushing.",
      createdAt: Date.now() - 1000 * 60 * 27,
    },
  ],
  "judging-rightly": [
    {
      id: "judging-rightly-1",
      author: "Grace",
      initials: "G",
      body: "I keep thinking about the difference between discernment and contempt. They can look similar outside but feel very different inside.",
      createdAt: Date.now() - 1000 * 60 * 38,
    },
    {
      id: "judging-rightly-2",
      author: "Micah",
      initials: "M",
      body: "Yes. Maybe righteous judgment should always be paired with self-examination and mercy.",
      createdAt: Date.now() - 1000 * 60 * 16,
    },
  ],
};

const defaultHomePosts = [
  {
    id: "starter-home-ask-with-love",
    author: testAuthors.mara,
    body: "What is one belief you changed your mind about after a patient conversation with another Christian?",
    createdAt: Date.now() - 1000 * 60 * 64,
  },
  {
    id: "starter-home-prayer-before-reply",
    author: testAuthors.jonah,
    body: "Trying a small habit today: before I reply to a hard topic, I pause and pray for the person I am answering.",
    createdAt: Date.now() - 1000 * 60 * 37,
  },
  {
    id: "starter-home-unity",
    author: testAuthors.elena,
    body: "Unity does not mean pretending differences are small. It means remembering Christ is greater while we talk through them.",
    createdAt: Date.now() - 1000 * 60 * 18,
  },
];

const defaultPostComments = {
  "starter-home-ask-with-love": [
    {
      id: "starter-home-ask-with-love-comment-1",
      author: testAuthors.theo,
      body: "For me it was learning that some people use different words for the same hope. Asking definitions helped a lot.",
      createdAt: Date.now() - 1000 * 60 * 58,
    },
    {
      id: "starter-home-ask-with-love-comment-2",
      author: testAuthors.elena,
      body: "Same. The conversation feels safer when we slow down enough to define what we mean.",
      createdAt: Date.now() - 1000 * 60 * 43,
    },
  ],
  "starter-home-unity": [
    {
      id: "starter-home-unity-comment-1",
      author: testAuthors.jonah,
      body: "That feels like the heart of this app. Strong convictions, soft hands.",
      createdAt: Date.now() - 1000 * 60 * 12,
    },
  ],
};

const commandmentHighlights = [
  {
    title: "Love the Lord your God",
    body: "Jesus names love for God as the greatest commandment: heart, soul, and mind turned toward Him.",
    reference: "Matthew 22:37-38",
  },
  {
    title: "Love your neighbor as yourself",
    body: "Jesus places love of neighbor beside it, giving this community its posture toward every person.",
    reference: "Matthew 22:39",
  },
];

const tenCommandments = [
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
];

const commonGroundRatings = ["Excellent", "Good", "Okay", "Bad", "Terrible"];

const commonGroundReviewSteps = [
  ...commandmentHighlights.map((highlight) => ({
    id: highlight.title === "Love the Lord your God" ? "love-god" : "love-neighbor",
    title: highlight.title,
    body: highlight.body,
    reference: highlight.reference,
    label: "Jesus Reminds Us",
  })),
  ...tenCommandments.map((commandment, index) => ({
    id: `commandment-${index + 1}`,
    title: commandment,
    body: "Pause for a moment and notice how this shaped your choices, words, and heart today.",
    reference: `Commandment ${index + 1}`,
    label: "Daily Commandment",
  })),
];

const communityGuidelines = [
  {
    title: "Respond with love first",
    body: "Before correcting someone, show that you care about them as a person made in the image of God.",
  },
  {
    title: "Assume good faith",
    body: "Ask what someone means before assuming the worst version of their belief or intention.",
  },
  {
    title: "Disagree with ideas, not people",
    body: "Challenge the content of a claim without insulting, mocking, or shaming the person who shared it.",
  },
  {
    title: "Seek understanding before persuasion",
    body: "Try to summarize the other person fairly before explaining why you see things differently.",
  },
  {
    title: "Use Scripture with humility",
    body: "Bring the Bible into conversation as light and truth, not as a weapon to win an argument.",
  },
  {
    title: "No contempt, harassment, or insults",
    body: "Hard topics are allowed; cruelty is not. Speak as someone who also needs grace.",
  },
  {
    title: "Make room for different traditions",
    body: "Catholic, Orthodox, Protestant, non-denominational, and exploring Christians should be treated with patience and respect.",
  },
  {
    title: "Repair when you wound",
    body: "If your words land harshly, apologize clearly and return the conversation to peace.",
  },
];

const traditions = ["Catholic", "Orthodox", "Protestant", "Non-denominational", "Exploring"];

const prayerTypes = [
  { id: "public", label: "Public", group: "visibility" },
  { id: "anonymous", label: "Anonymous", group: "visibility" },
  { id: "urgent", label: "Urgent", group: "status" },
  { id: "answered", label: "Answered", group: "status" },
];

const getPrayerType = (typeId) =>
  prayerTypes.find((prayerType) => prayerType.id === typeId) ?? prayerTypes[0];

const defaultPrayerTypeIds = ["public"];
const prayerTypeIds = prayerTypes.map((prayerType) => prayerType.id);

const getPrayerTypeIds = (prayer) => {
  const storedTypes = Array.isArray(prayer.types) ? prayer.types : [prayer.type];
  const validTypes = storedTypes.filter((typeId) => prayerTypeIds.includes(typeId));
  const hasVisibility = validTypes.includes("public") || validTypes.includes("anonymous");

  return hasVisibility ? validTypes : [...defaultPrayerTypeIds, ...validTypes];
};

const defaultPrayers = [
  {
    id: "starter-peace",
    author: testAuthors.theo,
    body: "Pray for this community to grow in patience, humility, and love.",
    types: ["public"],
    prayedCount: 12,
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
  },
  {
    id: "starter-unity",
    author: testAuthors.elena,
    body: "Pray that Christians from different traditions can speak truth gently.",
    types: ["public", "urgent"],
    prayedCount: 8,
    createdAt: Date.now() - 1000 * 60 * 60 * 7,
  },
];

const defaultProfile = {
  name: "Stand in Christ Tester",
  initials: "OB",
  tradition: "Exploring",
  verse: "Ephesians 4:2",
  bio: "Learning how to build a community marked by truth, humility, and love.",
  avatarImage: "",
  avatarBorderColor: "#2e8b86",
  bannerImage: "",
  bannerScale: 1,
};

const glassLayouts = [
  {
    gold: { top: "13%", left: "11%", rotation: "43deg", scale: 1.02 },
    teal: { top: "17%", right: "10%", rotation: "45deg", scale: 1.06 },
    rose: { bottom: "14%", right: "15%", rotation: "44deg", scale: 0.98 },
  },
  {
    gold: { top: "16%", right: "12%", rotation: "46deg", scale: 1.04 },
    teal: { bottom: "14%", left: "10%", rotation: "42deg", scale: 1.04 },
    rose: { bottom: "16%", right: "12%", rotation: "43deg", scale: 0.95 },
  },
  {
    gold: { top: "12%", left: "17%", rotation: "41deg", scale: 0.96 },
    teal: { top: "23%", right: "8%", rotation: "44deg", scale: 1.08 },
    rose: { bottom: "12%", right: "18%", rotation: "46deg", scale: 1 },
  },
  {
    gold: { top: "19%", right: "14%", rotation: "44deg", scale: 1 },
    teal: { bottom: "15%", left: "12%", rotation: "47deg", scale: 1.06 },
    rose: { bottom: "18%", right: "10%", rotation: "42deg", scale: 0.96 },
  },
  {
    gold: { top: "15%", left: "8%", rotation: "45deg", scale: 1.05 },
    teal: { bottom: "17%", left: "16%", rotation: "43deg", scale: 0.98 },
    rose: { bottom: "14%", right: "10%", rotation: "45deg", scale: 1.02 },
  },
  {
    gold: { top: "18%", right: "9%", rotation: "42deg", scale: 0.98 },
    teal: { top: "14%", left: "10%", rotation: "46deg", scale: 1.03 },
    rose: { bottom: "15%", right: "18%", rotation: "44deg", scale: 0.97 },
  },
];

const readStoredValue = (key, fallback) => {
  try {
    const storedValue = window.localStorage.getItem(key);
    if (!storedValue) {
      return fallback;
    }

    return JSON.parse(storedValue);
  } catch {
    return fallback;
  }
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createLocalId = (prefix = "item") => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getInitials = (name, fallback = "OB") => {
  if (typeof name !== "string" || !name.trim()) {
    return fallback;
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((namePart) => namePart[0])
    .join("")
    .toUpperCase();

  return initials || fallback;
};

const sanitizeAuthorImageDataUrl = (value) =>
  typeof value === "string" && value.startsWith("data:image/") ? value : "";

const normalizeAvatarBorderColor = (value) =>
  avatarBorderColors.some((color) => color.value === value) ? value : defaultProfile.avatarBorderColor;

const normalizeAuthor = (author) => {
  if (!isPlainObject(author)) {
    return null;
  }

  const name = typeof author.name === "string" && author.name.trim()
    ? author.name.trim()
    : "";

  if (!name) {
    return null;
  }

  return {
    id: typeof author.id === "string" && author.id.trim()
      ? author.id.trim()
      : `test-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    handle: typeof author.handle === "string" && author.handle.trim()
      ? author.handle.trim()
      : `@${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}`,
    initials: typeof author.initials === "string" && author.initials.trim()
      ? author.initials.trim().slice(0, 2).toUpperCase()
      : getInitials(name),
    tradition: typeof author.tradition === "string" ? author.tradition : "Exploring",
    verse: typeof author.verse === "string" ? author.verse : "Ephesians 4:2",
    bio: typeof author.bio === "string" ? author.bio : "A prototype community member.",
    avatarImage: sanitizeAuthorImageDataUrl(author.avatarImage),
    avatarBorderColor: normalizeAvatarBorderColor(author.avatarBorderColor),
  };
};

const getSeedStorageKey = (key) => `${key}:seed:${TEST_CONTENT_SEED_VERSION}`;

const shouldSeedStoredValue = (key) =>
  readStoredString(getSeedStorageKey(key)) !== "done";

const markStoredValueSeeded = (key) => {
  writeStoredString(getSeedStorageKey(key), "done");
};

const mergeSeededItems = (storedItems, seedItems) => {
  const storedIds = new Set(storedItems.map((item) => item.id));

  return [...seedItems.filter((item) => !storedIds.has(item.id)), ...storedItems];
};

const normalizeTimestamp = (value) => {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
};

const normalizeStoredTextItem = (item, maxLength, idPrefix) => {
  if (!isPlainObject(item) || typeof item.body !== "string") {
    return null;
  }

  const body = item.body.trim().slice(0, maxLength);
  if (!body) {
    return null;
  }

  return {
    id: typeof item.id === "string" && item.id ? item.id : createLocalId(idPrefix),
    ...(normalizeAuthor(item.author) ? { author: normalizeAuthor(item.author) } : {}),
    body,
    createdAt: normalizeTimestamp(item.createdAt),
  };
};

const normalizeStoredTextItems = (items, maxLength, idPrefix) =>
  Array.isArray(items)
    ? items
        .map((item) => normalizeStoredTextItem(item, maxLength, idPrefix))
        .filter(Boolean)
    : [];

const readStoredTextItems = (key, maxLength, idPrefix, seedItems = []) => {
  const storedItems = normalizeStoredTextItems(readStoredValue(key, []), maxLength, idPrefix);
  if (!seedItems.length || !shouldSeedStoredValue(key)) {
    return storedItems;
  }

  const normalizedSeedItems = normalizeStoredTextItems(seedItems, maxLength, `${idPrefix}-seed`);
  markStoredValueSeeded(key);

  return mergeSeededItems(storedItems, normalizedSeedItems);
};

const readStoredRecordOfTextItems = (key, maxLength, idPrefix, seedRecord = {}) => {
  const storedRecord = readStoredValue(key, {});
  const shouldSeed = isPlainObject(seedRecord) && shouldSeedStoredValue(key);
  const mergedRecord = shouldSeed
    ? {
        ...seedRecord,
        ...(isPlainObject(storedRecord) ? storedRecord : {}),
      }
    : storedRecord;

  if (shouldSeed) {
    markStoredValueSeeded(key);
  }

  if (!isPlainObject(mergedRecord)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(mergedRecord)
      .map(([recordKey, items]) => [
        recordKey,
        normalizeStoredTextItems(items, maxLength, `${idPrefix}-${recordKey}`),
      ])
      .filter(([, items]) => items.length > 0),
  );
};

const normalizePrayer = (prayer) => {
  const normalizedPrayer = normalizeStoredTextItem(prayer, MAX_PRAYER_LENGTH, "prayer");
  if (!normalizedPrayer) {
    return null;
  }

  const prayedCount = Number(prayer.prayedCount);

  return {
    ...normalizedPrayer,
    ...(normalizeAuthor(prayer.author) ? { author: normalizeAuthor(prayer.author) } : {}),
    types: getPrayerTypeIds(prayer),
    prayedCount: Number.isFinite(prayedCount) ? Math.max(0, prayedCount) : 0,
  };
};

const readStoredPrayers = () => {
  const shouldSeed = shouldSeedStoredValue(PRAYERS_STORAGE_KEY);
  const storedPrayers = readStoredValue(PRAYERS_STORAGE_KEY, []);
  const normalizedStoredPrayers = Array.isArray(storedPrayers)
    ? storedPrayers.map(normalizePrayer).filter(Boolean)
    : [];

  if (!shouldSeed) {
    return normalizedStoredPrayers;
  }

  const normalizedDefaultPrayers = defaultPrayers.map(normalizePrayer).filter(Boolean);
  markStoredValueSeeded(PRAYERS_STORAGE_KEY);

  return mergeSeededItems(normalizedStoredPrayers, normalizedDefaultPrayers);
};

const readImageFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });

const readStoredString = (key, fallback = "") => {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeStoredValue = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage is best-effort in this local prototype.
  }
};

const writeStoredString = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser storage is best-effort in this local prototype.
  }
};

const normalizeStudyLog = (log) => {
  if (!isPlainObject(log) || typeof log.body !== "string") {
    return null;
  }

  const body = log.body.trim().slice(0, MAX_STUDY_THOUGHT_LENGTH);
  if (!body) {
    return null;
  }

  return {
    id: typeof log.id === "string" && log.id ? log.id : createLocalId("study-log"),
    body,
    createdAt: normalizeTimestamp(log.createdAt),
    verseReference:
      typeof log.verseReference === "string" && log.verseReference.trim()
        ? log.verseReference.trim()
        : "Daily Scripture",
    verseText:
      typeof log.verseText === "string" && log.verseText.trim()
        ? log.verseText.trim()
        : "",
  };
};

const readStoredStudyLogs = () => {
  const storedLogs = readStoredValue(STUDY_LOGS_STORAGE_KEY, []);

  return Array.isArray(storedLogs)
    ? storedLogs
        .map(normalizeStudyLog)
        .filter(Boolean)
        .sort((firstLog, secondLog) => secondLog.createdAt - firstLog.createdAt)
    : [];
};

const normalizeCommonGroundReviewEntry = (entry) => {
  if (!isPlainObject(entry)) {
    return null;
  }

  const step = commonGroundReviewSteps.find((reviewStep) => reviewStep.id === entry.stepId);
  const rating = commonGroundRatings.includes(entry.rating) ? entry.rating : "";
  const dateKey = typeof entry.dateKey === "string" && entry.dateKey.trim()
    ? entry.dateKey.trim()
    : getLocalDateKey(new Date(normalizeTimestamp(entry.createdAt)));

  if (!step || !rating) {
    return null;
  }

  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : createLocalId("common-review"),
    dateKey,
    stepId: step.id,
    title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : step.title,
    rating,
    note: typeof entry.note === "string" ? entry.note.trim().slice(0, MAX_COMMON_GROUND_NOTE_LENGTH) : "",
    createdAt: normalizeTimestamp(entry.createdAt),
  };
};

const readStoredCommonGroundReviews = () => {
  const storedReviews = readStoredValue(COMMON_GROUND_REVIEW_STORAGE_KEY, []);

  return Array.isArray(storedReviews)
    ? storedReviews
        .map(normalizeCommonGroundReviewEntry)
        .filter(Boolean)
        .sort((firstReview, secondReview) => secondReview.createdAt - firstReview.createdAt)
    : [];
};

const getCommonGroundReviewProgress = (reviews, dateKey) => {
  const completedStepIds = new Set(
    reviews
      .filter((review) => review.dateKey === dateKey)
      .map((review) => review.stepId),
  );
  const nextStepIndex = commonGroundReviewSteps.findIndex(
    (reviewStep) => !completedStepIds.has(reviewStep.id),
  );

  return {
    isComplete: nextStepIndex === -1,
    nextStepIndex: nextStepIndex === -1 ? 0 : nextStepIndex,
  };
};

const getInitialCommonGroundState = () => {
  const reviews = readStoredCommonGroundReviews();
  const progress = getCommonGroundReviewProgress(reviews, getLocalDateKey());

  return {
    activeTab: progress.isComplete ? "notes" : "commandments",
    reviewStepIndex: progress.nextStepIndex,
    reviews,
  };
};

const normalizeDiscussionMessage = (message) => {
  const normalizedMessage = normalizeStoredTextItem(
    message,
    MAX_DISCUSSION_MESSAGE_LENGTH,
    "message",
  );

  if (!normalizedMessage) {
    return null;
  }

  const author = typeof message.author === "string" && message.author.trim()
    ? message.author
    : "You";
  const initials = typeof message.initials === "string" && message.initials.trim()
    ? message.initials.trim().slice(0, 2).toUpperCase()
    : author.trim().slice(0, 1).toUpperCase();

  return {
    ...normalizedMessage,
    author,
    initials,
  };
};

const readDiscussionMessages = () => {
  const shouldSeed = shouldSeedStoredValue(DISCUSSION_MESSAGES_STORAGE_KEY);
  const storedMessages = readStoredValue(DISCUSSION_MESSAGES_STORAGE_KEY, {});

  if (shouldSeed) {
    markStoredValueSeeded(DISCUSSION_MESSAGES_STORAGE_KEY);
  }

  return starterTopics.reduce((messagesByTopic, topic) => {
    const storedTopicMessages = Array.isArray(storedMessages?.[topic.id])
      ? storedMessages[topic.id].map(normalizeDiscussionMessage).filter(Boolean)
      : [];
    const seedTopicMessages = shouldSeed
      ? defaultDiscussionMessages[topic.id].map(normalizeDiscussionMessage).filter(Boolean)
      : [];

    messagesByTopic[topic.id] = shouldSeed
      ? mergeSeededItems(storedTopicMessages, seedTopicMessages)
      : storedTopicMessages;

    return messagesByTopic;
  }, {});
};

const formatPostTime = (createdAt) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));

const formatStudyLogTime = (createdAt) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));

const formatReviewDate = (dateKey) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
  }).format(getDateFromLocalDateKey(dateKey));

const DAILY_VERSE_REFERENCE_YEAR = 2025;

const getLocalDateKey = (date = new Date()) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((datePart) => String(datePart).padStart(2, "0"))
    .join("-");

const getDateFromLocalDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const getMillisecondsUntilNextLocalMidnight = (date = new Date()) => {
  const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return Math.max(nextMidnight.getTime() - date.getTime(), 1000);
};

const getDailyVerseIndex = (date = new Date()) => {
  const month = date.getMonth();
  const monthLength = new Date(DAILY_VERSE_REFERENCE_YEAR, month + 1, 0).getDate();
  const clampedDay = Math.min(date.getDate(), monthLength);

  return Math.floor(
    (Date.UTC(DAILY_VERSE_REFERENCE_YEAR, month, clampedDay) -
      Date.UTC(DAILY_VERSE_REFERENCE_YEAR, 0, 1)) /
      86400000,
  );
};

const getDailyVerse = (date = new Date()) =>
  dailyVerses[getDailyVerseIndex(date) % dailyVerses.length];

const CONTEXT_MENU_WIDTH = 168;
const CONTEXT_MENU_HEIGHT = 52;
const CONTEXT_MENU_GUTTER = 8;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const normalizeBannerScale = (value) => {
  const bannerScale = Number(value);
  return Number.isFinite(bannerScale) ? clamp(bannerScale, 1, 1.8) : 1;
};

const sanitizeImageDataUrl = (value) =>
  typeof value === "string" && value.startsWith("data:image/") ? value : "";

const normalizeProfile = (profile) => {
  const storedProfile = isPlainObject(profile) ? profile : {};

  return {
    ...defaultProfile,
    name: typeof storedProfile.name === "string" && storedProfile.name.trim()
      ? storedProfile.name.trim()
      : defaultProfile.name,
    initials: typeof storedProfile.initials === "string" && storedProfile.initials.trim()
      ? storedProfile.initials.trim().slice(0, 2).toUpperCase()
      : defaultProfile.initials,
    tradition: traditions.includes(storedProfile.tradition)
      ? storedProfile.tradition
      : defaultProfile.tradition,
    verse: typeof storedProfile.verse === "string" && storedProfile.verse.trim()
      ? storedProfile.verse
      : defaultProfile.verse,
    bio: typeof storedProfile.bio === "string" ? storedProfile.bio : defaultProfile.bio,
    avatarImage: sanitizeImageDataUrl(storedProfile.avatarImage),
    avatarBorderColor: normalizeAvatarBorderColor(storedProfile.avatarBorderColor),
    bannerImage: sanitizeImageDataUrl(storedProfile.bannerImage),
    bannerScale: normalizeBannerScale(storedProfile.bannerScale),
  };
};

const readStoredProfile = () =>
  normalizeProfile(readStoredValue(PROFILE_STORAGE_KEY, defaultProfile));

const getCurrentUserAuthor = (profile, handle = "@testing") => ({
  ...defaultProfile,
  ...profile,
  id: "current-user",
  name: "You",
  profileName: profile?.name || defaultProfile.name,
  handle,
  initials: profile?.initials || defaultProfile.initials,
  avatarImage: profile?.avatarImage || "",
  avatarBorderColor: normalizeAvatarBorderColor(profile?.avatarBorderColor),
});

const getContentAuthor = (item, profile, options = {}) =>
  normalizeAuthor(item?.author) ?? getCurrentUserAuthor(profile, options.handle);

const getDiscussionMessageAuthor = (message, profile) => {
  if (message?.author === "You") {
    return getCurrentUserAuthor(profile);
  }

  const storedAuthor = normalizeAuthor(message?.authorProfile);
  if (storedAuthor) {
    return storedAuthor;
  }

  const authorName = typeof message?.author === "string" ? message.author.trim() : "";
  const knownAuthor = Object.values(testAuthors).find((author) => {
    const [firstName] = author.name.split(" ");
    return author.name === authorName || firstName === authorName || author.initials === message?.initials;
  });

  if (knownAuthor) {
    return normalizeAuthor(knownAuthor);
  }

  return normalizeAuthor({
    id: `discussion-${authorName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "guest"}`,
    name: authorName || "Community Member",
    handle: `@${(authorName || "community.member")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")}`,
    initials: typeof message?.initials === "string" && message.initials.trim()
      ? message.initials.trim().slice(0, 2).toUpperCase()
      : getInitials(authorName, "CM"),
    bio: "Joining the discussion with curiosity and care.",
    tradition: "Exploring",
    verse: "Ephesians 4:2",
  });
};

const isOwnContent = (item) => !normalizeAuthor(item?.author);

const readStoredHouseSelection = () => {
  const storedHouseId = readStoredString(HOUSE_SELECTION_STORAGE_KEY);
  return getHouseById(storedHouseId) ? storedHouseId : "";
};

const readStoredHousePosts = () => {
  const storedHousePosts = readStoredValue(HOUSE_POSTS_STORAGE_KEY, {});
  const shouldSeed = shouldSeedStoredValue(HOUSE_POSTS_STORAGE_KEY);

  if (shouldSeed) {
    markStoredValueSeeded(HOUSE_POSTS_STORAGE_KEY);
  }

  return christianHouses.reduce((postsByHouse, house) => {
    const storedPosts = Array.isArray(storedHousePosts?.[house.id])
      ? normalizeStoredTextItems(
          storedHousePosts[house.id],
          MAX_POST_LENGTH,
          `${house.id}-post`,
        )
      : [];
    const seededPosts = shouldSeed
      ? normalizeStoredTextItems(defaultHousePosts[house.id], MAX_POST_LENGTH, `${house.id}-seed`)
      : [];

    postsByHouse[house.id] = shouldSeed ? mergeSeededItems(storedPosts, seededPosts) : storedPosts;

    return postsByHouse;
  }, {});
};

const getContextMenuPosition = (event) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const minimumX = CONTEXT_MENU_WIDTH / 2 + CONTEXT_MENU_GUTTER;
  const minimumY = CONTEXT_MENU_HEIGHT + CONTEXT_MENU_GUTTER;
  const maximumX = Math.max(
    minimumX,
    viewportWidth - CONTEXT_MENU_WIDTH / 2 - CONTEXT_MENU_GUTTER,
  );
  const maximumY = Math.max(
    minimumY,
    viewportHeight - CONTEXT_MENU_GUTTER,
  );

  return {
    x: clamp(event.clientX, minimumX, maximumX),
    y: clamp(event.clientY, minimumY, maximumY),
  };
};

function DeleteContextMenu({ label, menu, onClose, onDelete }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    setIsReady(false);
    const revealTimer = window.setTimeout(() => setIsReady(true), 500);
    const handleClose = () => {
      window.clearTimeout(revealTimer);
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("click", handleClose);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(revealTimer);
      window.removeEventListener("click", handleClose);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu || !isReady) {
    return null;
  }

  const handleDelete = (event) => {
    event.stopPropagation();
    onDelete(menu);
    onClose();
  };

  return createPortal(
    <div
      className="context-menu"
      role="menu"
      style={{
        left: menu.x,
        top: menu.y,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={handleDelete}>
        {label}
      </button>
    </div>,
    document.body,
  );
}

function PostActionsMenu({
  buttonLabel = "Post options",
  deleteLabel = "Delete post",
  editLabel = "Edit post",
  isOpen,
  onClose,
  onDelete,
  onEdit,
  onToggle,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickAway = (event) => {
      if (menuRef.current?.contains(event.target)) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("click", handleClickAway);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", handleClickAway);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleEdit = (event) => {
    event.stopPropagation();
    onEdit();
    onClose();
  };

  const handleDelete = (event) => {
    event.stopPropagation();
    onDelete();
    onClose();
  };

  return (
    <div className="post-action-shell" ref={menuRef}>
      <button
        className="post-action-button"
        type="button"
        aria-label={buttonLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className="post-action-menu" role="menu">
          <button type="button" role="menuitem" onClick={handleEdit}>
            {editLabel}
          </button>
          <button
            className="is-danger"
            type="button"
            role="menuitem"
            onClick={handleDelete}
          >
            {deleteLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PostEditDialog({
  accent,
  maxLength = MAX_POST_LENGTH,
  onClose,
  onSave,
  post,
  textareaLabel = "Edit post text",
  title = "Edit post",
}) {
  const [draft, setDraft] = useState(post?.body ?? "");
  const trimmedDraft = draft.trim();
  const remainingCharacters = maxLength - draft.length;

  useEffect(() => {
    setDraft(post?.body ?? "");
  }, [post]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!post) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!trimmedDraft) {
      return;
    }

    onSave(trimmedDraft);
  };

  return createPortal(
    <div className="post-edit-layer" role="presentation" onMouseDown={onClose}>
      <form
        className="post-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-edit-title"
        style={accent ? { "--post-edit-accent": accent } : undefined}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="post-edit-header">
          <p id="post-edit-title">{title}</p>
          <button className="post-edit-close" type="button" aria-label="Cancel edit" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <textarea
          aria-label={textareaLabel}
          maxLength={maxLength}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />

        <div className="post-edit-actions">
          <span className={remainingCharacters < 30 ? "counter is-low" : "counter"}>
            {remainingCharacters}
          </span>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!trimmedDraft}>
            Save
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function CloseIcon() {
  return (
    <svg className="close-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.2 7.2 16.8 16.8M16.8 7.2 7.2 16.8" />
    </svg>
  );
}

function UserAvatar({ className = "", profile }) {
  const initials = profile?.initials || getInitials(profile?.name, defaultProfile.initials);
  const avatarBorderColor = normalizeAvatarBorderColor(profile?.avatarBorderColor);

  return (
    <div
      className={`avatar ${className}`.trim()}
      style={{ "--avatar-border-color": avatarBorderColor }}
      aria-hidden="true"
    >
      {profile?.avatarImage ? <img src={profile.avatarImage} alt="" /> : initials}
    </div>
  );
}

function ProfileAvatarButton({
  avatarClassName = "",
  buttonClassName = "",
  onOpenProfile,
  profile,
}) {
  const profileName = profile?.profileName || profile?.name || defaultProfile.name;

  if (!onOpenProfile) {
    return <UserAvatar className={avatarClassName} profile={profile} />;
  }

  return (
    <button
      className={`avatar-link ${buttonClassName}`.trim()}
      type="button"
      aria-label={`Open ${profileName} profile`}
      onClick={(event) => {
        event.stopPropagation();
        onOpenProfile(profile);
      }}
    >
      <UserAvatar className={avatarClassName} profile={profile} />
    </button>
  );
}

function useDailyVerse() {
  const [localDateKey, setLocalDateKey] = useState(() => getLocalDateKey());

  useEffect(() => {
    let midnightTimer = null;

    const refreshVerseDate = () => {
      setLocalDateKey(getLocalDateKey());
    };

    const scheduleMidnightRefresh = () => {
      midnightTimer = window.setTimeout(() => {
        refreshVerseDate();
        scheduleMidnightRefresh();
      }, getMillisecondsUntilNextLocalMidnight());
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshVerseDate();
      }
    };

    scheduleMidnightRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(midnightTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return useMemo(() => getDailyVerse(getDateFromLocalDateKey(localDateKey)), [localDateKey]);
}

function Onboarding({ onContinue }) {
  const [canContinue, setCanContinue] = useState(false);
  const glassLayout = useMemo(
    () => glassLayouts[Math.floor(Math.random() * glassLayouts.length)],
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setCanContinue(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="onboarding-shell" aria-labelledby="welcome-title">
      <div className="chapel-sky" aria-hidden="true">
        <span className="sunbeam sunbeam-one" />
        <span className="sunbeam sunbeam-two" />
        <span
          className="glass-piece glass-piece-gold"
          style={{
            top: glassLayout.gold.top,
            left: glassLayout.gold.left,
            right: glassLayout.gold.right,
            bottom: glassLayout.gold.bottom,
            "--piece-rotation": glassLayout.gold.rotation,
            "--piece-scale": glassLayout.gold.scale,
          }}
        />
        <span
          className="glass-piece glass-piece-teal"
          style={{
            top: glassLayout.teal.top,
            left: glassLayout.teal.left,
            right: glassLayout.teal.right,
            bottom: glassLayout.teal.bottom,
            "--piece-rotation": glassLayout.teal.rotation,
            "--piece-scale": glassLayout.teal.scale,
          }}
        />
        <span
          className="glass-piece glass-piece-rose"
          style={{
            top: glassLayout.rose.top,
            left: glassLayout.rose.left,
            right: glassLayout.rose.right,
            bottom: glassLayout.rose.bottom,
            "--piece-rotation": glassLayout.rose.rotation,
            "--piece-scale": glassLayout.rose.scale,
          }}
        />
      </div>

      <section className="welcome-panel">
        <p className="eyebrow">Christian Community</p>
        <h1 id="welcome-title">Stand in Christ</h1>
        <p className="welcome-motto">Walk in truth, speak with love.</p>
        <p className="welcome-copy">
          A small Christian community space for gracious conversation, prayer,
          and remembering that Jesus is greater than our divisions.
        </p>

        <div className="stained-window" aria-hidden="true">
          <span className="window-arch" />
          <span className="window-divider" />
          <span className="window-cross" />
        </div>
      </section>

      <button
        className={`next-button ${canContinue ? "is-visible" : ""}`}
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
      >
        Next
      </button>
    </main>
  );
}

function Drawer({ activeSection, isOpen, onClose, onSelectSection }) {
  const dailyVerse = useDailyVerse();

  const handleSelectSection = (sectionId) => {
    onSelectSection(sectionId);
    onClose();
  };

  return (
    <>
      <button
        className={`drawer-backdrop ${isOpen ? "is-open" : ""}`}
        type="button"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className={`side-drawer ${isOpen ? "is-open" : ""}`} aria-label="App sections">
        <div className="drawer-header">
          <div>
            <p className="drawer-kicker">Sections</p>
            <h2>Stand in Christ</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close menu" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <nav className="section-list" aria-label="Stand in Christ sections">
          {sections.map((section) => (
            <button
              className={`section-item ${activeSection === section.id ? "is-active" : ""}`}
              type="button"
              key={section.id}
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={() => handleSelectSection(section.id)}
            >
              <span>{section.label}</span>
            </button>
          ))}
        </nav>

        <section className="daily-verse-card" aria-label="Daily Bible verse">
          <div className="drawer-cross" aria-hidden="true" />
          <p>Daily Bible Verse</p>
          <blockquote>{dailyVerse.text}</blockquote>
          <cite>{dailyVerse.reference} · WEB</cite>
        </section>
      </aside>
    </>
  );
}

function Composer({ onOpenProfile, onPost, profile }) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();
  const remainingCharacters = MAX_POST_LENGTH - draft.length;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!trimmedDraft) {
      return;
    }

    onPost(trimmedDraft);
    setDraft("");
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <ProfileAvatarButton onOpenProfile={onOpenProfile} profile={profile} />
      <div className="composer-main">
        <textarea
          aria-label="Create a post"
          maxLength={MAX_POST_LENGTH}
          placeholder="What’s on your heart?"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="composer-actions">
          <span className={remainingCharacters < 30 ? "counter is-low" : "counter"}>
            {remainingCharacters}
          </span>
          <button type="submit" disabled={!trimmedDraft}>
            Post
          </button>
        </div>
      </div>
    </form>
  );
}

function PostMeta({ author, createdAt }) {
  return (
    <header>
      <strong>{author.name}</strong>
      <span>{author.handle}</span>
      <span>{formatPostTime(createdAt)}</span>
    </header>
  );
}

function PostItem({
  commentCount,
  isMenuOpen,
  onDelete,
  onEdit,
  onMenuClose,
  onMenuToggle,
  onOpenProfile,
  onOpen,
  post,
  profile,
}) {
  const author = getContentAuthor(post, profile);
  const canManagePost = isOwnContent(post);

  return (
    <article
      className={`post-item ${isMenuOpen ? "has-open-menu" : ""}`}
    >
      <ProfileAvatarButton
        avatarClassName="avatar-small"
        onOpenProfile={onOpenProfile}
        profile={author}
      />
      <button
        className="post-open-button"
        type="button"
        aria-label={`Open post: ${post.body}`}
        onClick={() => onOpen(post.id)}
      >
        <div className="post-content">
          <PostMeta author={author} createdAt={post.createdAt} />
          <p>{post.body}</p>
          <span className="post-comment-count">
            {commentCount === 1 ? "1 comment" : `${commentCount} comments`}
          </span>
        </div>
      </button>
      {canManagePost ? (
        <PostActionsMenu
          isOpen={isMenuOpen}
          onClose={onMenuClose}
          onDelete={() => onDelete(post.id)}
          onEdit={() => onEdit(post.id)}
          onToggle={() => onMenuToggle(post.id)}
        />
      ) : null}
    </article>
  );
}

function HomeSection({
  commentsByPost,
  onAddComment,
  onDeleteComment,
  onDeletePost,
  onEditComment,
  onEditPost,
  onOpenProfile,
  posts,
  onPost,
  profile,
}) {
  const [activePostId, setActivePostId] = useState(null);
  const [postActionMenuId, setPostActionMenuId] = useState(null);
  const [commentActionMenuId, setCommentActionMenuId] = useState(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const sortedPosts = useMemo(
    () => posts.toSorted((firstPost, secondPost) => secondPost.createdAt - firstPost.createdAt),
    [posts],
  );
  const activePost = posts.find((post) => post.id === activePostId);
  const editingPost = posts.find((post) => post.id === editingPostId);
  const activePostComments = activePost && Array.isArray(commentsByPost[activePost.id])
    ? commentsByPost[activePost.id]
    : [];
  const editingComment = activePostComments.find((comment) => comment.id === editingCommentId);

  const deletePost = (postId) => {
    onDeletePost(postId);
    setActivePostId((currentPostId) => (currentPostId === postId ? null : currentPostId));
    setPostActionMenuId(null);
    setCommentActionMenuId(null);
    setEditingPostId((currentPostId) => (currentPostId === postId ? null : currentPostId));
    setEditingCommentId(null);
  };

  const deleteComment = (commentId) => {
    onDeleteComment(commentId);
    setCommentActionMenuId(null);
    setEditingCommentId((currentCommentId) =>
      currentCommentId === commentId ? null : currentCommentId,
    );
  };

  const editPost = (postId) => {
    setCommentActionMenuId(null);
    setPostActionMenuId(null);
    setEditingPostId(postId);
  };

  const editComment = (commentId) => {
    setPostActionMenuId(null);
    setCommentActionMenuId(null);
    setEditingCommentId(commentId);
  };

  const savePostEdit = (body) => {
    if (!editingPostId) {
      return;
    }

    onEditPost(editingPostId, body);
    setEditingPostId(null);
  };

  const saveCommentEdit = (body) => {
    if (!editingCommentId) {
      return;
    }

    onEditComment(editingCommentId, body);
    setEditingCommentId(null);
  };

  if (activePost) {
    return (
      <>
        <PostDetail
          comments={activePostComments}
          commentActionMenuId={commentActionMenuId}
          onBack={() => setActivePostId(null)}
          onComment={onAddComment}
          onCommentDelete={deleteComment}
          onCommentEdit={editComment}
          onCommentMenuClose={() => setCommentActionMenuId(null)}
          onCommentMenuToggle={(commentId) =>
            setCommentActionMenuId((currentCommentId) =>
              currentCommentId === commentId ? null : commentId,
            )
          }
          onDeletePost={deletePost}
          onEditPost={editPost}
          onMenuClose={() => setPostActionMenuId(null)}
          onMenuToggle={(postId) =>
            setPostActionMenuId((currentPostId) => (currentPostId === postId ? null : postId))
          }
          onOpenProfile={onOpenProfile}
          postActionMenuId={postActionMenuId}
          post={activePost}
          profile={profile}
        />
        <PostEditDialog
          onClose={() => setEditingPostId(null)}
          onSave={savePostEdit}
          post={editingPost}
        />
        <PostEditDialog
          maxLength={MAX_COMMENT_LENGTH}
          onClose={() => setEditingCommentId(null)}
          onSave={saveCommentEdit}
          post={editingComment}
          textareaLabel="Edit reply text"
          title="Edit reply"
        />
      </>
    );
  }

  return (
    <>
      <Composer onOpenProfile={onOpenProfile} onPost={onPost} profile={profile} />

      <div className="feed-divider" />

      {sortedPosts.length > 0 ? (
        <div aria-label="Posts">
          {sortedPosts.map((post) => (
            <PostItem
              commentCount={
                Array.isArray(commentsByPost[post.id]) ? commentsByPost[post.id].length : 0
              }
              isMenuOpen={postActionMenuId === post.id}
              onDelete={deletePost}
              onEdit={editPost}
              onMenuClose={() => setPostActionMenuId(null)}
              onMenuToggle={(postId) =>
                setPostActionMenuId((currentPostId) =>
                  currentPostId === postId ? null : postId,
                )
              }
              onOpenProfile={onOpenProfile}
              onOpen={setActivePostId}
              post={post}
              profile={profile}
              key={post.id}
            />
          ))}
        </div>
      ) : (
        <section className="empty-feed">
          <p>Start the first test post.</p>
          <span>
            Share a thought, a prayer, or a question. It will stay on this
            browser while we prototype.
          </span>
        </section>
      )}
      <PostEditDialog
        onClose={() => setEditingPostId(null)}
        onSave={savePostEdit}
        post={editingPost}
      />
    </>
  );
}

function CommentComposer({ onComment, onOpenProfile, postId, profile }) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();
  const remainingCharacters = MAX_COMMENT_LENGTH - draft.length;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!trimmedDraft) {
      return;
    }

    onComment(postId, trimmedDraft);
    setDraft("");
  };

  return (
    <form className="comment-composer" onSubmit={handleSubmit}>
      <ProfileAvatarButton
        avatarClassName="avatar-small"
        onOpenProfile={onOpenProfile}
        profile={profile}
      />
      <div className="comment-composer-main">
        <textarea
          aria-label="Write a comment"
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="Write a gracious comment..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="composer-actions">
          <span className={remainingCharacters < 30 ? "counter is-low" : "counter"}>
            {remainingCharacters}
          </span>
          <button type="submit" disabled={!trimmedDraft}>
            Comment
          </button>
        </div>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  isMenuOpen,
  onDelete,
  onEdit,
  onMenuClose,
  onMenuToggle,
  onOpenProfile,
  profile,
}) {
  const author = getContentAuthor(comment, profile);
  const canManageComment = isOwnContent(comment);

  return (
    <article className={`comment-item ${isMenuOpen ? "has-open-menu" : ""}`}>
      <ProfileAvatarButton
        avatarClassName="avatar-small"
        onOpenProfile={onOpenProfile}
        profile={author}
      />
      <div className="comment-content">
        <header>
          <strong>{author.name}</strong>
          <span>{author.handle}</span>
          <span>{formatPostTime(comment.createdAt)}</span>
        </header>
        <p>{comment.body}</p>
      </div>
      {canManageComment ? (
        <PostActionsMenu
          buttonLabel="Reply options"
          deleteLabel="Delete reply"
          editLabel="Edit reply"
          isOpen={isMenuOpen}
          onClose={onMenuClose}
          onDelete={() => onDelete(comment.id)}
          onEdit={() => onEdit(comment.id)}
          onToggle={() => onMenuToggle(comment.id)}
        />
      ) : null}
    </article>
  );
}

function PostDetail({
  comments,
  onDeletePost,
  onEditPost,
  onBack,
  onComment,
  onCommentDelete,
  onCommentEdit,
  onCommentMenuClose,
  onCommentMenuToggle,
  commentActionMenuId,
  onMenuClose,
  onMenuToggle,
  onOpenProfile,
  postActionMenuId,
  post,
  profile,
}) {
  const author = getContentAuthor(post, profile);
  const canManagePost = isOwnContent(post);
  const sortedComments = useMemo(
    () =>
      comments.toSorted(
        (firstComment, secondComment) => firstComment.createdAt - secondComment.createdAt,
      ),
    [comments],
  );

  return (
    <section className="post-detail" aria-labelledby="post-detail-title">
      <button className="room-back-button" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span>
        Home
      </button>

      <article className="post-detail-card">
        <ProfileAvatarButton onOpenProfile={onOpenProfile} profile={author} />
        <div className="post-detail-content">
          <PostMeta author={author} createdAt={post.createdAt} />
          <h2 id="post-detail-title">{post.body}</h2>
          <span className="post-detail-count">
            {comments.length === 1 ? "1 comment" : `${comments.length} comments`}
          </span>
        </div>
        {canManagePost ? (
          <PostActionsMenu
            isOpen={postActionMenuId === post.id}
            onClose={onMenuClose}
            onDelete={() => onDeletePost(post.id)}
            onEdit={() => onEditPost(post.id)}
            onToggle={() => onMenuToggle(post.id)}
          />
        ) : null}
      </article>

      <CommentComposer
        onComment={onComment}
        onOpenProfile={onOpenProfile}
        postId={post.id}
        profile={profile}
      />

      <div className="comment-list" aria-label="Post comments">
        {sortedComments.length > 0 ? (
          sortedComments.map((comment) => (
            <CommentItem
              comment={comment}
              isMenuOpen={commentActionMenuId === comment.id}
              key={comment.id}
              onDelete={onCommentDelete}
              onEdit={onCommentEdit}
              onMenuClose={onCommentMenuClose}
              onMenuToggle={onCommentMenuToggle}
              onOpenProfile={onOpenProfile}
              profile={profile}
            />
          ))
        ) : (
          <section className="empty-comments">
            <p>No comments yet.</p>
            <span>Be the first to answer with patience and love.</span>
          </section>
        )}
      </div>
    </section>
  );
}

function PrayerWall({ prayers, profile, onAddPrayer, onOpenProfile, onPrayed }) {
  const [draft, setDraft] = useState("");
  const [selectedPrayerTypeIds, setSelectedPrayerTypeIds] = useState(defaultPrayerTypeIds);
  const [prayerTypePickerOpen, setPrayerTypePickerOpen] = useState(false);
  const [dismissingPrayerIds, setDismissingPrayerIds] = useState([]);
  const prayerTypePickerRef = useRef(null);
  const prayerTypeSizerRef = useRef(null);
  const prayerDismissalTimersRef = useRef(new Map());
  const [prayerTypeTriggerWidth, setPrayerTypeTriggerWidth] = useState(null);
  const trimmedDraft = draft.trim();
  const remainingCharacters = MAX_PRAYER_LENGTH - draft.length;
  const selectedPrayerTypeLabels = selectedPrayerTypeIds
    .map((typeId) => getPrayerType(typeId).label)
    .join(", ");
  const [visiblePrayerTypeLabels, setVisiblePrayerTypeLabels] = useState(selectedPrayerTypeLabels);
  const [isPrayerTypeLabelChanging, setIsPrayerTypeLabelChanging] = useState(false);
  const prayerTypeLabelLength = selectedPrayerTypeLabels.length;
  const prayerTypeTriggerSize =
    prayerTypeLabelLength >= 25
      ? "label-tightest"
        : prayerTypeLabelLength >= 20
          ? "label-tight"
          : prayerTypeLabelLength >= 15
            ? "label-balanced"
            : "label-roomy";
  const prayerTypeTriggerBaseClassName = `prayer-type-trigger ${
    selectedPrayerTypeIds.length > 2 ? "is-condensed" : ""
  } ${prayerTypeTriggerSize}`;
  const prayerTypeTriggerClassName = `${prayerTypeTriggerBaseClassName} ${
    isPrayerTypeLabelChanging ? "is-label-changing" : ""
  }`;
  const sortedPrayers = useMemo(
    () =>
      prayers.toSorted((firstPrayer, secondPrayer) => secondPrayer.createdAt - firstPrayer.createdAt),
    [prayers],
  );

  useEffect(() => {
    if (!prayerTypePickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!prayerTypePickerRef.current?.contains(event.target)) {
        setPrayerTypePickerOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPrayerTypePickerOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [prayerTypePickerOpen]);

  useLayoutEffect(() => {
    const sizer = prayerTypeSizerRef.current;
    if (!sizer) {
      return undefined;
    }

    const updateTriggerWidth = () => {
      setPrayerTypeTriggerWidth(Math.ceil(sizer.getBoundingClientRect().width));
    };

    updateTriggerWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTriggerWidth);

      return () => {
        window.removeEventListener("resize", updateTriggerWidth);
      };
    }

    const resizeObserver = new ResizeObserver(updateTriggerWidth);
    resizeObserver.observe(sizer);
    window.addEventListener("resize", updateTriggerWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateTriggerWidth);
    };
  }, [prayerTypeTriggerBaseClassName, selectedPrayerTypeLabels]);

  useEffect(() => {
    if (visiblePrayerTypeLabels === selectedPrayerTypeLabels) {
      setIsPrayerTypeLabelChanging(false);

      return undefined;
    }

    setIsPrayerTypeLabelChanging(true);

    const labelSwapTimer = window.setTimeout(() => {
      setVisiblePrayerTypeLabels(selectedPrayerTypeLabels);
    }, 85);

    return () => {
      window.clearTimeout(labelSwapTimer);
    };
  }, [selectedPrayerTypeLabels, visiblePrayerTypeLabels]);

  useEffect(
    () => () => {
      prayerDismissalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      prayerDismissalTimersRef.current.clear();
    },
    [],
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!trimmedDraft) {
      return;
    }

    onAddPrayer(trimmedDraft, selectedPrayerTypeIds);
    setDraft("");
    setPrayerTypePickerOpen(false);
  };

  const togglePrayerType = (typeId) => {
    const prayerType = getPrayerType(typeId);

    setSelectedPrayerTypeIds((currentTypeIds) => {
      if (prayerType.group === "visibility") {
        return [
          typeId,
          ...currentTypeIds.filter((currentTypeId) => getPrayerType(currentTypeId).group !== "visibility"),
        ];
      }

      if (currentTypeIds.includes(typeId)) {
        return currentTypeIds.filter((currentTypeId) => currentTypeId !== typeId);
      }

      return [...currentTypeIds, typeId];
    });
  };

  const handlePrayed = (prayerId) => {
    if (prayerDismissalTimersRef.current.has(prayerId)) {
      return;
    }

    setDismissingPrayerIds((currentIds) => [...new Set([...currentIds, prayerId])]);
    const dismissalTimer = window.setTimeout(() => {
      onPrayed(prayerId);
      prayerDismissalTimersRef.current.delete(prayerId);
      setDismissingPrayerIds((currentIds) => currentIds.filter((id) => id !== prayerId));
    }, 420);
    prayerDismissalTimersRef.current.set(prayerId, dismissalTimer);
  };

  return (
    <section className="section-surface" aria-labelledby="prayer-title">
      <div className="section-intro">
        <p className="section-kicker">Prayer Wall</p>
        <h2 id="prayer-title">Carry one another gently.</h2>
        <span>Nail a prayer board to the wall, then let it lift away once someone has prayed.</span>
      </div>

      <form className="quiet-form" onSubmit={handleSubmit}>
        <textarea
          aria-label="Prayer request"
          maxLength={MAX_PRAYER_LENGTH}
          placeholder="What can we pray for?"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="composer-actions">
          <span className={remainingCharacters < 30 ? "counter is-low" : "counter"}>
            {remainingCharacters}
          </span>
          <div
            className="prayer-type-picker"
            ref={prayerTypePickerRef}
            style={
              prayerTypeTriggerWidth
                ? { "--prayer-trigger-width": `${prayerTypeTriggerWidth}px` }
                : undefined
            }
          >
            <button
              className={prayerTypeTriggerClassName}
              type="button"
              aria-expanded={prayerTypePickerOpen}
              aria-haspopup="true"
              aria-label={`Prayer options: ${selectedPrayerTypeLabels}`}
              onClick={() => setPrayerTypePickerOpen((isOpen) => !isOpen)}
            >
              <span>Share as</span>
              <strong>{visiblePrayerTypeLabels}</strong>
            </button>
            <div
              className={`${prayerTypeTriggerBaseClassName} prayer-type-trigger-sizer`}
              aria-hidden="true"
              ref={prayerTypeSizerRef}
            >
              <span>Share as</span>
              <strong>{selectedPrayerTypeLabels}</strong>
            </div>
            {prayerTypePickerOpen ? (
              <div className="prayer-type-options" role="group" aria-label="Prayer types">
                {prayerTypes.map((prayerType) => (
                  <button
                    className={selectedPrayerTypeIds.includes(prayerType.id) ? "is-selected" : ""}
                    type="button"
                    aria-pressed={selectedPrayerTypeIds.includes(prayerType.id)}
                    key={prayerType.id}
                    onClick={() => togglePrayerType(prayerType.id)}
                  >
                    {prayerType.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="submit" disabled={!trimmedDraft}>
            Share Prayer
          </button>
        </div>
      </form>

      {sortedPrayers.length > 0 ? (
        <div className="prayer-wall-board" aria-label="Prayer requests">
          {sortedPrayers.map((prayer, index) => {
            const currentPrayerTypeIds = getPrayerTypeIds(prayer);
            const isAnonymous = currentPrayerTypeIds.includes("anonymous");
            const isUrgent = currentPrayerTypeIds.includes("urgent");
            const author = getContentAuthor(prayer, profile);
            return (
              <article
                className={`prayer-note prayer-note-${index % 4} ${
                  isUrgent ? "prayer-note-urgent" : ""
                } ${
                  dismissingPrayerIds.includes(prayer.id) ? "is-peeling" : ""
                }`}
                key={prayer.id}
              >
                {!isAnonymous ? (
                  <ProfileAvatarButton
                    avatarClassName="avatar-small prayer-author-avatar"
                    buttonClassName="prayer-author-button"
                    onOpenProfile={onOpenProfile}
                    profile={author}
                  />
                ) : null}
                <div className="prayer-note-body">
                  <div className="prayer-type-badges" aria-label="Prayer labels">
                    {currentPrayerTypeIds.map((typeId) => {
                      const prayerType = getPrayerType(typeId);

                      return (
                        <span className={`prayer-type-badge prayer-type-${typeId}`} key={typeId}>
                          {prayerType.label}
                        </span>
                      );
                    })}
                  </div>
                  <p>{prayer.body}</p>
                </div>
                <div className="prayer-note-footer">
                  <span>{prayer.prayedCount} prayed so far</span>
                  <button
                    type="button"
                    disabled={dismissingPrayerIds.includes(prayer.id)}
                    onClick={() => handlePrayed(prayer.id)}
                  >
                    I prayed
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="empty-feed empty-feed-prayer">
          <p>The wall is clear for now.</p>
          <span>Pin the first prayer note and start filling the wall with care.</span>
        </section>
      )}
    </section>
  );
}

function DiscussionRoom({
  messageActionMenuId,
  messages,
  onBack,
  onMessageDelete,
  onMessageEdit,
  onMessageMenuClose,
  onMessageMenuToggle,
  onOpenProfile,
  onSendMessage,
  profile,
  topic,
}) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();
  const remainingCharacters = MAX_DISCUSSION_MESSAGE_LENGTH - draft.length;

  const sendDraft = () => {
    if (!trimmedDraft) {
      return;
    }

    onSendMessage(topic.id, trimmedDraft);
    setDraft("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendDraft();
  };

  const handleDraftKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    sendDraft();
  };

  return (
    <section className="discussion-room" aria-labelledby="discussion-room-title">
      <button className="room-back-button" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span>
        Discussions
      </button>

      <header className="room-header">
        <p className="section-kicker">{topic.meta}</p>
        <h2 id="discussion-room-title">{topic.title}</h2>
        <p>{topic.body}</p>
        <span>Based on: {topic.basedOn}</span>
      </header>

      <div className="chat-thread" aria-label={`${topic.title} chat`}>
        {messages.map((message) => {
          const author = getDiscussionMessageAuthor(message, profile);
          const canManageMessage = message.author === "You";

          return (
            <article
              className={`chat-message ${canManageMessage ? "is-own" : ""}`}
              key={message.id}
            >
              <ProfileAvatarButton
                avatarClassName="chat-avatar"
                onOpenProfile={onOpenProfile}
                profile={author}
              />
              <div className="chat-message-main">
                <div className="chat-message-meta">
                  <strong>{message.author}</strong>
                  <span>{formatPostTime(message.createdAt)}</span>
                </div>
                <p>{message.body}</p>
              </div>
              {canManageMessage ? (
                <PostActionsMenu
                  buttonLabel="Reply options"
                  deleteLabel="Delete reply"
                  editLabel="Edit reply"
                  isOpen={messageActionMenuId === message.id}
                  onClose={onMessageMenuClose}
                  onDelete={() => onMessageDelete(message.id)}
                  onEdit={() => onMessageEdit(message.id)}
                  onToggle={() => onMessageMenuToggle(message.id)}
                />
              ) : null}
            </article>
          );
        })}
      </div>

      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          aria-label="Discussion message"
          maxLength={MAX_DISCUSSION_MESSAGE_LENGTH}
          placeholder="Share a thoughtful reply..."
          value={draft}
          onKeyDown={handleDraftKeyDown}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="composer-actions">
          <span className={remainingCharacters < 40 ? "counter is-low" : "counter"}>
            {remainingCharacters}
          </span>
          <button type="submit" disabled={!trimmedDraft}>
            Send
          </button>
        </div>
      </form>
    </section>
  );
}

function DiscussionsSection({ onOpenProfile, profile }) {
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [messageActionMenuId, setMessageActionMenuId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [messagesByTopic, setMessagesByTopic] = useState(readDiscussionMessages);
  const activeTopic = starterTopics.find((topic) => topic.id === activeTopicId);
  const activeMessages = activeTopic ? messagesByTopic[activeTopic.id] ?? [] : [];
  const editingMessage = activeMessages.find((message) => message.id === editingMessageId);

  useEffect(() => {
    writeStoredValue(DISCUSSION_MESSAGES_STORAGE_KEY, messagesByTopic);
  }, [messagesByTopic]);

  const addMessage = (topicId, body) => {
    setMessagesByTopic((currentMessagesByTopic) => ({
      ...currentMessagesByTopic,
      [topicId]: [
        ...(currentMessagesByTopic[topicId] ?? []),
        {
          id: createLocalId("message"),
          author: "You",
          initials: "Y",
          body,
          createdAt: Date.now(),
        },
      ],
    }));
  };

  const deleteMessage = (messageId) => {
    if (!activeTopic) {
      return;
    }

    setMessagesByTopic((currentMessagesByTopic) => ({
      ...currentMessagesByTopic,
      [activeTopic.id]: (currentMessagesByTopic[activeTopic.id] ?? []).filter(
        (message) => message.id !== messageId,
      ),
    }));
    setMessageActionMenuId(null);
    setEditingMessageId((currentMessageId) =>
      currentMessageId === messageId ? null : currentMessageId,
    );
  };

  const editMessage = (messageId) => {
    setMessageActionMenuId(null);
    setEditingMessageId(messageId);
  };

  const saveMessageEdit = (body) => {
    if (!activeTopic || !editingMessageId) {
      return;
    }

    setMessagesByTopic((currentMessagesByTopic) => ({
      ...currentMessagesByTopic,
      [activeTopic.id]: (currentMessagesByTopic[activeTopic.id] ?? []).map((message) =>
        message.id === editingMessageId ? { ...message, body } : message,
      ),
    }));
    setEditingMessageId(null);
  };

  if (activeTopic) {
    return (
      <section className="section-surface" aria-labelledby="discussion-room-title">
        <DiscussionRoom
          messageActionMenuId={messageActionMenuId}
          messages={activeMessages}
          onBack={() => {
            setMessageActionMenuId(null);
            setEditingMessageId(null);
            setActiveTopicId(null);
          }}
          onMessageDelete={deleteMessage}
          onMessageEdit={editMessage}
          onMessageMenuClose={() => setMessageActionMenuId(null)}
          onMessageMenuToggle={(messageId) =>
            setMessageActionMenuId((currentMessageId) =>
              currentMessageId === messageId ? null : messageId,
            )
          }
          onOpenProfile={onOpenProfile}
          onSendMessage={addMessage}
          profile={profile}
          topic={activeTopic}
        />
        <PostEditDialog
          maxLength={MAX_DISCUSSION_MESSAGE_LENGTH}
          onClose={() => setEditingMessageId(null)}
          onSave={saveMessageEdit}
          post={editingMessage}
          textareaLabel="Edit reply text"
          title="Edit discussion reply"
        />
      </section>
    );
  }

  return (
    <section className="section-surface" aria-labelledby="discussions-title">
      <div className="section-intro">
        <p className="section-kicker">Discussions</p>
        <h2 id="discussions-title">Truth-seeking, without the heat.</h2>
        <span>Prototype discussion rooms for careful questions and gracious disagreement.</span>
      </div>

      <div className="topic-list" aria-label="Discussion topics">
        {starterTopics.map((topic) => (
          <button
            className="topic-row"
            type="button"
            key={topic.id}
            onClick={() => setActiveTopicId(topic.id)}
          >
            <span>{topic.meta}</span>
            <strong>{topic.title}</strong>
            <small>{topic.replies} replies</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function BibleStudySection() {
  const dailyVerse = useDailyVerse();
  const [activeStudyTab, setActiveStudyTab] = useState("today");
  const [note, setNote] = useState(() =>
    readStoredString(STUDY_NOTE_STORAGE_KEY).slice(0, MAX_STUDY_THOUGHT_LENGTH),
  );
  const [studyLogs, setStudyLogs] = useState(readStoredStudyLogs);
  const trimmedNote = note.trim();
  const remainingCharacters = MAX_STUDY_THOUGHT_LENGTH - note.length;

  useEffect(() => {
    writeStoredString(STUDY_NOTE_STORAGE_KEY, note);
  }, [note]);

  useEffect(() => {
    writeStoredValue(STUDY_LOGS_STORAGE_KEY, studyLogs);
  }, [studyLogs]);

  const saveStudyThought = (event) => {
    event.preventDefault();

    const body = trimmedNote.slice(0, MAX_STUDY_THOUGHT_LENGTH);
    if (!body) {
      return;
    }

    setStudyLogs((currentLogs) => [
      {
        id: createLocalId("study-log"),
        body,
        createdAt: Date.now(),
        verseReference: dailyVerse.reference,
        verseText: dailyVerse.text,
      },
      ...currentLogs,
    ]);
    setNote("");
    setActiveStudyTab("logs");
  };

  return (
    <section className="section-surface" aria-labelledby="study-title">
      <div className="section-intro">
        <p className="section-kicker">Bible Study</p>
        <h2 id="study-title">Today’s Scripture, slowly.</h2>
        <span>Read, reflect, and keep a small note while we prototype deeper study tools.</span>
      </div>

      <div className="segmented-control study-switch" role="tablist" aria-label="Bible study views">
        <button
          aria-selected={activeStudyTab === "today"}
          className={activeStudyTab === "today" ? "is-selected" : ""}
          onClick={() => setActiveStudyTab("today")}
          role="tab"
          type="button"
        >
          Today’s Scripture
        </button>
        <button
          aria-selected={activeStudyTab === "logs"}
          className={activeStudyTab === "logs" ? "is-selected" : ""}
          onClick={() => setActiveStudyTab("logs")}
          role="tab"
          type="button"
        >
          Logs
          <span>{studyLogs.length}</span>
        </button>
      </div>

      {activeStudyTab === "today" ? (
        <>
          <article className="scripture-panel">
            <div className="drawer-cross" aria-hidden="true" />
            <blockquote>{dailyVerse.text}</blockquote>
            <cite>{dailyVerse.reference} · WEB</cite>
          </article>

          <div className="study-grid">
            <article>
              <p className="section-kicker">Reflect</p>
              <h3>What is God inviting you to practice?</h3>
              <p>Look for one action: humility, patience, confession, courage, forgiveness, or prayer.</p>
            </article>
            <form className="note-box study-note-form" onSubmit={saveStudyThought}>
              <label htmlFor="study-note">Study Note</label>
              <textarea
                aria-label="Study note"
                id="study-note"
                maxLength={MAX_STUDY_THOUGHT_LENGTH}
                placeholder="Write one thought from today’s verse..."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="study-note-actions">
                <span>{Math.max(0, remainingCharacters)} left</span>
                <button disabled={!trimmedNote} type="submit">
                  Save thought
                </button>
              </div>
            </form>
          </div>
        </>
      ) : (
        <div className="study-log-panel" aria-label="Bible study reflection logs">
          <div className="study-log-heading">
            <p className="section-kicker">Logs</p>
            <h3>Your saved thoughts</h3>
            <span>Each entry keeps the date, time, and verse you were reflecting on.</span>
          </div>

          {studyLogs.length > 0 ? (
            <div className="study-log-list">
              {studyLogs.map((studyLog) => (
                <article className="study-log-item" key={studyLog.id}>
                  <time dateTime={new Date(studyLog.createdAt).toISOString()}>
                    {formatStudyLogTime(studyLog.createdAt)}
                  </time>
                  <p>{studyLog.body}</p>
                  <span>{studyLog.verseReference} · WEB</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="study-log-empty">
              <p>No saved thoughts yet.</p>
              <button type="button" onClick={() => setActiveStudyTab("today")}>
                Write today’s thought
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HouseIllustration({ house }) {
  return (
    <div
      className="house-visual"
      aria-hidden="true"
      style={{
        "--house-accent": house.accent,
        "--house-roof": house.roof,
        "--house-wall": house.wall,
      }}
    >
      <span className="house-roof" />
      <span className="house-body" />
      <span className="house-door" />
      <span className="house-window house-window-left" />
      <span className="house-window house-window-right" />
      <span className="house-cross" />
    </div>
  );
}

function HouseWelcomeOverlay({ house }) {
  if (!house) {
    return null;
  }

  return createPortal(
    <div
      className="house-welcome-overlay"
      role="status"
      aria-live="polite"
      style={{
        "--house-accent": house.accent,
        "--house-soft": house.accentSoft,
      }}
    >
      <div className="house-welcome-panel">
        <HouseIllustration house={house} />
        <p className="section-kicker">Welcome</p>
        <h2>{house.name} House</h2>
        <span>Stand in Christ, speak with love.</span>
      </div>
    </div>,
    document.body,
  );
}

function HouseComposer({ house, onOpenProfile, onPost, profile }) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();
  const remainingCharacters = MAX_POST_LENGTH - draft.length;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!trimmedDraft) {
      return;
    }

    onPost(trimmedDraft);
    setDraft("");
  };

  return (
    <form className="house-composer" onSubmit={handleSubmit}>
      <ProfileAvatarButton
        avatarClassName="house-avatar"
        onOpenProfile={onOpenProfile}
        profile={profile}
      />
      <div>
        <textarea
          aria-label={`Share with the ${house.name} house`}
          maxLength={MAX_POST_LENGTH}
          placeholder={`Share with the ${house.name} house...`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="composer-actions">
          <span className={remainingCharacters < 30 ? "counter is-low" : "counter"}>
            {remainingCharacters}
          </span>
          <button type="submit" disabled={!trimmedDraft}>
            Post to House
          </button>
        </div>
      </div>
    </form>
  );
}

function HousePostMeta({ author, createdAt }) {
  return (
    <header>
      <strong>{author.name}</strong>
      <span>{author.handle}</span>
      <span>{formatPostTime(createdAt)}</span>
    </header>
  );
}

function HousePostItem({
  commentCount,
  house,
  isMenuOpen,
  onDelete,
  onEdit,
  onMenuClose,
  onMenuToggle,
  onOpenProfile,
  onOpen,
  post,
  profile,
}) {
  const author = getContentAuthor(post, profile, {
    handle: `@${house.name.toLowerCase()}-house`,
  });
  const canManagePost = isOwnContent(post);

  return (
    <article
      className={`house-feed-item ${isMenuOpen ? "has-open-menu" : ""}`}
    >
      <ProfileAvatarButton
        avatarClassName="house-avatar"
        onOpenProfile={onOpenProfile}
        profile={author}
      />
      <button
        className="house-feed-open-button"
        type="button"
        aria-label={`Open ${house.name} house post: ${post.body}`}
        onClick={() => onOpen(post.id)}
      >
        <div className="house-feed-content">
          <HousePostMeta author={author} createdAt={post.createdAt} />
          <p>{post.body}</p>
          <span className="house-comment-count">
            {commentCount === 1 ? "1 comment" : `${commentCount} comments`}
          </span>
        </div>
      </button>
      {canManagePost ? (
        <PostActionsMenu
          isOpen={isMenuOpen}
          onClose={onMenuClose}
          onDelete={() => onDelete(post.id)}
          onEdit={() => onEdit(post.id)}
          onToggle={() => onMenuToggle(post.id)}
        />
      ) : null}
    </article>
  );
}

function HouseCommentComposer({ house, onComment, onOpenProfile, postId, profile }) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();
  const remainingCharacters = MAX_COMMENT_LENGTH - draft.length;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!trimmedDraft) {
      return;
    }

    onComment(postId, trimmedDraft);
    setDraft("");
  };

  return (
    <form className="comment-composer house-comment-composer" onSubmit={handleSubmit}>
      <ProfileAvatarButton
        avatarClassName="house-avatar"
        onOpenProfile={onOpenProfile}
        profile={profile}
      />
      <div className="comment-composer-main">
        <textarea
          aria-label={`Write a ${house.name} house comment`}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder={`Reply inside the ${house.name} house...`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="composer-actions">
          <span className={remainingCharacters < 30 ? "counter is-low" : "counter"}>
            {remainingCharacters}
          </span>
          <button type="submit" disabled={!trimmedDraft}>
            Comment
          </button>
        </div>
      </div>
    </form>
  );
}

function HouseCommentItem({
  comment,
  house,
  isMenuOpen,
  onDelete,
  onEdit,
  onMenuClose,
  onMenuToggle,
  onOpenProfile,
  profile,
}) {
  const author = getContentAuthor(comment, profile, {
    handle: `@${house.name.toLowerCase()}-house`,
  });
  const canManageComment = isOwnContent(comment);

  return (
    <article className={`comment-item house-comment-item ${isMenuOpen ? "has-open-menu" : ""}`}>
      <ProfileAvatarButton
        avatarClassName="house-avatar"
        onOpenProfile={onOpenProfile}
        profile={author}
      />
      <div className="comment-content">
        <HousePostMeta author={author} createdAt={comment.createdAt} />
        <p>{comment.body}</p>
      </div>
      {canManageComment ? (
        <PostActionsMenu
          buttonLabel="Reply options"
          deleteLabel="Delete reply"
          editLabel="Edit reply"
          isOpen={isMenuOpen}
          onClose={onMenuClose}
          onDelete={() => onDelete(comment.id)}
          onEdit={() => onEdit(comment.id)}
          onToggle={() => onMenuToggle(comment.id)}
        />
      ) : null}
    </article>
  );
}

function HousePostDetail({
  commentActionMenuId,
  comments,
  house,
  onDeletePost,
  onEditPost,
  onBack,
  onComment,
  onCommentDelete,
  onCommentEdit,
  onCommentMenuClose,
  onCommentMenuToggle,
  onMenuClose,
  onMenuToggle,
  onOpenProfile,
  postActionMenuId,
  post,
  profile,
}) {
  const author = getContentAuthor(post, profile, {
    handle: `@${house.name.toLowerCase()}-house`,
  });
  const canManagePost = isOwnContent(post);
  const sortedComments = useMemo(
    () =>
      comments.toSorted(
        (firstComment, secondComment) => firstComment.createdAt - secondComment.createdAt,
      ),
    [comments],
  );

  return (
    <section
      className="house-post-detail"
      aria-labelledby="house-post-detail-title"
      style={{
        "--house-accent": house.accent,
        "--house-soft": house.accentSoft,
      }}
    >
      <button className="room-back-button" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span>
        {house.name} House
      </button>

      <article className="post-detail-card house-detail-card">
        <ProfileAvatarButton
          avatarClassName="house-avatar"
          onOpenProfile={onOpenProfile}
          profile={author}
        />
        <div className="post-detail-content">
          <HousePostMeta author={author} createdAt={post.createdAt} />
          <h2 id="house-post-detail-title">{post.body}</h2>
          <span className="house-detail-count">
            {comments.length === 1 ? "1 comment" : `${comments.length} comments`}
          </span>
        </div>
        {canManagePost ? (
          <PostActionsMenu
            isOpen={postActionMenuId === post.id}
            onClose={onMenuClose}
            onDelete={() => onDeletePost(post.id)}
            onEdit={() => onEditPost(post.id)}
            onToggle={() => onMenuToggle(post.id)}
          />
        ) : null}
      </article>

      <HouseCommentComposer
        house={house}
        onComment={onComment}
        onOpenProfile={onOpenProfile}
        postId={post.id}
        profile={profile}
      />

      <div className="comment-list house-comment-list" aria-label={`${house.name} house comments`}>
        {sortedComments.length > 0 ? (
          sortedComments.map((comment) => (
            <HouseCommentItem
              comment={comment}
              house={house}
              isMenuOpen={commentActionMenuId === comment.id}
              key={comment.id}
              onDelete={onCommentDelete}
              onEdit={onCommentEdit}
              onMenuClose={onCommentMenuClose}
              onMenuToggle={onCommentMenuToggle}
              onOpenProfile={onOpenProfile}
              profile={profile}
            />
          ))
        ) : (
          <section className="empty-comments">
            <p>No comments yet.</p>
            <span>Be the first to answer this house with patience and love.</span>
          </section>
        )}
      </div>
    </section>
  );
}

function HouseHome({
  commentsByPost,
  house,
  onAddComment,
  onDeleteComment,
  onDeletePost,
  onEditComment,
  onEditPost,
  onOpenProfile,
  onPost,
  posts,
  profile,
}) {
  const [activePostId, setActivePostId] = useState(null);
  const [postActionMenuId, setPostActionMenuId] = useState(null);
  const [commentActionMenuId, setCommentActionMenuId] = useState(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const sortedPosts = useMemo(
    () => posts.toSorted((firstPost, secondPost) => secondPost.createdAt - firstPost.createdAt),
    [posts],
  );
  const activePost = posts.find((post) => post.id === activePostId);
  const editingPost = posts.find((post) => post.id === editingPostId);
  const activePostComments = activePost && Array.isArray(commentsByPost[activePost.id])
    ? commentsByPost[activePost.id]
    : [];
  const editingComment = activePostComments.find((comment) => comment.id === editingCommentId);

  const deletePost = (postId) => {
    onDeletePost(postId);
    setActivePostId((currentPostId) => (currentPostId === postId ? null : currentPostId));
    setPostActionMenuId(null);
    setCommentActionMenuId(null);
    setEditingPostId((currentPostId) => (currentPostId === postId ? null : currentPostId));
    setEditingCommentId(null);
  };

  const editPost = (postId) => {
    setCommentActionMenuId(null);
    setPostActionMenuId(null);
    setEditingPostId(postId);
  };

  const deleteComment = (commentId) => {
    if (!activePost) {
      return;
    }

    onDeleteComment(activePost.id, commentId);
    setCommentActionMenuId(null);
    setEditingCommentId((currentCommentId) =>
      currentCommentId === commentId ? null : currentCommentId,
    );
  };

  const editComment = (commentId) => {
    setPostActionMenuId(null);
    setCommentActionMenuId(null);
    setEditingCommentId(commentId);
  };

  const savePostEdit = (body) => {
    if (!editingPostId) {
      return;
    }

    onEditPost(editingPostId, body);
    setEditingPostId(null);
  };

  const saveCommentEdit = (body) => {
    if (!activePost || !editingCommentId) {
      return;
    }

    onEditComment(activePost.id, editingCommentId, body);
    setEditingCommentId(null);
  };

  if (activePost) {
    return (
      <>
        <HousePostDetail
          commentActionMenuId={commentActionMenuId}
          comments={activePostComments}
          house={house}
          onBack={() => setActivePostId(null)}
          onComment={onAddComment}
          onCommentDelete={deleteComment}
          onCommentEdit={editComment}
          onCommentMenuClose={() => setCommentActionMenuId(null)}
          onCommentMenuToggle={(commentId) =>
            setCommentActionMenuId((currentCommentId) =>
              currentCommentId === commentId ? null : commentId,
            )
          }
          onDeletePost={deletePost}
          onEditPost={editPost}
          onMenuClose={() => setPostActionMenuId(null)}
          onMenuToggle={(postId) =>
            setPostActionMenuId((currentPostId) => (currentPostId === postId ? null : postId))
          }
          onOpenProfile={onOpenProfile}
          postActionMenuId={postActionMenuId}
          post={activePost}
          profile={profile}
        />
        <PostEditDialog
          accent={house.accent}
          onClose={() => setEditingPostId(null)}
          onSave={savePostEdit}
          post={editingPost}
          title={`Edit ${house.name} house post`}
        />
        <PostEditDialog
          accent={house.accent}
          maxLength={MAX_COMMENT_LENGTH}
          onClose={() => setEditingCommentId(null)}
          onSave={saveCommentEdit}
          post={editingComment}
          textareaLabel="Edit reply text"
          title={`Edit ${house.name} house reply`}
        />
      </>
    );
  }

  return (
    <section
      className="house-home"
      aria-labelledby="house-home-title"
      style={{
        "--house-accent": house.accent,
        "--house-soft": house.accentSoft,
      }}
    >
      <div className="house-home-hero">
        <HouseIllustration house={house} />
        <div>
          <p className="section-kicker">{house.name} House</p>
          <h2 id="house-home-title">{house.name} House</h2>
          <span>{house.welcome}</span>
        </div>
      </div>

      <HouseComposer
        house={house}
        onOpenProfile={onOpenProfile}
        onPost={onPost}
        profile={profile}
      />

      <div className="house-feed" aria-label={`${house.name} house feed`}>
        {sortedPosts.map((post) => (
          <HousePostItem
            commentCount={
              Array.isArray(commentsByPost[post.id]) ? commentsByPost[post.id].length : 0
            }
            house={house}
            isMenuOpen={postActionMenuId === post.id}
            key={post.id}
            onDelete={deletePost}
            onEdit={editPost}
            onMenuClose={() => setPostActionMenuId(null)}
            onMenuToggle={(postId) =>
              setPostActionMenuId((currentPostId) => (currentPostId === postId ? null : postId))
            }
            onOpenProfile={onOpenProfile}
            onOpen={setActivePostId}
            post={post}
            profile={profile}
          />
        ))}
      </div>
      <PostEditDialog
        accent={house.accent}
        onClose={() => setEditingPostId(null)}
        onSave={savePostEdit}
        post={editingPost}
        title={`Edit ${house.name} house post`}
      />
    </section>
  );
}

function HousesSection({ onOpenProfile, onSelectHouse, profile, selectedHouseId }) {
  const [joiningHouseId, setJoiningHouseId] = useState(null);
  const [housePosts, setHousePosts] = useState(readStoredHousePosts);
  const [houseCommentsByPost, setHouseCommentsByPost] = useState(() =>
    readStoredRecordOfTextItems(
      HOUSE_COMMENTS_STORAGE_KEY,
      MAX_COMMENT_LENGTH,
      "house-comment",
      defaultHouseComments,
    ),
  );
  const selectedHouse = getHouseById(selectedHouseId);
  const joiningHouse = getHouseById(joiningHouseId);

  useEffect(() => {
    writeStoredValue(HOUSE_POSTS_STORAGE_KEY, housePosts);
  }, [housePosts]);

  useEffect(() => {
    writeStoredValue(HOUSE_COMMENTS_STORAGE_KEY, houseCommentsByPost);
  }, [houseCommentsByPost]);

  useEffect(() => {
    if (!joiningHouseId) {
      return undefined;
    }

    const backgroundSwapTimer = window.setTimeout(() => {
      onSelectHouse(joiningHouseId);
    }, HOUSE_BACKGROUND_SWAP_DELAY_MS);

    const joinTimer = window.setTimeout(() => {
      setJoiningHouseId(null);
    }, HOUSE_WELCOME_DURATION_MS);

    return () => {
      window.clearTimeout(backgroundSwapTimer);
      window.clearTimeout(joinTimer);
    };
  }, [joiningHouseId, onSelectHouse]);

  const handleJoinHouse = (houseId) => {
    setJoiningHouseId(houseId);
  };

  const addHousePost = (houseId, body) => {
    setHousePosts((currentHousePosts) => ({
      ...currentHousePosts,
      [houseId]: [
        ...(Array.isArray(currentHousePosts[houseId]) ? currentHousePosts[houseId] : []),
        {
          id: createLocalId(`${houseId}-post`),
          body,
          createdAt: Date.now(),
        },
      ],
    }));
  };

  const deleteHousePost = (houseId, postId) => {
    setHousePosts((currentHousePosts) => ({
      ...currentHousePosts,
      [houseId]: (currentHousePosts[houseId] ?? []).filter((post) => post.id !== postId),
    }));
    setHouseCommentsByPost((currentCommentsByPost) => {
      const nextCommentsByPost = { ...currentCommentsByPost };
      delete nextCommentsByPost[postId];
      return nextCommentsByPost;
    });
  };

  const editHousePost = (houseId, postId, body) => {
    setHousePosts((currentHousePosts) => ({
      ...currentHousePosts,
      [houseId]: (currentHousePosts[houseId] ?? []).map((post) =>
        post.id === postId ? { ...post, body } : post,
      ),
    }));
  };

  const addHouseComment = (postId, body) => {
    setHouseCommentsByPost((currentCommentsByPost) => ({
      ...currentCommentsByPost,
      [postId]: [
        ...(Array.isArray(currentCommentsByPost[postId]) ? currentCommentsByPost[postId] : []),
        {
          id: createLocalId("house-comment"),
          body,
          createdAt: Date.now(),
        },
      ],
    }));
  };

  const deleteHouseComment = (postId, commentId) => {
    setHouseCommentsByPost((currentCommentsByPost) => ({
      ...currentCommentsByPost,
      [postId]: (currentCommentsByPost[postId] ?? []).filter(
        (comment) => comment.id !== commentId,
      ),
    }));
  };

  const editHouseComment = (postId, commentId, body) => {
    setHouseCommentsByPost((currentCommentsByPost) => ({
      ...currentCommentsByPost,
      [postId]: (currentCommentsByPost[postId] ?? []).map((comment) =>
        comment.id === commentId ? { ...comment, body } : comment,
      ),
    }));
  };

  return (
    <section
      className="section-surface"
      aria-labelledby={selectedHouse ? "house-home-title" : "houses-title"}
    >
      {selectedHouse ? (
        <HouseHome
          commentsByPost={houseCommentsByPost}
          house={selectedHouse}
          onAddComment={addHouseComment}
          posts={housePosts[selectedHouse.id] ?? []}
          onDeleteComment={deleteHouseComment}
          onDeletePost={(postId) => deleteHousePost(selectedHouse.id, postId)}
          onEditComment={editHouseComment}
          onEditPost={(postId, body) => editHousePost(selectedHouse.id, postId, body)}
          onOpenProfile={onOpenProfile}
          onPost={(body) => addHousePost(selectedHouse.id, body)}
          profile={profile}
        />
      ) : (
        <>
          <div className="section-intro houses-intro">
            <p className="section-kicker">Houses</p>
            <h2 id="houses-title">Three houses, one Lord.</h2>
            <span>
              Choose a Christian tradition to enter a house-shaped community feed. This is only a
              prototype, so the choice stays on this browser for now.
            </span>
          </div>

          <div className="house-village" aria-label="Christian houses">
            {christianHouses.map((house, index) => (
              <article
                className="house-card"
                key={house.id}
                style={{
                  "--house-accent": house.accent,
                  "--house-soft": house.accentSoft,
                  "--house-delay": `${index * 110}ms`,
                }}
              >
                <HouseIllustration house={house} />
                <p className="section-kicker">{house.name}</p>
                <h3>{house.name} House</h3>
                <span>{house.motto}</span>
                <button
                  type="button"
                  aria-label={`Join ${house.name}`}
                  disabled={Boolean(joiningHouseId)}
                  onClick={() => handleJoinHouse(house.id)}
                >
                  Join
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      <HouseWelcomeOverlay house={joiningHouse} />
    </section>
  );
}

function CommonGroundSection() {
  const [commonGroundState, setCommonGroundState] = useState(getInitialCommonGroundState);
  const [selectedRating, setSelectedRating] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const todayKey = getLocalDateKey();
  const { activeTab, reviews, reviewStepIndex } = commonGroundState;
  const reviewProgress = getCommonGroundReviewProgress(reviews, todayKey);
  const isCommandmentsTab = activeTab === "commandments";
  const isGuidelinesTab = activeTab === "guidelines";
  const isNotesTab = activeTab === "notes";
  const activeReviewStep = commonGroundReviewSteps[reviewStepIndex] ?? commonGroundReviewSteps[0];
  const reviewNoteLength = reviewNote.length;
  const reviewsByDate = useMemo(() => {
    const groupedReviews = reviews.reduce((groups, review) => {
      groups[review.dateKey] = [...(groups[review.dateKey] ?? []), review];
      return groups;
    }, {});

    return Object.entries(groupedReviews)
      .sort(([firstDateKey], [secondDateKey]) => secondDateKey.localeCompare(firstDateKey))
      .map(([dateKey, dateReviews]) => [
        dateKey,
        [...dateReviews].sort(
          (firstReview, secondReview) =>
            commonGroundReviewSteps.findIndex((step) => step.id === firstReview.stepId) -
            commonGroundReviewSteps.findIndex((step) => step.id === secondReview.stepId),
        ),
      ]);
  }, [reviews]);

  useEffect(() => {
    writeStoredValue(COMMON_GROUND_REVIEW_STORAGE_KEY, reviews);
  }, [reviews]);

  const setActiveTab = (nextTab) => {
    setCommonGroundState((currentState) => ({
      ...currentState,
      activeTab: nextTab,
    }));
  };

  const saveReviewStep = (event) => {
    event.preventDefault();

    if (!selectedRating || !activeReviewStep) {
      return;
    }

    setCommonGroundState((currentState) => {
      const nextEntry = {
        id: createLocalId("common-review"),
        dateKey: todayKey,
        stepId: activeReviewStep.id,
        title: activeReviewStep.title,
        rating: selectedRating,
        note: reviewNote.trim().slice(0, MAX_COMMON_GROUND_NOTE_LENGTH),
        createdAt: Date.now(),
      };
      const nextReviews = [
        nextEntry,
        ...currentState.reviews.filter(
          (review) => !(review.dateKey === todayKey && review.stepId === activeReviewStep.id),
        ),
      ].sort((firstReview, secondReview) => secondReview.createdAt - firstReview.createdAt);
      const nextProgress = getCommonGroundReviewProgress(nextReviews, todayKey);

      return {
        ...currentState,
        activeTab: nextProgress.isComplete ? "notes" : "commandments",
        reviewStepIndex: nextProgress.nextStepIndex,
        reviews: nextReviews,
      };
    });
    setSelectedRating("");
    setReviewNote("");
  };

  return (
    <section className="section-surface" aria-labelledby="common-title">
      <div className="section-intro">
        <p className="section-kicker">Common Ground</p>
        <h2 id="common-title">The way we walk together.</h2>
        <span>
          A shared foundation for truth, love, patience, and respectful Christian conversation.
        </span>
      </div>

      <div className="segmented-control common-ground-tabs" role="tablist" aria-label="Common ground tabs">
        <button
          aria-selected={isCommandmentsTab}
          type="button"
          className={isCommandmentsTab ? "is-selected" : ""}
          role="tab"
          onClick={() => setActiveTab("commandments")}
        >
          Commandments
        </button>
        <button
          aria-selected={isGuidelinesTab}
          type="button"
          className={isGuidelinesTab ? "is-selected" : ""}
          role="tab"
          onClick={() => setActiveTab("guidelines")}
        >
          Community Guidelines
        </button>
        <button
          aria-selected={isNotesTab}
          type="button"
          className={isNotesTab ? "is-selected" : ""}
          role="tab"
          onClick={() => setActiveTab("notes")}
        >
          Notes
          <span>{reviews.length}</span>
        </button>
      </div>

      {isCommandmentsTab && !reviewProgress.isComplete ? (
        <form className="common-review-card" onSubmit={saveReviewStep} key={activeReviewStep.id}>
          <div className="common-review-progress">
            <span>Step {reviewStepIndex + 1} of {commonGroundReviewSteps.length}</span>
            <strong>{activeReviewStep.label}</strong>
          </div>

          <div className="common-review-copy">
            <h3>{activeReviewStep.title}</h3>
            <p>{activeReviewStep.body}</p>
            <span>{activeReviewStep.reference}</span>
          </div>

          <div
            className="common-rating-options"
            role="group"
            aria-label={`How did you follow ${activeReviewStep.title} today?`}
          >
            {commonGroundRatings.map((rating) => (
              <button
                aria-pressed={selectedRating === rating}
                className={selectedRating === rating ? "is-selected" : ""}
                key={rating}
                onClick={() => setSelectedRating(rating)}
                type="button"
              >
                {rating}
              </button>
            ))}
          </div>

          <label className="common-review-note">
            <span>Private note</span>
            <textarea
              aria-label="Private review note"
              maxLength={MAX_COMMON_GROUND_NOTE_LENGTH}
              placeholder="Add a small note for yourself..."
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
            />
          </label>

          <div className="common-review-actions">
            <span>{MAX_COMMON_GROUND_NOTE_LENGTH - reviewNoteLength} left</span>
            <button disabled={!selectedRating} type="submit">
              {reviewStepIndex === commonGroundReviewSteps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </form>
      ) : isCommandmentsTab ? (
        <div className="common-ground-panel">
          <div className="commandment-summary" aria-label="Jesus' summary of the commandments">
            {commandmentHighlights.map((highlight) => (
              <article key={highlight.title}>
                <p className="section-kicker">Jesus Reminds Us</p>
                <h3>{highlight.title}</h3>
                <p>{highlight.body}</p>
                <span>{highlight.reference}</span>
              </article>
            ))}
          </div>

          <ol className="commandment-list" aria-label="The Ten Commandments">
            {tenCommandments.map((commandment, index) => (
              <li
                className={index === 0 || index === 8 ? "commandment-item is-featured" : "commandment-item"}
                key={commandment}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{commandment}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : isGuidelinesTab ? (
        <div className="guideline-list" aria-label="Community guidelines">
          {communityGuidelines.map((guideline) => (
            <article key={guideline.title}>
              <h3>{guideline.title}</h3>
              <p>{guideline.body}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="common-notes-panel" aria-label="Common ground review notes">
          {reviewsByDate.length > 0 ? (
            reviewsByDate.map(([dateKey, dateReviews]) => (
              <section className="common-note-group" key={dateKey}>
                <h3>{formatReviewDate(dateKey)}</h3>
                <div className="common-note-list">
                  {dateReviews.map((review) => (
                    <article className="common-note-item" key={review.id}>
                      <div>
                        <strong>{review.title}</strong>
                        <span>{review.rating}</span>
                      </div>
                      <p>{review.note || "No note added."}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="common-notes-empty">
              <p>No Common Ground notes yet.</p>
              <button type="button" onClick={() => setActiveTab("commandments")}>
                Start today’s review
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProfileBannerArtwork() {
  return (
    <>
      <span className="profile-banner-panel profile-banner-panel-gold" />
      <span className="profile-banner-panel profile-banner-panel-teal" />
      <span className="profile-banner-panel profile-banner-panel-rose" />
    </>
  );
}

function ProfileEditModal({ onClose, onSave, profile }) {
  const [draft, setDraft] = useState(() => ({ ...defaultProfile, ...profile }));
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  useEffect(() => {
    setDraft({ ...defaultProfile, ...profile });
  }, [profile]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const handleImageChange = async (event, field) => {
    const [file] = event.target.files ?? [];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      updateDraft(field, "");
      return;
    }

    try {
      const imageDataUrl = await readImageFile(file);
      updateDraft(field, imageDataUrl);
    } catch {
      updateDraft(field, "");
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    onSave({
      ...defaultProfile,
      ...draft,
      name: draft.name.trim() || defaultProfile.name,
      tradition: traditions.includes(draft.tradition) ? draft.tradition : defaultProfile.tradition,
      verse: draft.verse.trim() || defaultProfile.verse,
      avatarBorderColor: normalizeAvatarBorderColor(draft.avatarBorderColor),
      bannerScale: normalizeBannerScale(draft.bannerScale),
    });
    onClose();
  };

  const bannerScale = normalizeBannerScale(draft.bannerScale);

  return createPortal(
    <div className="profile-edit-layer" role="presentation" onMouseDown={onClose}>
      <form
        className="profile-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="profile-edit-modal-topbar">
          <button
            className="profile-edit-modal-close"
            type="button"
            aria-label="Close edit profile"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
          <h2 id="profile-edit-modal-title">Edit profile</h2>
          <button className="profile-edit-save" type="submit">
            Save
          </button>
        </header>

        <div
          className={draft.bannerImage ? "profile-edit-cover has-image" : "profile-edit-cover"}
          style={{ "--profile-banner-scale": bannerScale }}
        >
          {draft.bannerImage ? (
            <img src={draft.bannerImage} alt="" />
          ) : (
            <ProfileBannerArtwork />
          )}
          <div className="profile-edit-cover-actions">
            <button
              type="button"
              aria-label="Change banner image"
              onClick={() => bannerInputRef.current?.click()}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 8.5h3l1.6-2.4h6.8L17 8.5h3v9.2H4V8.5Z" />
                <circle cx="12" cy="13.2" r="3.2" />
              </svg>
            </button>
            {draft.bannerImage ? (
              <button
                className="profile-edit-cover-remove"
                type="button"
                aria-label="Remove banner image"
                onClick={() => updateDraft("bannerImage", "")}
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>
        </div>

        <div className="profile-edit-avatar-row">
          <div className="profile-edit-avatar-stack">
            <UserAvatar className="profile-edit-avatar" profile={draft} />
            <button
              className={`profile-edit-photo-button ${draft.avatarImage ? "is-remove" : ""}`}
              type="button"
              aria-label={draft.avatarImage ? "Remove profile picture" : "Change profile picture"}
              onClick={() => {
                if (draft.avatarImage) {
                  updateDraft("avatarImage", "");
                  return;
                }

                avatarInputRef.current?.click();
              }}
            >
              {draft.avatarImage ? (
                <CloseIcon />
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M4 8.5h3l1.6-2.4h6.8L17 8.5h3v9.2H4V8.5Z" />
                  <circle cx="12" cy="13.2" r="3.2" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="profile-edit-form">
          <label className="profile-edit-field">
            <span>Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => updateDraft("name", event.target.value)}
            />
          </label>

          <label className="profile-edit-field">
            <span>Tradition</span>
            <select
              value={draft.tradition}
              onChange={(event) => updateDraft("tradition", event.target.value)}
            >
              {traditions.map((tradition) => (
                <option key={tradition}>{tradition}</option>
              ))}
            </select>
          </label>

          <label className="profile-edit-field">
            <span>Favorite Bible verse</span>
            <input
              type="text"
              value={draft.verse}
              onChange={(event) => updateDraft("verse", event.target.value)}
            />
          </label>

          <label className="profile-edit-field">
            <span>Description</span>
            <textarea
              value={draft.bio}
              onChange={(event) => updateDraft("bio", event.target.value)}
            />
          </label>

          <fieldset className="profile-edit-color-field">
            <legend>Profile border color</legend>
            <div className="profile-border-swatches">
              {avatarBorderColors.map((color) => (
                <button
                  className={
                    normalizeAvatarBorderColor(draft.avatarBorderColor) === color.value
                      ? "is-selected"
                      : ""
                  }
                  key={color.value}
                  type="button"
                  aria-label={`${color.name} profile border`}
                  aria-pressed={normalizeAvatarBorderColor(draft.avatarBorderColor) === color.value}
                  style={{ "--swatch-color": color.value }}
                  onClick={() => updateDraft("avatarBorderColor", color.value)}
                >
                  <span aria-hidden="true" />
                </button>
              ))}
            </div>
          </fieldset>

          <label className="profile-edit-range">
            <span>Banner image size</span>
            <input
              type="range"
              min="1"
              max="1.8"
              step="0.05"
              value={bannerScale}
              disabled={!draft.bannerImage}
              onChange={(event) => updateDraft("bannerScale", event.target.value)}
            />
            <output>{Math.round(bannerScale * 100)}%</output>
          </label>
        </div>

        <input
          ref={bannerInputRef}
          className="profile-file-input"
          type="file"
          accept="image/*"
          aria-label="Banner image file"
          tabIndex={-1}
          onChange={(event) => handleImageChange(event, "bannerImage")}
        />
        <input
          ref={avatarInputRef}
          className="profile-file-input"
          type="file"
          accept="image/*"
          aria-label="Profile picture file"
          tabIndex={-1}
          onChange={(event) => handleImageChange(event, "avatarImage")}
        />
      </form>
    </div>,
    document.body,
  );
}

function ProfileSection({
  backLabel = "Back",
  commentsByPost,
  isOwnProfile = true,
  onBack,
  onDeletePost,
  onDeletePrayer,
  onDeleteReply,
  onEditPost,
  onEditPrayer,
  onEditReply,
  onOpenSettings,
  posts,
  prayers,
  profile,
  onProfileChange,
}) {
  const [activeProfileTab, setActiveProfileTab] = useState("posts");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileActionMenuKey, setProfileActionMenuKey] = useState(null);
  const [editingProfileActivity, setEditingProfileActivity] = useState(null);
  const bannerScale = normalizeBannerScale(profile.bannerScale);
  const profileOwnerId = profile.id || "current-user";
  const belongsToProfile = (item) => {
    const author = normalizeAuthor(item?.author);

    return isOwnProfile ? !author : author?.id === profileOwnerId;
  };
  const profilePosts = useMemo(
    () =>
      posts
        .filter(belongsToProfile)
        .toSorted((firstPost, secondPost) => secondPost.createdAt - firstPost.createdAt),
    [isOwnProfile, posts, profileOwnerId],
  );
  const profileReplies = useMemo(
    () =>
      Object.entries(commentsByPost ?? {})
        .flatMap(([postId, comments]) =>
          (Array.isArray(comments) ? comments : []).map((comment) => ({ ...comment, postId })),
        )
        .filter(belongsToProfile)
        .toSorted((firstReply, secondReply) => secondReply.createdAt - firstReply.createdAt),
    [commentsByPost, isOwnProfile, profileOwnerId],
  );
  const profilePrayers = useMemo(
    () =>
      prayers
        .filter(belongsToProfile)
        .toSorted(
          (firstPrayer, secondPrayer) => secondPrayer.createdAt - firstPrayer.createdAt,
        ),
    [isOwnProfile, prayers, profileOwnerId],
  );
  const editingActivityMaxLength =
    editingProfileActivity?.type === "prayer"
      ? MAX_PRAYER_LENGTH
      : editingProfileActivity?.type === "reply"
        ? MAX_COMMENT_LENGTH
        : MAX_POST_LENGTH;
  const editingActivityTitle =
    editingProfileActivity?.type === "prayer"
      ? "Edit prayer"
      : editingProfileActivity?.type === "reply"
        ? "Edit reply"
        : "Edit post";
  const editingActivityTextareaLabel =
    editingProfileActivity?.type === "prayer"
      ? "Edit prayer text"
      : editingProfileActivity?.type === "reply"
        ? "Edit reply text"
        : "Edit post text";

  useEffect(() => {
    setProfileActionMenuKey(null);
    setEditingProfileActivity(null);
  }, [activeProfileTab]);

  const getActivityKey = (type, itemId) => `${type}:${itemId}`;

  const openActivityEdit = (type, item) => {
    setProfileActionMenuKey(null);
    setEditingProfileActivity({ item, type });
  };

  const deleteActivity = (type, itemId) => {
    if (type === "post") {
      onDeletePost(itemId);
    } else if (type === "reply") {
      onDeleteReply(itemId);
    } else {
      onDeletePrayer(itemId);
    }

    setProfileActionMenuKey(null);
    setEditingProfileActivity((currentActivity) =>
      currentActivity?.item.id === itemId ? null : currentActivity,
    );
  };

  const saveActivityEdit = (body) => {
    if (!editingProfileActivity) {
      return;
    }

    if (editingProfileActivity.type === "post") {
      onEditPost(editingProfileActivity.item.id, body);
    } else if (editingProfileActivity.type === "reply") {
      onEditReply(editingProfileActivity.item.id, body);
    } else {
      onEditPrayer(editingProfileActivity.item.id, body);
    }

    setEditingProfileActivity(null);
  };

  const renderActivityActions = (type, item) => {
    if (!isOwnProfile) {
      return null;
    }

    const activityKey = getActivityKey(type, item.id);
    const noun = type === "reply" ? "reply" : type;
    const labelNoun = noun[0].toUpperCase() + noun.slice(1);

    return (
      <PostActionsMenu
        buttonLabel={`${labelNoun} options`}
        deleteLabel={`Delete ${noun}`}
        editLabel={`Edit ${noun}`}
        isOpen={profileActionMenuKey === activityKey}
        onClose={() => setProfileActionMenuKey(null)}
        onDelete={() => deleteActivity(type, item.id)}
        onEdit={() => openActivityEdit(type, item)}
        onToggle={() =>
          setProfileActionMenuKey((currentKey) =>
            currentKey === activityKey ? null : activityKey,
          )
        }
      />
    );
  };

  const renderEmptyProfileTab = (title, body) => (
    <section className="profile-tab-empty">
      <p>{title}</p>
      <span>{body}</span>
    </section>
  );

  return (
    <section className="section-surface profile-section" aria-labelledby="profile-title">
      {!isOwnProfile && typeof onBack === "function" ? (
        <button className="room-back-button profile-view-back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          {backLabel}
        </button>
      ) : null}

      <div className="profile-card">
        <div
          className={profile.bannerImage ? "profile-cover has-image" : "profile-cover"}
          aria-hidden="true"
          style={{ "--profile-banner-scale": bannerScale }}
        >
          {profile.bannerImage ? (
            <img className="profile-cover-image" src={profile.bannerImage} alt="" />
          ) : (
            <ProfileBannerArtwork />
          )}
        </div>

        <div className="profile-summary">
          <UserAvatar className="profile-avatar" profile={profile} />

          {isOwnProfile ? (
            <div className="profile-actions">
              <button
                className="profile-edit-button"
                type="button"
                onClick={() => setIsEditingProfile(true)}
              >
                Edit profile
              </button>
              <button
                className="profile-settings-button"
                type="button"
                aria-label="Profile settings"
                onClick={onOpenSettings}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M19.4 13.5a7.6 7.6 0 0 0 .1-1.5 7.6 7.6 0 0 0-.1-1.5l2-1.5-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6A7.4 7.4 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0-.1 1.5 7.6 7.6 0 0 0 .1 1.5l-2 1.5 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5Z" />
                </svg>
              </button>
            </div>
          ) : null}

          <div className="profile-card-main">
            <h2 id="profile-title">{profile.name || "Stand in Christ Tester"}</h2>
            <span className="profile-handle">{profile.handle || "@testing"}</span>
            <p>{profile.bio}</p>
            <div className="profile-meta" aria-label="Profile details">
              <span>{profile.tradition}</span>
              <span>{profile.verse}</span>
              <span>Joined May 2026</span>
            </div>
            <div className="profile-stats" aria-label="Profile stats">
              <span>
                <strong>12</strong> following
              </span>
              <span>
                <strong>3</strong> followers
              </span>
            </div>
          </div>
        </div>

        <nav className="profile-tabs" aria-label="Profile sections">
          <button
            type="button"
            aria-current={activeProfileTab === "posts" ? "page" : undefined}
            onClick={() => setActiveProfileTab("posts")}
          >
            Posts
          </button>
          <button
            type="button"
            aria-current={activeProfileTab === "replies" ? "page" : undefined}
            onClick={() => setActiveProfileTab("replies")}
          >
            Replies
          </button>
          <button
            type="button"
            aria-current={activeProfileTab === "prayers" ? "page" : undefined}
            onClick={() => setActiveProfileTab("prayers")}
          >
            Prayers
          </button>
        </nav>
      </div>

      <div className="profile-tab-panel" aria-live="polite">
        {activeProfileTab === "posts" ? (
          profilePosts.length > 0 ? (
            profilePosts.map((post) => (
              <article
                className={`profile-activity-item ${
                  profileActionMenuKey === getActivityKey("post", post.id) ? "has-open-menu" : ""
                }`}
                key={post.id}
              >
                <span>Post · {formatPostTime(post.createdAt)}</span>
                <p>{post.body}</p>
                {renderActivityActions("post", post)}
              </article>
            ))
          ) : (
            renderEmptyProfileTab(
              "No posts yet.",
              "Your shared thoughts from the home feed will appear here.",
            )
          )
        ) : null}

        {activeProfileTab === "replies" ? (
          profileReplies.length > 0 ? (
            profileReplies.map((reply) => (
              <article
                className={`profile-activity-item ${
                  profileActionMenuKey === getActivityKey("reply", reply.id) ? "has-open-menu" : ""
                }`}
                key={reply.id}
              >
                <span>Reply · {formatPostTime(reply.createdAt)}</span>
                <p>{reply.body}</p>
                {renderActivityActions("reply", reply)}
              </article>
            ))
          ) : (
            renderEmptyProfileTab(
              "No replies yet.",
              "When you comment on a post, your replies will collect here.",
            )
          )
        ) : null}

        {activeProfileTab === "prayers" ? (
          profilePrayers.length > 0 ? (
            profilePrayers.map((prayer) => (
              <article
                className={`profile-activity-item ${
                  profileActionMenuKey === getActivityKey("prayer", prayer.id) ? "has-open-menu" : ""
                }`}
                key={prayer.id}
              >
                <span className="profile-activity-meta">
                  Prayer · {formatPostTime(prayer.createdAt)}
                </span>
                <div className="profile-activity-tags">
                  {getPrayerTypeIds(prayer).map((typeId) => (
                    <span key={typeId}>{getPrayerType(typeId).label}</span>
                  ))}
                </div>
                <p>{prayer.body}</p>
                <small>
                  {prayer.prayedCount === 1
                    ? "1 prayed so far"
                    : `${prayer.prayedCount} prayed so far`}
                </small>
                {renderActivityActions("prayer", prayer)}
              </article>
            ))
          ) : (
            renderEmptyProfileTab(
              "No prayers yet.",
              "Prayer requests you share on the wall will appear here.",
            )
          )
        ) : null}
      </div>

      {isOwnProfile && isEditingProfile ? (
        <ProfileEditModal
          profile={profile}
          onClose={() => setIsEditingProfile(false)}
          onSave={onProfileChange}
        />
      ) : null}

      <PostEditDialog
        maxLength={editingActivityMaxLength}
        onClose={() => setEditingProfileActivity(null)}
        onSave={saveActivityEdit}
        post={editingProfileActivity?.item}
        textareaLabel={editingActivityTextareaLabel}
        title={editingActivityTitle}
      />
    </section>
  );
}

function SettingsSection({ onBackToProfile, onLeaveHouse, selectedHouse }) {
  return (
    <section className="section-surface settings-section" aria-labelledby="settings-title">
      <button className="room-back-button" type="button" onClick={onBackToProfile}>
        <span aria-hidden="true">←</span>
        Profile
      </button>

      <div className="section-intro settings-intro">
        <p className="section-kicker">Settings</p>
        <h2 id="settings-title">Profile settings</h2>
        <span>Quiet controls for your account and community choices will live here.</span>
      </div>

      <div className="settings-list" aria-label="Profile settings">
        <article className="settings-row">
          <div>
            <p>Chosen house</p>
            <strong>
              {selectedHouse ? `Chosen house is ${selectedHouse.name} House` : "No house selected yet"}
            </strong>
            <span>
              {selectedHouse
                ? "The Houses section will open straight into this house."
                : "Join a house from the Houses section when you are ready."}
            </span>
          </div>
          <button type="button" disabled={!selectedHouse} onClick={onLeaveHouse}>
            Leave
          </button>
        </article>
      </div>
    </section>
  );
}

function ActiveSection({
  commentsByPost,
  section,
  posts,
  prayers,
  profile,
  isOwnProfile,
  selectedHouseId,
  onAddComment,
  onDeletePost,
  onDeletePrayer,
  onDeleteReply,
  onEditPost,
  onEditPrayer,
  onEditReply,
  onOpenProfile,
  onPost,
  onAddPrayer,
  onBackToProfile,
  onLeaveHouse,
  onOpenSettings,
  onPrayed,
  onProfileChange,
  onSelectHouse,
}) {
  if (section === "prayer") {
    return (
      <PrayerWall
        prayers={prayers}
        profile={profile}
        onAddPrayer={onAddPrayer}
        onOpenProfile={onOpenProfile}
        onPrayed={onPrayed}
      />
    );
  }

  if (section === "discussions") {
    return <DiscussionsSection onOpenProfile={onOpenProfile} profile={profile} />;
  }

  if (section === "study") {
    return <BibleStudySection />;
  }

  if (section === "houses") {
    return (
      <HousesSection
        onOpenProfile={onOpenProfile}
        profile={profile}
        selectedHouseId={selectedHouseId}
        onSelectHouse={onSelectHouse}
      />
    );
  }

  if (section === "common") {
    return <CommonGroundSection />;
  }

  if (section === "profile") {
    return (
      <ProfileSection
        commentsByPost={commentsByPost}
        onDeletePost={onDeletePost}
        onDeletePrayer={onDeletePrayer}
        onDeleteReply={onDeleteReply}
        onEditPost={onEditPost}
        onEditPrayer={onEditPrayer}
        onEditReply={onEditReply}
        onOpenSettings={onOpenSettings}
        posts={posts}
        prayers={prayers}
        isOwnProfile={isOwnProfile}
        profile={profile}
        onProfileChange={onProfileChange}
      />
    );
  }

  if (section === "settings") {
    return (
      <SettingsSection
        onBackToProfile={onBackToProfile}
        onLeaveHouse={onLeaveHouse}
        selectedHouse={getHouseById(selectedHouseId)}
      />
    );
  }

  return (
    <HomeSection
      commentsByPost={commentsByPost}
      onAddComment={onAddComment}
      onDeleteComment={onDeleteReply}
      onDeletePost={onDeletePost}
      onEditComment={onEditReply}
      onEditPost={onEditPost}
      onOpenProfile={onOpenProfile}
      posts={posts}
      onPost={onPost}
      profile={profile}
    />
  );
}

function Home() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [viewedProfile, setViewedProfile] = useState(null);
  const profileReturnScrollYRef = useRef(0);
  const [posts, setPosts] = useState(() =>
    readStoredTextItems(POSTS_STORAGE_KEY, MAX_POST_LENGTH, "post", defaultHomePosts),
  );
  const [commentsByPost, setCommentsByPost] = useState(() =>
    readStoredRecordOfTextItems(
      POST_COMMENTS_STORAGE_KEY,
      MAX_COMMENT_LENGTH,
      "comment",
      defaultPostComments,
    ),
  );
  const [prayers, setPrayers] = useState(readStoredPrayers);
  const [selectedHouseId, setSelectedHouseId] = useState(readStoredHouseSelection);
  const [profile, setProfile] = useState(readStoredProfile);

  useEffect(() => {
    writeStoredValue(POSTS_STORAGE_KEY, posts);
  }, [posts]);

  useEffect(() => {
    writeStoredValue(POST_COMMENTS_STORAGE_KEY, commentsByPost);
  }, [commentsByPost]);

  useEffect(() => {
    writeStoredValue(PRAYERS_STORAGE_KEY, prayers);
  }, [prayers]);

  useEffect(() => {
    writeStoredValue(PROFILE_STORAGE_KEY, profile);
  }, [profile]);

  useEffect(() => {
    writeStoredString(HOUSE_SELECTION_STORAGE_KEY, selectedHouseId);
  }, [selectedHouseId]);

  const addPost = (body) => {
    setPosts((currentPosts) => [
      ...currentPosts,
      {
        id: createLocalId("post"),
        body,
        createdAt: Date.now(),
      },
    ]);
  };

  const deletePost = (postId) => {
    setPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setCommentsByPost((currentCommentsByPost) => {
      const nextCommentsByPost = { ...currentCommentsByPost };
      delete nextCommentsByPost[postId];
      return nextCommentsByPost;
    });
  };

  const editPost = (postId, body) => {
    setPosts((currentPosts) =>
      currentPosts.map((post) => (post.id === postId ? { ...post, body } : post)),
    );
  };

  const addComment = (postId, body) => {
    setCommentsByPost((currentCommentsByPost) => ({
      ...currentCommentsByPost,
      [postId]: [
        ...(Array.isArray(currentCommentsByPost[postId]) ? currentCommentsByPost[postId] : []),
        {
          id: createLocalId("comment"),
          body,
          createdAt: Date.now(),
        },
      ],
    }));
  };

  const deleteComment = (commentId) => {
    setCommentsByPost((currentCommentsByPost) =>
      Object.fromEntries(
        Object.entries(currentCommentsByPost)
          .map(([postId, comments]) => [
            postId,
            (comments ?? []).filter((comment) => comment.id !== commentId),
          ])
          .filter(([, comments]) => comments.length > 0),
      ),
    );
  };

  const editComment = (commentId, body) => {
    setCommentsByPost((currentCommentsByPost) =>
      Object.fromEntries(
        Object.entries(currentCommentsByPost).map(([postId, comments]) => [
          postId,
          (comments ?? []).map((comment) =>
            comment.id === commentId ? { ...comment, body } : comment,
          ),
        ]),
      ),
    );
  };

  const addPrayer = (body, types = defaultPrayerTypeIds) => {
    setPrayers((currentPrayers) => [
      ...currentPrayers,
      {
        id: createLocalId("prayer"),
        body,
        types,
        prayedCount: 0,
        createdAt: Date.now(),
      },
    ]);
  };

  const markPrayed = (prayerId) => {
    setPrayers((currentPrayers) => currentPrayers.filter((prayer) => prayer.id !== prayerId));
  };

  const deletePrayer = (prayerId) => {
    setPrayers((currentPrayers) => currentPrayers.filter((prayer) => prayer.id !== prayerId));
  };

  const editPrayer = (prayerId, body) => {
    setPrayers((currentPrayers) =>
      currentPrayers.map((prayer) => (prayer.id === prayerId ? { ...prayer, body } : prayer)),
    );
  };

  const leaveHouse = () => {
    setSelectedHouseId("");
  };

  const selectSection = (sectionId) => {
    if (sectionId !== "settings") {
      setViewedProfile(null);
    }

    setActiveSection(sectionId);
  };

  const openProfileSection = (targetProfile) => {
    const targetProfileId = typeof targetProfile?.id === "string" ? targetProfile.id : "";
    const isOtherProfile = targetProfileId && targetProfileId !== "current-user";

    setDrawerOpen(false);

    if (isOtherProfile) {
      profileReturnScrollYRef.current = window.scrollY;
      setViewedProfile(normalizeAuthor(targetProfile));
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
      return;
    }

    setViewedProfile(null);
    setActiveSection("profile");
  };

  const closeViewedProfile = () => {
    const returnScrollY = profileReturnScrollYRef.current;

    setViewedProfile(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: returnScrollY, behavior: "auto" });
    });
  };

  return (
    <main className="app-shell">
      <Drawer
        activeSection={activeSection}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelectSection={selectSection}
      />

      <section className="feed-shell" aria-label={`${sectionLabels[activeSection]} section`}>
        <header className="feed-topbar">
          <button
            className="hamburger-button"
            type="button"
            aria-label="Open sections"
            onClick={() => setDrawerOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div>
            <p>Community</p>
            <h1>{sectionLabels[activeSection]}</h1>
          </div>
          <div className="topbar-brand" aria-label="Stand in Christ">
            Stand in Christ
          </div>
        </header>

        {viewedProfile ? (
          <ProfileSection
            backLabel={`Back to ${sectionLabels[activeSection]}`}
            commentsByPost={commentsByPost}
            isOwnProfile={false}
            onBack={closeViewedProfile}
            onDeletePost={deletePost}
            onDeletePrayer={deletePrayer}
            onDeleteReply={deleteComment}
            onEditPost={editPost}
            onEditPrayer={editPrayer}
            onEditReply={editComment}
            posts={posts}
            prayers={prayers}
            profile={viewedProfile}
          />
        ) : (
          <ActiveSection
            commentsByPost={commentsByPost}
            section={activeSection}
            posts={posts}
            prayers={prayers}
            isOwnProfile
            profile={profile}
            selectedHouseId={selectedHouseId}
            onAddComment={addComment}
            onDeletePost={deletePost}
            onDeletePrayer={deletePrayer}
            onDeleteReply={deleteComment}
            onEditPost={editPost}
            onEditPrayer={editPrayer}
            onEditReply={editComment}
            onOpenProfile={openProfileSection}
            onPost={addPost}
            onAddPrayer={addPrayer}
            onBackToProfile={() => {
              setViewedProfile(null);
              setActiveSection("profile");
            }}
            onLeaveHouse={leaveHouse}
            onOpenSettings={() => setActiveSection("settings")}
            onPrayed={markPrayed}
            onProfileChange={(nextProfile) => {
              setViewedProfile(null);
              setProfile(nextProfile);
            }}
            onSelectHouse={setSelectedHouseId}
          />
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [hasEntered, setHasEntered] = useState(false);

  return hasEntered ? <Home /> : <Onboarding onContinue={() => setHasEntered(true)} />;
}
