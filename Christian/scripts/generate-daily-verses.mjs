import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARCHIVE_YEAR = 2025;
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "dailyVerses.js",
);
const ARCHIVE_MONTHS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);

const SPECIAL_BOOK_FILES = new Map([
  ["Psalm", "psalms"],
  ["Psalms", "psalms"],
  ["Song of Songs", "songofsolomon"],
]);

const BOOK_NAME_FIXES = new Map([["Psalm", "Psalms"]]);
const SINGLE_CHAPTER_BOOKS = new Set([
  "Obadiah",
  "Philemon",
  "2 John",
  "3 John",
  "Jude",
]);

const getArchiveReferences = async () => {
  const references = [];

  for (const month of ARCHIVE_MONTHS) {
    const url = `https://www.verseoftheday.com/archives/en/${ARCHIVE_YEAR}/${month}/`;
    const html = await fetch(url).then((response) => response.text());
    const matches = html.matchAll(/\d{2}\/\d{2}\/\d{4} - ([^<\n]+)/g);

    for (const match of matches) {
      references.push(match[1].trim());
    }
  }

  if (references.length !== 365) {
    throw new Error(`Expected 365 archive references, received ${references.length}.`);
  }

  return references;
};

const parseReference = (reference) => {
  const normalizedReference = reference.replace(/(?<=\d)[a-z]\b/gi, "");
  const match = normalizedReference.match(
    /^(?<book>[1-3]?\s?[A-Za-z ]+?)\s+(?<chapter>\d+):(?<verses>[\d,\- ]+)$/,
  );

  if (match?.groups) {
    const book = match.groups.book.trim();
    const chapter = Number(match.groups.chapter);
    const verseSegments = match.groups.verses
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .flatMap((segment) => {
        if (segment.includes("-")) {
          const [start, end] = segment.split("-").map(Number);
          return Array.from({ length: end - start + 1 }, (_, index) => start + index);
        }

        return [Number(segment)];
      });

    return {
      sourceReference: normalizedReference,
      book,
      chapter,
      verses: verseSegments,
    };
  }

  const singleChapterMatch = normalizedReference.match(
    /^(?<book>[1-3]?\s?[A-Za-z ]+?)\s+(?<verses>[\d,\- ]+)$/,
  );

  if (!singleChapterMatch?.groups) {
    throw new Error(`Unable to parse reference: ${reference}`);
  }

  const book = singleChapterMatch.groups.book.trim();

  if (!SINGLE_CHAPTER_BOOKS.has(book)) {
    throw new Error(`Unsupported chapter-free reference: ${reference}`);
  }

  const verses = singleChapterMatch.groups.verses
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((segment) => {
      if (segment.includes("-")) {
        const [start, end] = segment.split("-").map(Number);
        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
      }

      return [Number(segment)];
    });

  return {
    sourceReference: normalizedReference,
    book,
    chapter: 1,
    verses,
  };
};

const getBookSlug = (book) =>
  SPECIAL_BOOK_FILES.get(book) ?? book.toLowerCase().replaceAll(" ", "");

const getBookDisplayName = (book) => BOOK_NAME_FIXES.get(book) ?? book;

const loadChapterData = async (book, chapter) => {
  const bookSlug = getBookSlug(book);
  const url = `https://www.canonapi.com/v1/${bookSlug}/${chapter}.json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Unable to load WEB source for ${book} ${chapter} (${response.status}).`,
    );
  }

  return response.json();
};

const collectVerseText = (chapterVerses, parsedReference) => {
  const text = parsedReference.verses
    .map((verseNumber) => {
      const verseText = chapterVerses[verseNumber - 1];

      if (!verseText) {
        throw new Error(`Missing verse ${verseNumber} for ${parsedReference.sourceReference}`);
      }

      return verseText;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    reference: `${getBookDisplayName(parsedReference.book)} ${parsedReference.chapter}:${parsedReference.verses.join(",").replace(/,(\d+)-/g, ", $1-")}`,
    text,
  };
};

const buildDisplayReference = (sourceReference) => sourceReference.replace(/^Psalms /, "Psalm ");

const main = async () => {
  const references = await getArchiveReferences();
  const parsedReferences = references.map(parseReference);
  const chapterCache = new Map();

  for (const parsedReference of parsedReferences) {
    const cacheKey = `${parsedReference.book}:${parsedReference.chapter}`;
    if (chapterCache.has(cacheKey)) {
      continue;
    }

    const chapterData = await loadChapterData(
      parsedReference.book,
      parsedReference.chapter,
    );
    chapterCache.set(cacheKey, chapterData);
  }

  const verses = parsedReferences.map((parsedReference, index) => {
    const chapterData = chapterCache.get(`${parsedReference.book}:${parsedReference.chapter}`);
    const entry = collectVerseText(chapterData, parsedReference);

    return {
      day: index + 1,
      reference: buildDisplayReference(parsedReference.sourceReference),
      text: entry.text,
    };
  });

  const output = `export const dailyVerses = ${JSON.stringify(verses, null, 2)};\n`;

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, output);

  console.log(`Generated ${verses.length} daily verses at ${OUTPUT_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
