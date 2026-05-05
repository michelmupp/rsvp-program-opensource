<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  const API = 'https://rsvp-program-opensource-production.up.railway.app';

  type LogEntry = {
    date: string;
    words: number;
    source: 'rsvp' | 'manual';
    note?: string;
  };

  type DaySum = { date: string; rsvp: number; manual: number; total: number; label: string };

  // ── State ──────────────────────────────────────────────────
  let log: LogEntry[] = [];
  let activeTab: 'chart' | 'log' | 'sync' = 'chart';
  let chartView: 'week' | 'month' = 'week';

  // Manual entry
  let manualDate = new Date().toISOString().slice(0, 10);
  let manualWords = '';
  let manualNote = '';
  let manualSuccess = false;

  // Sync
  let syncUsername = '';
  let syncPin = '';
  let syncStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let syncMessage = '';
  let isLoggedIn = false;
  let isRegistering = false;

  onMount(() => {
    try {
      log = JSON.parse(localStorage.getItem('reading-log') || '[]');
      const saved = localStorage.getItem('sync-credentials');
      if (saved) {
        const { username, pin } = JSON.parse(saved);
        syncUsername = username;
        syncPin = pin;
        isLoggedIn = true;
      }
    } catch {}
  });

  function saveLog() {
    localStorage.setItem('reading-log', JSON.stringify(log));
  }

  // ── Manual entry ───────────────────────────────────────────
  function addManual() {
    const w = parseInt(manualWords);
    if (!manualDate || isNaN(w) || w <= 0) return;
    const existing = log.find(e => e.date === manualDate && e.source === 'manual');
    if (existing) {
      existing.words += w;
      if (manualNote.trim()) existing.note = manualNote.trim();
    } else {
      log.push({ date: manualDate, words: w, source: 'manual', note: manualNote.trim() || undefined });
    }
    log = [...log].sort((a, b) => b.date.localeCompare(a.date));
    saveLog();
    manualWords = '';
    manualNote = '';
    manualSuccess = true;
    setTimeout(() => manualSuccess = false, 2000);
  }

  function deleteEntry(idx: number) {
    log = log.filter((_, i) => i !== idx);
    saveLog();
  }

  // ── Sync ───────────────────────────────────────────────────
  async function register() {
    syncStatus = 'loading'; syncMessage = '';
    try {
      const res = await fetch(`${API}/sync/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: syncUsername, pin: syncPin }) });
      const data = await res.json();
      if (!res.ok) { syncStatus = 'error'; syncMessage = data.error; return; }
      localStorage.setItem('sync-credentials', JSON.stringify({ username: syncUsername, pin: syncPin }));
      isLoggedIn = true; isRegistering = false; syncStatus = 'success';
      syncMessage = 'Account erstellt! Du kannst jetzt synchronisieren.';
    } catch { syncStatus = 'error'; syncMessage = 'Server nicht erreichbar'; }
  }

  async function login() {
    syncStatus = 'loading'; syncMessage = '';
    try {
      const res = await fetch(`${API}/sync/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: syncUsername, pin: syncPin }) });
      const data = await res.json();
      if (!res.ok) { syncStatus = 'error'; syncMessage = data.error; return; }
      localStorage.setItem('sync-credentials', JSON.stringify({ username: syncUsername, pin: syncPin }));
      isLoggedIn = true; syncStatus = 'success'; syncMessage = 'Eingeloggt!';
    } catch { syncStatus = 'error'; syncMessage = 'Server nicht erreichbar'; }
  }

  async function pushToServer() {
    syncStatus = 'loading'; syncMessage = '';
    try {
      const res = await fetch(`${API}/sync/push`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: syncUsername, pin: syncPin, log }) });
      const data = await res.json();
      if (!res.ok) { syncStatus = 'error'; syncMessage = data.error; return; }
      syncStatus = 'success'; syncMessage = `${log.length} Einträge hochgeladen ✓`;
    } catch { syncStatus = 'error'; syncMessage = 'Server nicht erreichbar'; }
  }

  async function pullFromServer() {
    syncStatus = 'loading'; syncMessage = '';
    try {
      const res = await fetch(`${API}/sync/pull?username=${encodeURIComponent(syncUsername)}&pin=${encodeURIComponent(syncPin)}`);
      const data = await res.json();
      if (!res.ok) { syncStatus = 'error'; syncMessage = data.error; return; }
      log = data.log; saveLog();
      syncStatus = 'success'; syncMessage = `${log.length} Einträge heruntergeladen ✓`;
    } catch { syncStatus = 'error'; syncMessage = 'Server nicht erreichbar'; }
  }

  function logout() {
    localStorage.removeItem('sync-credentials');
    isLoggedIn = false; syncUsername = ''; syncPin = ''; syncStatus = 'idle'; syncMessage = '';
  }

  // ── Aggregated by day ──────────────────────────────────────
  $: daySums = (() => {
    const map = new Map<string, DaySum>();
    for (const e of log) {
      const existing = map.get(e.date);
      if (existing) {
        if (e.source === 'rsvp') existing.rsvp += e.words;
        else existing.manual += e.words;
        existing.total += e.words;
      } else {
        map.set(e.date, { date: e.date, rsvp: e.source === 'rsvp' ? e.words : 0, manual: e.source === 'manual' ? e.words : 0, total: e.words, label: '' });
      }
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  })();

  // ── Week chart (last 7 days) ───────────────────────────────
  $: chartDays = (() => {
    const days: { label: string; date: string; rsvp: number; manual: number; total: number }[] = [];
    const today = new Date();
    const dayLabels = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = daySums.find(s => s.date === key);
      days.push({ label: dayLabels[d.getDay()], date: key, rsvp: found?.rsvp ?? 0, manual: found?.manual ?? 0, total: found?.total ?? 0 });
    }
    return days;
  })();

  // ── Month chart (last 4 weeks grouped) ────────────────────
  $: monthWeeks = (() => {
    const weeks: { label: string; rsvp: number; manual: number; total: number }[] = [];
    const today = new Date();
    for (let w = 3; w >= 0; w--) {
      let rsvp = 0, manual = 0;
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() - w * 7 - d);
        const key = date.toISOString().slice(0, 10);
        const found = daySums.find(s => s.date === key);
        if (found) { rsvp += found.rsvp; manual += found.manual; }
      }
      weeks.unshift({ label: w === 0 ? 'Diese W.' : w === 1 ? 'Letzte W.' : `Vor ${w}W`, rsvp, manual, total: rsvp + manual });
    }
    return weeks;
  })();

  $: maxWeek = Math.max(...chartDays.map(d => d.total), 1);
  $: maxMonth = Math.max(...monthWeeks.map(w => w.total), 1);

  // ── Trend analysis ─────────────────────────────────────────
  $: thisWeekTotal = chartDays.reduce((s, d) => s + d.total, 0);

  $: lastWeekTotal = (() => {
    const today = new Date();
    let total = 0;
    for (let i = 7; i < 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = daySums.find(s => s.date === key);
      if (found) total += found.total;
    }
    return total;
  })();

  $: trendPct = lastWeekTotal > 0 ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100) : null;
  $: trendUp = trendPct !== null && trendPct >= 0;

  // ── Streak ─────────────────────────────────────────────────
  $: streak = (() => {
    const today = new Date();
    let count = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = daySums.find(s => s.date === key);
      if (found && found.total > 0) count++;
      else if (i > 0) break;
    }
    return count;
  })();

  // ── Best day ───────────────────────────────────────────────
  $: bestDay = daySums.reduce((best, d) => d.total > (best?.total ?? 0) ? d : best, daySums[0] ?? null);

  // ── Summary numbers ────────────────────────────────────────
  $: totalAllTime = log.reduce((s, e) => s + e.words, 0);
  $: todayKey = new Date().toISOString().slice(0, 10);
  $: todayTotal = log.filter(e => e.date === todayKey).reduce((s, e) => s + e.words, 0);

  function fmtWords(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function fmtDate(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
</script>

<main>
  <nav>
    <button class="nav-btn" on:click={() => goto('/reader')} aria-label="Zurück">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  </nav>

  <div class="hero">
    <div class="logo">
      <span class="logo-icon">📖</span>
      <h1>Lesetracking</h1>
    </div>

    <!-- Summary cards -->
    <div class="cards">
      <div class="card">
        <span class="card-icon">📅</span>
        <span class="card-value">{fmtWords(todayTotal)}</span>
        <span class="card-label">Heute</span>
      </div>
      <div class="card">
        <span class="card-icon">🔥</span>
        <span class="card-value">{streak}</span>
        <span class="card-label">{streak === 1 ? 'Tag Streak' : 'Tage Streak'}</span>
      </div>
      <div class="card">
        <span class="card-icon">🏆</span>
        <span class="card-value">{fmtWords(totalAllTime)}</span>
        <span class="card-label">Gesamt</span>
      </div>
    </div>

    <!-- Trend row -->
    <div class="trend-row">
      <div class="trend-card">
        <span class="trend-label">Diese Woche vs. letzte Woche</span>
        {#if trendPct === null}
          <span class="trend-value neutral">Noch keine Vorwoche</span>
        {:else}
          <span class="trend-value" class:up={trendUp} class:down={!trendUp}>
            {trendUp ? '↑' : '↓'} {Math.abs(trendPct)}%
          </span>
        {/if}
      </div>
      {#if bestDay}
        <div class="trend-card">
          <span class="trend-label">Bester Tag</span>
          <span class="trend-value up">{fmtWords(bestDay.total)}</span>
          <span class="trend-sub">{fmtDate(bestDay.date)}</span>
        </div>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab" class:active={activeTab === 'chart'} on:click={() => activeTab = 'chart'}>Verlauf</button>
      <button class="tab" class:active={activeTab === 'log'}   on:click={() => activeTab = 'log'}>Eintragen</button>
      <button class="tab" class:active={activeTab === 'sync'}  on:click={() => activeTab = 'sync'}>☁️ Sync</button>
    </div>

    <!-- CHART TAB -->
    {#if activeTab === 'chart'}
      <div class="chart-box">
        <div class="chart-header">
          <p class="chart-title">Wörter gelesen</p>
          <div class="view-toggle">
            <button class:active={chartView === 'week'} on:click={() => chartView = 'week'}>Woche</button>
            <button class:active={chartView === 'month'} on:click={() => chartView = 'month'}>Monat</button>
          </div>
        </div>

        {#if chartView === 'week'}
          {#if maxWeek <= 1}
            <p class="empty-hint">Noch keine Daten. Lese etwas im RSVP Reader oder trage manuell ein.</p>
          {:else}
            <div class="bar-chart">
              {#each chartDays as day}
                <div class="bar-col">
                  <span class="bar-count">{day.total > 0 ? fmtWords(day.total) : ''}</span>
                  <div class="bar-track">
                    <div class="bar-wrap" style="height:{(day.total / maxWeek) * 100}%">
                      <div class="bar-manual" style="height:{day.total > 0 ? (day.manual / day.total) * 100 : 0}%"></div>
                      <div class="bar-rsvp"   style="height:{day.total > 0 ? (day.rsvp   / day.total) * 100 : 0}%"></div>
                    </div>
                  </div>
                  <span class="bar-label">{day.label}</span>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          {#if maxMonth <= 1}
            <p class="empty-hint">Noch keine Daten.</p>
          {:else}
            <div class="bar-chart">
              {#each monthWeeks as week}
                <div class="bar-col">
                  <span class="bar-count">{week.total > 0 ? fmtWords(week.total) : ''}</span>
                  <div class="bar-track">
                    <div class="bar-wrap" style="height:{(week.total / maxMonth) * 100}%">
                      <div class="bar-manual" style="height:{week.total > 0 ? (week.manual / week.total) * 100 : 0}%"></div>
                      <div class="bar-rsvp"   style="height:{week.total > 0 ? (week.rsvp   / week.total) * 100 : 0}%"></div>
                    </div>
                  </div>
                  <span class="bar-label">{week.label}</span>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        <div class="legend">
          <div class="legend-item"><span class="legend-dot" style="background:#e8734a"></span><span>RSVP Reader</span></div>
          <div class="legend-item"><span class="legend-dot" style="background:#5ba3c9"></span><span>Manuell</span></div>
        </div>
      </div>

      <!-- Trend details -->
      {#if lastWeekTotal > 0 || thisWeekTotal > 0}
        <div class="chart-box">
          <p class="chart-title">Trendanalyse</p>
          <div class="trend-details">
            <div class="trend-detail-row">
              <span class="breakdown-key">Diese Woche</span>
              <span class="breakdown-val">{fmtWords(thisWeekTotal)} Wörter</span>
            </div>
            <div class="trend-detail-row">
              <span class="breakdown-key">Letzte Woche</span>
              <span class="breakdown-val">{fmtWords(lastWeekTotal)} Wörter</span>
            </div>
            <div class="trend-detail-row">
              <span class="breakdown-key">Differenz</span>
              <span class="breakdown-val" class:positive={thisWeekTotal >= lastWeekTotal} class:negative={thisWeekTotal < lastWeekTotal}>
                {thisWeekTotal >= lastWeekTotal ? '+' : ''}{fmtWords(thisWeekTotal - lastWeekTotal)} Wörter
              </span>
            </div>
            <div class="trend-detail-row">
              <span class="breakdown-key">Ø pro Tag (diese Woche)</span>
              <span class="breakdown-val">{fmtWords(Math.round(thisWeekTotal / 7))}</span>
            </div>
            <div class="trend-detail-row">
              <span class="breakdown-key">Aktueller Streak</span>
              <span class="breakdown-val">🔥 {streak} {streak === 1 ? 'Tag' : 'Tage'}</span>
            </div>
          </div>
        </div>
      {/if}

      <!-- History list -->
      {#if daySums.length > 0}
        <div class="chart-box">
          <p class="chart-title">Alle Tage</p>
          <div class="history-list">
            {#each daySums as day}
              <div class="history-row">
                <span class="history-date">{fmtDate(day.date)}</span>
                <div class="history-pills">
                  {#if day.rsvp > 0}<span class="pill rsvp">{fmtWords(day.rsvp)} RSVP</span>{/if}
                  {#if day.manual > 0}<span class="pill manual">{fmtWords(day.manual)} Buch</span>{/if}
                </div>
                <span class="history-total">{fmtWords(day.total)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    <!-- MANUAL ENTRY TAB -->
    {:else if activeTab === 'log'}
      <div class="chart-box">
        <p class="chart-title">Physisches Buch eintragen</p>
        <div class="form">
          <label class="field">
            <span class="field-label">Datum</span>
            <input type="date" bind:value={manualDate} max={new Date().toISOString().slice(0,10)} />
          </label>
          <label class="field">
            <span class="field-label">Gelesene Wörter</span>
            <input type="number" placeholder="z.B. 5000" bind:value={manualWords} min="1"
              on:keydown={(e) => e.key === 'Enter' && addManual()} />
          </label>
          <label class="field">
            <span class="field-label">Notiz (optional)</span>
            <input type="text" placeholder="z.B. Kapitel 5–8, Project Hail Mary"
              bind:value={manualNote} maxlength="60"
              on:keydown={(e) => e.key === 'Enter' && addManual()} />
          </label>
          <button class="submit-btn" on:click={addManual} disabled={!manualWords || parseInt(manualWords) <= 0}>
            {manualSuccess ? '✓ Eingetragen!' : 'Eintragen'}
          </button>
        </div>
        <p class="form-hint">💡 Tipp: ⌀ Buchkapitel ~3.000–6.000 Wörter. Eine Seite ~250–300 Wörter.</p>
      </div>

      {#if log.filter(e => e.source === 'manual').length > 0}
        <div class="chart-box">
          <p class="chart-title">Manuelle Einträge</p>
          <div class="history-list">
            {#each log.filter(e => e.source === 'manual').sort((a,b) => b.date.localeCompare(a.date)) as entry}
              <div class="history-row">
                <div class="history-left">
                  <span class="history-date">{fmtDate(entry.date)}</span>
                  {#if entry.note}<span class="history-note">{entry.note}</span>{/if}
                </div>
                <span class="pill manual">{fmtWords(entry.words)}</span>
                <button class="delete-btn" on:click={() => deleteEntry(log.indexOf(entry))} aria-label="Löschen">✕</button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    <!-- SYNC TAB -->
    {:else}
      <div class="chart-box">
        {#if !isLoggedIn}
          <p class="chart-title">{isRegistering ? 'Account erstellen' : 'Anmelden'}</p>
          <div class="form">
            <label class="field">
              <span class="field-label">Benutzername</span>
              <input type="text" placeholder="z.B. michel" bind:value={syncUsername} maxlength="20" autocomplete="username" />
            </label>
            <label class="field">
              <span class="field-label">PIN (4 Ziffern)</span>
              <input type="password" placeholder="••••" bind:value={syncPin} maxlength="4" inputmode="numeric" autocomplete="current-password"
                on:keydown={(e) => e.key === 'Enter' && (isRegistering ? register() : login())} />
            </label>
            {#if syncStatus === 'error'}<p class="sync-msg error">{syncMessage}</p>{/if}
            {#if syncStatus === 'success'}<p class="sync-msg success">{syncMessage}</p>{/if}
            <button class="submit-btn" on:click={isRegistering ? register : login}
              disabled={syncStatus === 'loading' || !syncUsername || syncPin.length !== 4}>
              {syncStatus === 'loading' ? 'Lädt…' : isRegistering ? 'Account erstellen' : 'Anmelden'}
            </button>
            <button class="toggle-btn" on:click={() => { isRegistering = !isRegistering; syncStatus = 'idle'; }}>
              {isRegistering ? 'Bereits ein Konto? Anmelden' : 'Noch kein Konto? Registrieren'}
            </button>
          </div>
        {:else}
          <p class="chart-title">Sync aktiv</p>
          <div class="sync-user">
            <span class="sync-avatar">👤</span>
            <div><p class="sync-name">{syncUsername}</p><p class="sync-sub">Angemeldet</p></div>
            <button class="delete-btn" on:click={logout} style="margin-left:auto">Abmelden</button>
          </div>
          <div class="sync-actions">
            <button class="sync-btn upload" on:click={pushToServer} disabled={syncStatus === 'loading'}>
              <span>⬆️</span>
              <div><p>Hochladen</p><p class="sync-btn-sub">Lokale Daten → Server</p></div>
            </button>
            <button class="sync-btn download" on:click={pullFromServer} disabled={syncStatus === 'loading'}>
              <span>⬇️</span>
              <div><p>Herunterladen</p><p class="sync-btn-sub">Server → Dieses Gerät</p></div>
            </button>
          </div>
          {#if syncStatus === 'loading'}<p class="sync-msg">Lädt…</p>{/if}
          {#if syncStatus === 'error'}<p class="sync-msg error">{syncMessage}</p>{/if}
          {#if syncStatus === 'success'}<p class="sync-msg success">{syncMessage}</p>{/if}
          <p class="form-hint">💡 Lade zuerst hoch, dann auf dem anderen Gerät herunter.</p>
        {/if}
      </div>
    {/if}
  </div>
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) { background: #fdf8f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

  main { min-height: 100vh; display: grid; place-items: center; padding: 40px 24px; position: relative; }

  nav { position: fixed; top: 20px; left: 24px; z-index: 10; }
  .nav-btn { background: white; border: none; border-radius: 14px; width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer; box-shadow: 0 2px 12px rgba(0,0,0,0.08); color: #555; transition: transform 0.15s, box-shadow 0.15s, color 0.15s; }
  .nav-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12); color: #e8734a; }
  .nav-btn svg { width: 20px; height: 20px; }

  .hero { display: flex; flex-direction: column; align-items: center; gap: 24px; max-width: 480px; width: 100%; text-align: center; }
  .logo { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .logo-icon { font-size: 3rem; }
  h1 { font-size: 2.8rem; font-weight: 800; color: #1a1a1a; letter-spacing: -1px; }

  .cards { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; width: 100%; }
  .card { background: white; border-radius: 20px; padding: 18px 14px; display: flex; flex-direction: column; align-items: center; gap: 5px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); flex: 1; min-width: 100px; }
  .card-icon { font-size: 1.6rem; }
  .card-value { font-size: 1.4rem; font-weight: 800; color: #1a1a1a; letter-spacing: -0.5px; }
  .card-label { font-size: 0.78rem; color: #999; font-weight: 500; }

  .trend-row { display: flex; gap: 12px; width: 100%; }
  .trend-card { background: white; border-radius: 20px; padding: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); flex: 1; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .trend-label { font-size: 0.75rem; color: #bbb; font-weight: 600; }
  .trend-sub { font-size: 0.72rem; color: #ccc; }
  .trend-value { font-size: 1.2rem; font-weight: 800; color: #bbb; }
  .trend-value.up { color: #7dc47a; }
  .trend-value.down { color: #e87a7a; }
  .trend-value.neutral { font-size: 0.8rem; color: #ccc; }

  .tabs { display: flex; gap: 8px; background: white; border-radius: 16px; padding: 6px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); width: 100%; }
  .tab { flex: 1; border: none; background: transparent; border-radius: 12px; padding: 10px; font-size: 0.9rem; font-weight: 600; color: #bbb; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .tab.active { background: #e8734a; color: white; }

  .chart-box { background: white; border-radius: 20px; padding: 22px 18px 18px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); width: 100%; display: flex; flex-direction: column; gap: 16px; }
  .chart-header { display: flex; justify-content: space-between; align-items: center; }
  .chart-title { font-size: 0.82rem; font-weight: 700; color: #bbb; text-transform: uppercase; letter-spacing: 0.7px; }

  .view-toggle { display: flex; background: #f5f0eb; border-radius: 10px; padding: 3px; gap: 3px; }
  .view-toggle button { border: none; background: transparent; border-radius: 8px; padding: 5px 12px; font-size: 0.78rem; font-weight: 600; color: #bbb; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .view-toggle button.active { background: white; color: #1a1a1a; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

  .bar-chart { display: flex; gap: 8px; align-items: flex-end; height: 130px; padding: 0 4px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
  .bar-count { font-size: 0.65rem; font-weight: 700; color: #bbb; height: 14px; line-height: 14px; }
  .bar-track { flex: 1; width: 100%; background: #f5f0eb; border-radius: 8px; display: flex; align-items: flex-end; overflow: hidden; }
  .bar-wrap { width: 100%; display: flex; flex-direction: column-reverse; transition: height 0.6s cubic-bezier(0.34,1.56,0.64,1); }
  .bar-rsvp   { width: 100%; background: #e8734a; }
  .bar-manual { width: 100%; background: #5ba3c9; }
  .bar-label  { font-size: 0.72rem; color: #bbb; font-weight: 600; }

  .legend { display: flex; gap: 16px; justify-content: center; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: #999; font-weight: 500; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  .trend-details { display: flex; flex-direction: column; gap: 8px; }
  .trend-detail-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #fdf8f4; border-radius: 12px; }
  .breakdown-key { font-size: 0.82rem; color: #999; }
  .breakdown-val { font-size: 0.88rem; font-weight: 700; color: #1a1a1a; }
  .breakdown-val.positive { color: #7dc47a; }
  .breakdown-val.negative { color: #e87a7a; }

  .history-list { display: flex; flex-direction: column; gap: 8px; }
  .history-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #fdf8f4; border-radius: 14px; }
  .history-left { display: flex; flex-direction: column; gap: 2px; flex: 1; text-align: left; }
  .history-date { font-size: 0.88rem; font-weight: 700; color: #1a1a1a; }
  .history-note { font-size: 0.75rem; color: #aaa; }
  .history-pills { display: flex; gap: 6px; flex: 1; flex-wrap: wrap; }
  .history-total { font-size: 0.95rem; font-weight: 800; color: #1a1a1a; white-space: nowrap; }

  .pill { padding: 4px 10px; border-radius: 50px; font-size: 0.75rem; font-weight: 700; white-space: nowrap; }
  .pill.rsvp   { background: rgba(232,115,74,0.12); color: #e8734a; }
  .pill.manual { background: rgba(91,163,201,0.12); color: #5ba3c9; }

  .delete-btn { background: none; border: none; color: #ddd; font-size: 0.75rem; cursor: pointer; padding: 4px 6px; border-radius: 8px; transition: color 0.15s, background 0.15s; }
  .delete-btn:hover { color: #e8734a; background: rgba(232,115,74,0.08); }

  .form { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; text-align: left; }
  .field-label { font-size: 0.82rem; font-weight: 700; color: #bbb; text-transform: uppercase; letter-spacing: 0.5px; }
  .field input { border: 2px solid #f0ebe5; border-radius: 14px; padding: 12px 16px; font-size: 0.95rem; font-weight: 600; color: #1a1a1a; background: #fdf8f4; outline: none; transition: border-color 0.15s; width: 100%; }
  .field input:focus { border-color: #e8734a; }

  .submit-btn { background: #e8734a; color: white; border: none; padding: 14px; border-radius: 14px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; box-shadow: 0 4px 16px rgba(232,115,74,0.3); }
  .submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(232,115,74,0.4); }
  .submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .toggle-btn { background: none; border: none; color: #aaa; font-size: 0.88rem; cursor: pointer; padding: 4px; text-decoration: underline; }
  .toggle-btn:hover { color: #e8734a; }

  .form-hint { font-size: 0.8rem; color: #bbb; line-height: 1.5; text-align: left; border-top: 1px solid #f5f0eb; padding-top: 14px; }
  .empty-hint { font-size: 0.88rem; color: #bbb; line-height: 1.6; text-align: center; padding: 20px 0; }

  .sync-user { display: flex; align-items: center; gap: 12px; padding: 12px; background: #fdf8f4; border-radius: 14px; }
  .sync-avatar { font-size: 2rem; }
  .sync-name { font-size: 1rem; font-weight: 700; color: #1a1a1a; }
  .sync-sub { font-size: 0.78rem; color: #aaa; }

  .sync-actions { display: flex; flex-direction: column; gap: 10px; }
  .sync-btn { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 16px; border: none; cursor: pointer; text-align: left; font-family: inherit; transition: transform 0.15s, box-shadow 0.15s; width: 100%; }
  .sync-btn p { font-size: 0.95rem; font-weight: 700; color: #1a1a1a; }
  .sync-btn-sub { font-size: 0.78rem; color: #aaa; font-weight: 500; }
  .sync-btn span { font-size: 1.8rem; }
  .sync-btn.upload   { background: rgba(232,115,74,0.08); }
  .sync-btn.download { background: rgba(91,163,201,0.08); }
  .sync-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
  .sync-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .sync-msg { font-size: 0.88rem; font-weight: 600; text-align: center; padding: 8px; border-radius: 10px; }
  .sync-msg.error   { color: #e87a7a; background: rgba(232,122,122,0.1); }
  .sync-msg.success { color: #7dc47a; background: rgba(125,196,122,0.1); }
</style>
