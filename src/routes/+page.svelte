<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { crossfade } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  const SAVE_KEY = "rsvp_state_v1";

  const [send, receive] = crossfade({
  duration: 350,
  easing: quintOut
  });

  let words = "Rapid serial visual presentation (RSVP) is a scientific method for studying the timing of vision. In RSVP, a sequence of stimuli is shown to an observer at one location in their visual field. The observer is instructed to report one of these stimuli - the target - which has a feature that differentiates it from the rest of the stream. For instance, observers may see a sequence of stimuli consisting of gray letters with the exception of one red letter. They are told to report the red letter. People make errors in this task in the form of reports of stimuli that occurred before or after the target. The position in time of the letter they report, relative to the target, is an estimate of the timing of visual selection on that trial.".split(" ");
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
  const startDelayMs = 350; // "kleiner delay" (stell das gerne auf 250–600)
  let startTimeout: ReturnType<typeof setTimeout> | null = null;
  let startAnimKey = 0;  // damit wir die Start-Animation sauber "triggern"
  let hasInitialized = false;

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
      // ignore broken JSON
    } finally {
      hasInitialized = true; // ✅ always runs
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
  // very small path join/normalize for EPUB internal paths
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
  // drop scripts/styles just in case
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

  // previous sentence
  let start = cur.start;
  if (cur.start > 0) {
    const prev = getSentenceBounds(cur.start - 1, words);
    start = prev.start;
  }

  // next sentence
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

  async function loadEpubFile(file: File): Promise<{ title: string | null; chapters: chapter[] }> {
  if (!browser) throw new Error("EPUB loading is only available in the browser");

  const { default: JSZip } = await import("jszip");

  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // 1) container.xml tells us where the OPF is
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("Invalid EPUB: META-INF/container.xml missing");

  const containerXml = await containerFile.async("string");
  const containerDoc = parseXml(containerXml);
  const rootfileEl = containerDoc.querySelector("rootfile");
  const opfPath = rootfileEl?.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: OPF path not found in container.xml");

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`Invalid EPUB: OPF file not found: ${opfPath}`);

  // 2) parse OPF to get title, manifest, spine order
  const opfXml = await opfFile.async("string");
  const opfDoc = parseXml(opfXml);

  const title =
    opfDoc.querySelector("metadata > title")?.textContent ||
    opfDoc.querySelector("dc\\:title")?.textContent ||
    opfDoc.querySelector("title")?.textContent ||
    null;

  // manifest: id -> href
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

  // spine order: itemref idref in reading order, skip linear="no"
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

  // skip EPUB nav doc explicitly if marked
  if ((item.properties || "").split(/\s+/).includes("nav")) continue;

  const internalPath = joinPath(opfBase, item.href);
  const entry = zip.file(internalPath);
  if (!entry) continue;

  const html = await entry.async("string");
  const text = getTextFromHtml(html);
  if (!text) continue;

  const titleGuess = pickChapterTitleFromHtml(html) || item.href;

  const skip = looksLikeFrontMatter(titleGuess, item.href, text);

  outChapters.push({
    idref,
    href: item.href,
    title: titleGuess,
    text,
    words: text.split(/\s+/).filter(Boolean),
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
    
    // pick first non-skipped chapter if skipFrontMatter enabled
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
    selectedChapterIndex = selectedChapterIndex; // keep chosen start
    restart();
  }
  } catch (err: any) {
    epubError = err?.message ?? "Failed to load EPUB";
  } finally {
    isLoadingEpub = false;
    input.value = ""; // allow re-uploading same file
  }
  }

  function looksLikeFrontMatter(title: string, href: string, text: string) {
  const t = (title || "").toLowerCase();
  const h = (href || "").toLowerCase();

  // filename/path heuristics
  const hrefBad =
    /toc|nav|contents|content|cover|copyright|titlepage|title-page|halftitle|half-title|frontmatter|front-matter|preface|foreword|introduction|dedication|acknowledg|colophon|imprint|about/i.test(
      h
    );

  // title heuristics
  const titleBad =
    /table of contents|contents|toc|cover|copyright|title page|preface|foreword|introduction|dedication|acknowledg|colophon|imprint|about/i.test(
      t
    );

  // content heuristics: very short chapters are often front-matter
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const tooShort = wordCount < 120; // tune if you want

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

  function msPerWord() {
    return Math.max(10, Math.round(60000 / wpm));
  }

  function start() {
  // wenn schon läuft oder schon im Start-Delay ist: nichts tun
  if (isPlaying || isStarting) return;

  pauseWindow = null;

  // falls noch irgendwas hängt
  if (timer) clearInterval(timer);
  timer = null;

  // Start-Animation triggern (neu mounten)
  startAnimKey += 1;

  // Zwischenzustand aktivieren: Wort fliegt rein
  isStarting = true;

  // nach kleinem Delay erst wirklich starten
  startTimeout = setTimeout(() => {
    isStarting = false;
    isPlaying = true;

    timer = setInterval(() => {
      if (index < words.length - 1) index += 1;
      else pause();
    }, msPerWord());
  }, startDelayMs);
  }

  function pause() {
  // Start-Delay abbrechen (falls gerade im "Anflug")
  if (startTimeout) clearTimeout(startTimeout);
  startTimeout = null;
  isStarting = false;

  isPlaying = false;

  if (timer) clearInterval(timer);
  timer = null;

  // Pausenfenster (3 Sätze) berechnen
  pauseWindow = getThreeSentenceWindow(index, words);
  }

  function restart() {
    pause();
    index = 0;
  }

  function back100() {
    // stop playback and jump back
    pause();

    index = Math.max(0, index - 100);

    // refresh pause window immediately
    pauseWindow = getThreeSentenceWindow(index, words);
  }

  let lastWpm = wpm;
  
  $: if (isPlaying && !isStarting && wpm !== lastWpm) {
  lastWpm = wpm;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (index < words.length - 1) index += 1;
    else pause();
  }, msPerWord());
  }
  
  function getORPLetterRank(letterCount: number): number {
  if (letterCount <= 3) return 0;
  if (letterCount <= 5) return 1;
  if (letterCount <= 9) return 2;
  return 3;
  }
  
  function splitWord(word: string) {
  // indices of letters in the ORIGINAL string (keeps punctuation in place)
  const letterMatches = [...word.matchAll(/[A-Za-z]/g)];
  const letterCount = letterMatches.length;

  // No letters: don't highlight anything
  if (letterCount === 0) {
    return { left: word, center: "", right: "" };
  }

  const rank = getORPLetterRank(letterCount);
  const clampedRank = Math.min(rank, letterCount - 1);
  const idx = letterMatches[clampedRank].index!; // index in original word

  return {
    left: word.slice(0, idx),
    center: word[idx],
    right: word.slice(idx + 1)
  };
  }
  onDestroy(() => pause());

  
  // Remaining time estimate (in seconds)
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

