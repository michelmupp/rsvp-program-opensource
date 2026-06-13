<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { crossfade } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  const SAVE_KEY = "rsvp_state_v1";

  const [send, receive] = crossfade({
    duration: 350,
    easing: quintOut
  });

  let words = splitIntoTokens("Rapid serial visual presentation (RSVP) is a scientific method for studying the timing of vision. In RSVP, a sequence of stimuli is shown to an observer at one location in their visual field. Nondestructively? translator-presumably. The observer is instructed to report one of these stimuli - the target - which has a feature that differentiates it from the rest of the stream. For instance, observers may see a sequence of stimuli consisting of gray letters with the exception of one red letter. They are told to report the red letter. People make errors in this task in the form of reports of stimuli that occurred before or after the target. The position in time of the letter they report, relative to the target, is an estimate of the timing of visual selection on that trial.");
  $: parts = splitWord(words[index] ?? "");
  $: totalWords = words.length;
  $: currentWordNumber = Math.min(index + 1, totalWords);
  $: progressPct = totalWords > 0 ? (currentWordNumber / totalWords) * 100 : 0;

  let isPlaying = false;
  let wpm = 300; // words per minute
  let selectedChapterIndex = 0;
  let skipFrontMatter = true; // user can toggle
  let index = 0;
  let currentBookId: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let isLoadingEpub = false;
  let epubError: string | null = null;
  let bookTitle: string | null = null;
  let isStarting = false;
  const startDelayMs = 350;
  let startTimeout: ReturnType<typeof setTimeout> | null = null;
  let startAnimKey = 0;
  let hasInitialized = false;

  let nightMode = false;

  function safeLoad(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeSave(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch {}
  }

  onMount(() => {
    if (!browser) return;
    const globalTheme = localStorage.getItem('glimpse-theme');
    if (globalTheme === 'dark') nightMode = true;
    else if (globalTheme === 'light') nightMode = false;
    else {
      nightMode = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    }
  });

  $: if (browser && hasInitialized) {
    localStorage.setItem('glimpse-theme', nightMode ? 'dark' : 'light');
    document.documentElement.classList.toggle("dark", nightMode);
  }

  type Chapter = {
    idref: string;
    href: string;
    title: string;
    text: string;
    words: string[];
    skip: boolean;
  };

  let chapters: Chapter[] = [];

  type SavedState = {
    bookId: string;
    wpm: number;
    skipFrontMatter: boolean;
    chapterIndex: number;
    wordIndex: number;
  };

  onMount(() => {
    if (!browser) return;

    const globalTheme = localStorage.getItem('glimpse-theme');
    if (globalTheme === 'dark') nightMode = true;
    else if (globalTheme === 'light') nightMode = false;
    else {
      nightMode = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    }

    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SavedState>;
        if (typeof saved.wpm === "number") wpm = saved.wpm;
        if (typeof saved.skipFrontMatter === "boolean") skipFrontMatter = saved.skipFrontMatter;
        if (
          typeof saved.bookId === "string" &&
          typeof saved.chapterIndex === "number" &&
          typeof saved.wordIndex === "number"
        ) {
          pendingRestore = {
            chapterIndex: saved.chapterIndex,
            wordIndex: saved.wordIndex,
            bookId: saved.bookId
          };
        }
      }
    } catch {
    } finally {
      hasInitialized = true;
    }
  });

  let pendingRestore: {
    chapterIndex: number;
    wordIndex: number;
    bookId: string;
  } | null = null;

  $: if (chapters.length > 0) {
    const chap = chapters[selectedChapterIndex];
    if (chap) words = chap.words;
  }

  function normalizeWhitespace(s: string) {
    return s.replace(/\s+/g, " ").trim();
  }

  function dirname(path: string) {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(0, i + 1) : "";
  }

  function joinPath(base: string, rel: string) {
    const full = (base + rel).split("/").filter(Boolean);
    const out: string[] = [];
    for (const part of full) {
      if (part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return out.join("/");
  }

  function parseXml(xml: string) {
    return new DOMParser().parseFromString(xml, "application/xml");
  }

  function getTextFromHtml(html: string) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, nav").forEach((n) => n.remove());
    return normalizeWhitespace(doc.body?.textContent ?? "");
  }

  function getSentenceBounds(idx: number, words: string[]) {
    let start = idx;
    while (start > 0 && !/[.!?]$/.test(words[start - 1])) start--;

    let end = idx;
    while (end < words.length - 1 && !/[.!?]$/.test(words[end])) end++;

    return { start, end };
  }

  function getThreeSentenceWindow(idx: number, words: string[]) {
    const cur = getSentenceBounds(idx, words);

    let start = cur.start;
    if (cur.start > 0) {
      const prev = getSentenceBounds(cur.start - 1, words);
      start = prev.start;
    }

    let end = cur.end;
    if (cur.end < words.length - 1) {
      const next = getSentenceBounds(cur.end + 1, words);
      end = next.end;
    }

    return { start, end };
  }

  let pauseWindow:
    | { start: number; end: number }
    | null = null;

  $: if (!isPlaying) {
    pauseWindow = getThreeSentenceWindow(index, words);
  }

  async function loadEpubFile(file: File): Promise<{ title: string | null; chapters: Chapter[] }> {
    if (!browser) throw new Error("EPUB loading is only available in the browser");

    const { default: JSZip } = await import("jszip");

    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) throw new Error("Invalid EPUB: META-INF/container.xml missing");

    const containerXml = await containerFile.async("string");
    const containerDoc = parseXml(containerXml);
    const rootfileEl = containerDoc.querySelector("rootfile");
    const opfPath = rootfileEl?.getAttribute("full-path");
    if (!opfPath) throw new Error("Invalid EPUB: OPF path not found in container.xml");

    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error(`Invalid EPUB: OPF file not found: ${opfPath}`);

    const opfXml = await opfFile.async("string");
    const opfDoc = parseXml(opfXml);

    const title =
      opfDoc.querySelector("metadata > title")?.textContent ||
      opfDoc.querySelector("dc\\:title")?.textContent ||
      opfDoc.querySelector("title")?.textContent ||
      null;

    const manifest = new Map<
      string,
      { href: string; mediaType?: string; properties?: string }
    >();

    opfDoc.querySelectorAll("manifest > item").forEach((item) => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      if (!id || !href) return;
      manifest.set(id, {
        href,
        mediaType: item.getAttribute("media-type") || undefined,
        properties: item.getAttribute("properties") || undefined
      });
    });

    const spineIdrefs: string[] = [];
    opfDoc.querySelectorAll("spine > itemref").forEach((itemref) => {
      const linear = (itemref.getAttribute("linear") || "yes").toLowerCase();
      if (linear === "no") return;
      const idref = itemref.getAttribute("idref");
      if (idref) spineIdrefs.push(idref);
    });

    if (spineIdrefs.length === 0) throw new Error("EPUB has an empty spine");

    const opfBase = dirname(opfPath);
    const outChapters: Chapter[] = [];

    for (const idref of spineIdrefs) {
      const item = manifest.get(idref);
      if (!item) continue;

      if ((item.properties || "").split(/\s+/).includes("nav")) continue;

      const internalPath = joinPath(opfBase, item.href);
      const entry = zip.file(internalPath);
      if (!entry) continue;

      const html = await entry.async("string");
      const text = getTextFromHtml(html);
      if (!text) continue;

      const rawTitle = pickChapterTitleFromHtml(html) || item.href;
      const titleGuess = rawTitle.replace(/,\s*.+$/, '').trim();
      const skip = looksLikeFrontMatter(titleGuess, item.href, text);

      outChapters.push({
        idref,
        href: item.href,
        title: titleGuess,
        text,
        words: splitIntoTokens(text),
        skip
      });
    }

    if (outChapters.length === 0) throw new Error("Could not extract chapters from EPUB");

    return { title, chapters: outChapters };
  }

  async function onPickEpub(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    currentBookId = `${file.name}-${file.size}`;

    epubError = null;
    isLoadingEpub = true;

    try {
      const { title, chapters: loaded } = await loadEpubFile(file);
      bookTitle = title;

      chapters = loaded;

      if (skipFrontMatter) {
        const firstGood = chapters.findIndex((c) => !c.skip);
        selectedChapterIndex = firstGood >= 0 ? firstGood : 0;
      } else {
        selectedChapterIndex = 0;
      }

      if (pendingRestore && currentBookId && pendingRestore.bookId === currentBookId) {
        const chap = Math.max(0, Math.min(pendingRestore.chapterIndex, chapters.length - 1));
        selectedChapterIndex = chap;

        const wi = Math.max(
          0,
          Math.min(pendingRestore.wordIndex, chapters[chap].words.length - 1)
        );

        pause();
        index = wi;
        pauseWindow = getThreeSentenceWindow(index, chapters[chap].words);

        pendingRestore = null;
      } else {
        selectedChapterIndex = selectedChapterIndex;
        restart();
      }
    } catch (err: any) {
      epubError = err?.message ?? "Failed to load EPUB";
    } finally {
      isLoadingEpub = false;
      input.value = "";
    }
  }

  function looksLikeFrontMatter(title: string, href: string, text: string) {
    const t = (title || "").toLowerCase();
    const h = (href || "").toLowerCase();

    const hrefBad =
      /toc|nav|contents|content|cover|copyright|titlepage|title-page|halftitle|half-title|frontmatter|front-matter|preface|foreword|introduction|dedication|acknowledg|colophon|imprint|about/i.test(
        h
      );

    const titleBad =
      /table of contents|contents|toc|cover|copyright|title page|preface|foreword|introduction|dedication|acknowledg|colophon|imprint|about/i.test(
        t
      );

    const wordCount = splitIntoTokens(text).length;
    const tooShort = wordCount < 120;

    return hrefBad || titleBad || tooShort;
  }

  function pickChapterTitleFromHtml(html: string) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const h =
      doc.querySelector("h1")?.textContent?.trim() ||
      doc.querySelector("h2")?.textContent?.trim() ||
      doc.querySelector("title")?.textContent?.trim() ||
      "";
    return normalizeWhitespace(h);
  }

  // ── Token splitting: trenne Bindestrich-Wörter ──
  function splitIntoTokens(text: string): string[] {
    return text
      .split(/\s+/)
      .filter(Boolean)
      .flatMap(word => {
        const parts = word.split(/(?<=[a-zA-ZäöüÄÖÜ])-(?=[a-zA-ZäöüÄÖÜ])/);
        if (parts.length <= 1) return [word];
        return parts.map((p, i) => i < parts.length - 1 ? p + "-" : p);
      });
  }

  function msPerWord(word: string = "") {
    const base = Math.max(10, Math.round(60000 / wpm));
    if (/[.!?]$/.test(word)) return base * 2.5;
    if (/-$/.test(word))     return base * 1.8;
    if (/[,;:\-—]$/.test(word)) return base * 1.5;
    if (/["„"»«]$/.test(word))  return base * 1.3;
    return base;
  }

  function scheduleNext() {
    timer = setTimeout(() => {
      if (index < words.length - 1) {
        index += 1;
        scheduleNext();
      } else {
        pause();
      }
    }, msPerWord(words[index]));
  }

  function start() {
    if (isPlaying || isStarting) return;

    pauseWindow = null;

    if (timer) clearTimeout(timer);
    timer = null;

    startAnimKey += 1;
    isStarting = true;

    startTimeout = setTimeout(() => {
      isStarting = false;
      isPlaying = true;
      scheduleNext();
    }, startDelayMs);
  }

  function pause() {
    if (startTimeout) clearTimeout(startTimeout);
    startTimeout = null;
    isStarting = false;

    const wordsRead = index - sessionStartIndex;
    saveReadingWords(wordsRead);
    sessionStartIndex = index;
    isPlaying = false;

    if (timer) clearTimeout(timer);
    timer = null;

    pauseWindow = getThreeSentenceWindow(index, words);
  }

  let holdActive = false;

  function holdStart(e: Event) {
    e.preventDefault();
    holdActive = true;
    if (isPlaying || isStarting) return;
    start();
  }

  function holdEnd() {
    if (!holdActive) return;
    holdActive = false;
    if (isPlaying || isStarting) pause();
  }

  function restart() {
    pause();
    sessionStartIndex = 0;
    index = 0;
  }

  function backSentence() {
    pause();

    if (!words.length) return;

    const current = getSentenceBounds(index, words);

    if (current.start === 0) {
      index = 0;
    } else {
      const previous = getSentenceBounds(current.start - 1, words);
      index = previous.start;
    }

    pauseWindow = getThreeSentenceWindow(index, words);
  }

  let lastWpm = wpm;

  $: if (isPlaying && !isStarting && wpm !== lastWpm) {
    lastWpm = wpm;
  }

  function getORPLetterRank(letterCount: number): number {
    if (letterCount <= 3) return 0;
    if (letterCount <= 5) return 1;
    if (letterCount <= 9) return 2;
    return 3;
  }

  function splitWord(word: string) {
    const letterMatches = [...word.matchAll(/[A-Za-z]/g)];
    const letterCount = letterMatches.length;

    if (letterCount === 0) {
      return { left: word, center: "", right: "" };
    }

    const rank = getORPLetterRank(letterCount);
    const clampedRank = Math.min(rank, letterCount - 1);
    const idx = letterMatches[clampedRank].index!;

    return {
      left: word.slice(0, idx),
      center: word[idx],
      right: word.slice(idx + 1)
    };
  }

  onDestroy(() => pause());

  let sessionStartIndex = 0;

  function saveReadingWords(wordsRead: number) {
    if (wordsRead <= 0) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const log = JSON.parse(localStorage.getItem('reading-log') || '[]');
      const existing = log.find((e: any) => e.date === today && e.source === 'rsvp');
      if (existing) { existing.words += wordsRead; }
      else { log.push({ date: today, words: wordsRead, source: 'rsvp' }); }
      localStorage.setItem('reading-log', JSON.stringify(log));
    } catch {}
  }

  $: remainingWords = totalWords > 0 ? Math.max(0, totalWords - currentWordNumber) : 0;
  $: remainingSeconds = wpm > 0 ? Math.ceil((remainingWords / wpm) * 60) : 0;

  $: if (browser && hasInitialized) {
    const state: Partial<SavedState> = { wpm, skipFrontMatter };

    if (currentBookId) {
      state.bookId = currentBookId;
      state.chapterIndex = selectedChapterIndex;
      state.wordIndex = index;
    }

    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
</script>

<main class="wrap" class:dark={nightMode}>
  <div class="top-progress">
    <div class="top-progress-fill" style={`width:${progressPct}%`}>
    </div>
  </div>
  <div class="top-progress-meta">
    <span class="meta-left">
      {currentWordNumber} / {totalWords}
    </span>
    <span class="meta-right">
      {formatTime(remainingSeconds)} remaining
    </span>
  </div>

  <button class="stats-btn" on:click={() => goto('/reader/stats')} aria-label="Statistiken">
    📖
  </button>
  <section class="display" 
  aria-live="polite" 
  aria-label="RSVP word display"
  on:mousedown={holdStart}
  on:mouseup={holdEnd}
  on:mouseleave={holdEnd}
  on:touchstart={holdStart}
  on:touchend={holdEnd}
  on:touchcancel={holdEnd}>
  {#if isStarting}
  <div class="word starting" in:receive={"rsvp-word"}>
    <span class="left">{parts.left}</span>
    <span class="center">{parts.center}</span>
    <span class="right">{parts.right}</span>
  </div>

  {:else if isPlaying}
    <div class="word">
      <span class="left">{parts.left}</span>
      <span class="center">{parts.center}</span>
      <span class="right">{parts.right}</span>
    </div>

  {:else}
  {#if pauseWindow}
    <div class="sentence paused-view">
      {#each words.slice(pauseWindow.start, pauseWindow.end + 1) as word, i}
        {@const absoluteIndex = pauseWindow.start + i}
        {#if absoluteIndex === index}
          <span class="pause-word current-word" out:send={"rsvp-word"}>
            {word + " "}
          </span>
        {:else}
          <span class="pause-word">
            {word + " "}
          </span>
        {/if}
      {/each}
    </div>
  {/if}
  {/if}
  </section>

  <section class="top-bar" aria-label="EPUB loader">
  <div class="top-row">
    <div class="title">
      {#if bookTitle}
        <strong>{bookTitle}</strong>
      {:else}
        <strong>EPUB RSVP Reader</strong>
      {/if}
    </div>

    {#if chapters.length > 0}
  <div class="chapter-controls">
    <label class="checkbox">
      <input type="checkbox" bind:checked={skipFrontMatter} />
      Skip TOC / front-matter
    </label>

    <label class="select">
      <span>Chapter</span>
      <select
        bind:value={selectedChapterIndex}
        on:change={() => { restart(); }}
      >
        {#each chapters as c, i}
          {#if !skipFrontMatter || !c.skip}
            <option value={i}>
              {c.skip && !skipFrontMatter ? "(front) " : ""}{c.title}
            </option>
          {/if}
        {/each}
      </select>
    </label>
  </div>
  {/if}

    <label class="upload">
      <input type="file" accept=".epub" on:change={onPickEpub} />
      {#if isLoadingEpub}
        Loading…
      {:else}
        Upload EPUB
      {/if}
    </label>
  </div>

  {#if epubError}
    <div class="error" role="alert">{epubError}</div>
  {/if}
  </section>

  <section class="controls" aria-label="Playback controls">
    <button on:click={restart}>Restart</button>

    {#if isPlaying || isStarting}
      <button on:click={pause}>Pause</button>
    {:else}
      <button on:click={start}>Play</button>
    {/if}

    <button on:click={backSentence} disabled={index === 0}>
  Back
</button>
  </section>
  <section class="bottom-bar" aria-label="Reading speed control">
    <div class="speed-row">
      <span class="label">Speed</span>
      <span class="value">{wpm} WPM</span>
    </div>

    <input
      type="range"
      min="100"
      max="1000"
      step="25"
      bind:value={wpm}
      aria-label="Words per minute"
    />
  </section>
</main>

<style>
  /* ── Layout ── */
  .wrap {
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 12px;
    padding: 24px;
    box-sizing: border-box;
    padding-top: 80px;
  }

  /* ── Progress bar ── */
  .top-progress {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: var(--border);
    z-index: 9999;
    pointer-events: all;
  }

  .top-progress-fill {
    height: 100%;
    width: 0%;
    background: var(--accent);
    transition: width 120ms linear;
    border-radius: 0 2px 2px 0;
  }

  .top-progress-meta {
    display: flex;
    justify-content: space-between;
    padding: 8px 4px 0;
    font-size: 0.85rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    pointer-events: none;
  }

  /* ── Top bar ── */
  .top-bar {
    display: grid;
    gap: 10px;
  }

  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .title strong {
    font-size: 1.1rem;
    font-weight: 800;
    letter-spacing: -0.3px;
    color: var(--text);
  }

  /* ── Upload button — pill style like landing CTA ── */
  .upload {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 50px;
    border: none;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    user-select: none;
    box-shadow: 0 4px 16px var(--accent-shadow);
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .upload:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 22px var(--accent-shadow);
  }

  .upload input {
    display: none;
  }

  /* ── Chapter controls ── */
  .chapter-controls {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .checkbox {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 8px 14px;
    border-radius: 50px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font-size: 0.875rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }

  .select {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 0.875rem;
    color: var(--muted);
  }

  select {
    padding: 8px 14px;
    border-radius: 50px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font-size: 0.875rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }

  /* ── Error ── */
  .error {
    padding: 10px 14px;
    border-radius: 16px;
    border: 1px solid rgba(232, 115, 74, 0.35);
    background: rgba(232, 115, 74, 0.08);
    font-size: 0.9rem;
    color: var(--accent);
  }

  /* ── Word display ── */
  .display {
    display: grid;
    place-items: center;
    border-radius: 24px;
    border: 1px solid var(--border);
    background: var(--panel);
    box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    touch-action: manipulation;
  }

  .word {
    font-size: clamp(32px, 6vw, 72px);
    font-weight: 800;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    display: grid;
    grid-template-columns: 1fr 1ch 1fr;
    width: 100%;
    align-items: baseline;
  }

  .left   { justify-self: end;    white-space: pre; }
  .center { justify-self: center; white-space: pre; color: var(--accent); }
  .right  { justify-self: start;  white-space: pre; }

  /* ── Paused sentence view ── */
  .sentence {
    font-size: 1.6rem;
    max-width: 600px;
    margin: auto;
    text-align: center;
    line-height: 1.6;
    padding: 20px;
  }

  .paused-view {
    font-size: 1.6rem;
    max-width: 700px;
    margin: auto;
    text-align: center;
    line-height: 1.8;
    color: var(--muted);
    overflow-y: auto;
    max-height: 35vh;
    padding: 12px;
  }

  .pause-word   { color: var(--muted); }
  .current-word { color: var(--text); font-weight: 700; }
  .word.starting { will-change: transform, opacity; }

  /* ── Controls ── */
  .controls {
    display: flex;
    justify-content: center;
    gap: 12px;
    align-items: center;
  }

  button {
    padding: 10px 22px;
    border-radius: 50px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    transition: transform 0.12s, box-shadow 0.12s;
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── Bottom bar ── */
  .bottom-bar {
    position: sticky;
    bottom: 0;
    padding: 16px 20px 20px;
    border-radius: 24px;
    border: 1px solid var(--border);
    background: var(--panel);
    box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    backdrop-filter: blur(8px);
  }

  .speed-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
  }

  .label { color: var(--muted); font-size: 0.875rem; }
  .value { font-weight: 800; color: var(--accent); }

  input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
  }

  @media (max-width: 430px) {
    .paused-view { font-size: 1.1rem; line-height: 1.5; }
  }

.stats-btn {
    position: fixed;
    top: 20px;
    right: 76px;
    z-index: 1000;
    background: var(--panel);
    border: none;
    border-radius: 14px;
    width: 44px;
    height: 44px;
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s, box-shadow 0.15s;
    pointer-events: all;
    padding: 0;
  }

  .stats-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  }
</style>