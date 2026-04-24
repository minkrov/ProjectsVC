import { useEffect, useMemo, useState } from "react";
import { dailyVerses } from "./data/dailyVerses";

const STORAGE_KEY = "one-body-posts-v1";
const MAX_POST_LENGTH = 280;

const sections = [
  { label: "Home", active: true },
  { label: "Prayer Wall", soon: true },
  { label: "Discussions", soon: true },
  { label: "Bible Study", soon: true },
  { label: "Common Ground", soon: true },
  { label: "Profile", soon: true },
];

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

const readStoredPosts = () => {
  try {
    const storedPosts = window.localStorage.getItem(STORAGE_KEY);
    if (!storedPosts) {
      return [];
    }

    const parsedPosts = JSON.parse(storedPosts);
    return Array.isArray(parsedPosts) ? parsedPosts : [];
  } catch {
    return [];
  }
};

const formatPostTime = (createdAt) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));

const DAILY_VERSE_REFERENCE_YEAR = 2025;

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
        <p className="eyebrow">One Body</p>
        <h1 id="welcome-title">Walk in truth, speak with love.</h1>
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

function Drawer({ isOpen, onClose }) {
  const dailyVerse = getDailyVerse();

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
            <h2>One Body</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close menu" onClick={onClose}>
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <nav className="section-list" aria-label="One Body sections">
          {sections.map((section) => (
            <button
              className={`section-item ${section.active ? "is-active" : ""}`}
              type="button"
              disabled={section.soon}
              key={section.label}
              onClick={section.active ? onClose : undefined}
            >
              <span>{section.label}</span>
              {section.soon ? <span className="soon-pill">Soon</span> : null}
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

function Composer({ onPost }) {
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
      <div className="avatar" aria-hidden="true">
        OB
      </div>
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

function PostItem({ post }) {
  return (
    <article className="post-item">
      <div className="avatar avatar-small" aria-hidden="true">
        OB
      </div>
      <div className="post-content">
        <header>
          <strong>You</strong>
          <span>@testing</span>
          <span>{formatPostTime(post.createdAt)}</span>
        </header>
        <p>{post.body}</p>
      </div>
    </article>
  );
}

function Home() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [posts, setPosts] = useState(readStoredPosts);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  }, [posts]);

  const sortedPosts = useMemo(
    () => posts.toSorted((firstPost, secondPost) => secondPost.createdAt - firstPost.createdAt),
    [posts],
  );

  const addPost = (body) => {
    setPosts((currentPosts) => [
      ...currentPosts,
      {
        id: crypto.randomUUID(),
        body,
        createdAt: Date.now(),
      },
    ]);
  };

  return (
    <main className="app-shell">
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <section className="feed-shell" aria-label="Home feed">
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
            <p>One Body</p>
            <h1>Home</h1>
          </div>
        </header>

        <Composer onPost={addPost} />

        <div className="feed-divider" />

        {sortedPosts.length > 0 ? (
          <div aria-label="Posts">
            {sortedPosts.map((post) => (
              <PostItem post={post} key={post.id} />
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
      </section>
    </main>
  );
}

export default function App() {
  const [hasEntered, setHasEntered] = useState(false);

  return hasEntered ? <Home /> : <Onboarding onContinue={() => setHasEntered(true)} />;
}