<main class="wrap">
  <div class="top-progress">
    <div class="top-progress-fill" style={`width:${progressPct}%`}>
    </div>
  </div>
  <div class="top-progress-meta">
    <span>{currentWordNumber} / {totalWords}</span>
    <span>{formatTime(remainingSeconds)} remaining</span>
  </div>
  <section class="display" aria-live="polite" aria-label="RSVP word display">
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

    <button on:click={back100} disabled={index === 0}>
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
  .wrap {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto ;
    gap: 8px;
    padding: 24px;
    box-sizing: border-box;
    padding-top: 6px; /* Platz für Meta + Bar */
  }

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
  
  .upload {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.18);
  background: white;
  cursor: pointer;
  user-select: none;
  }
  
  .upload input {
  display: none;
  }
  
  .error {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(212, 0, 0, 0.35);
  background: rgba(212, 0, 0, 0.06);
  }

  .display {
    display: grid;
    place-items: center;
    border-radius: 16px;
    border: 1px solid rgba(0,0,0,0.12);
  }

  .word {
  font-size: clamp(32px, 6vw, 72px);
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  display: grid;
  grid-template-columns: 1fr 1ch 1fr; /* equal space left/right => ORP is dead center */
  width: 100%;
  align-items: baseline;
  }
  
  .left { justify-self: end; white-space: pre; }
  .center { justify-self: center; color: #d40000; white-space: pre; }
  .right { justify-self: start; white-space: pre; }
  
  .controls {
    display: flex;
    justify-content: center;
    gap: 14px; /* spacing between buttons */
    align-items: center;
  }

  button {
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(0,0,0,0.18);
    background: white;
    cursor: pointer;
  }

  .bottom-bar {
    position: sticky;
    bottom: 0;
    padding: 14px 14px 18px;
    border-radius: 16px;
    border: 1px solid rgba(0,0,0,0.12);
    background: rgba(255,255,255,0.9);
    backdrop-filter: blur(8px);
  }

  .speed-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
  }

  .label { opacity: 0.75; }
  .value { font-weight: 700; }

  input[type="range"] {
    width: 100%;
  }
  .chapter-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  }
  
  .checkbox {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.12);
  background: rgba(255,255,255,0.7);
  }
  
  .select {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  }
  
  select {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.18);
  background: white;
  }

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
  color: #8a8a8a;
  }
  
  .pause-word {
  color: #8a8a8a; /* alles grau */
  }
  
  .current-word {
  color: #000000; /* aktuelles Wort weiß */
  font-weight: 700;
  }

  .word.starting {
  will-change: transform, opacity;
  }

  .top-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 20px;
  background: #8a8a8a;
  z-index: 9999;
  pointer-events: none;
  }

  .top-progress-fill {
  height: 100%;
  width: 0%;
  background: rgba(255, 255, 255, 0.95);
  transition: width 120ms linear;
  }

  .top-progress-meta {
  display: flex;
  justify-content: space-between;
  padding: 6px 12px 0 12px;

  font-size: 1rem;        /* größer */
  font-weight: 700;       /* wie .value */
  font-variant-numeric: tabular-nums;
  opacity: 1;

  pointer-events: none;
  }
</style>