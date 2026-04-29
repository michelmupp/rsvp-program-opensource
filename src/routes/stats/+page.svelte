<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  type DayEntry = { date: string; sessions: number; workMin: number; breakMin: number };
  type SessionEntry = { date: string; startHour: number; durationMin: number; type: 'work' | 'break' };

  let stats = { sessions: 0, totalWork: 0, totalBreak: 0 };
  let history: DayEntry[] = [];
  let sessions: SessionEntry[] = [];

  // Tab state
  let activeTab: 'week' | 'day' = 'week';

  // Reference: average uni student active study ~3-4h/day, focus:break ratio ~4:1
  const REF_DAILY_WORK_MIN = 210; // 3.5h
  const IDEAL_RATIO = 4.0;        // 4 min focus per 1 min break

  onMount(() => {
    try {
      stats = JSON.parse(localStorage.getItem('pomodoro-stats') || '{"sessions":0,"totalWork":0,"totalBreak":0}');
      history = JSON.parse(localStorage.getItem('pomodoro-history') || '[]');
      sessions = JSON.parse(localStorage.getItem('pomodoro-sessions') || '[]');
    } catch {}
  });

  function formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function resetStats() {
    if (!confirm('Statistiken wirklich zurücksetzen?')) return;
    stats = { sessions: 0, totalWork: 0, totalBreak: 0 };
    history = [];
    sessions = [];
    localStorage.removeItem('pomodoro-stats');
    localStorage.removeItem('pomodoro-history');
    localStorage.removeItem('pomodoro-sessions');
  }

  // ── WEEK TAB ──────────────────────────────────────────────
  $: chartData = (() => {
    const days: { label: string; sessions: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = history.find(h => h.date === key);
      const labels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
      days.push({ label: labels[d.getDay() === 0 ? 6 : d.getDay() - 1], sessions: entry?.sessions ?? 0 });
    }
    return days;
  })();
  $: maxSessions = Math.max(...chartData.map(d => d.sessions), 1);

  // ── DAY TAB ───────────────────────────────────────────────
  const todayKey = new Date().toISOString().slice(0, 10);
  $: todayEntry = history.find(e => e.date === todayKey) ?? { date: todayKey, sessions: 0, workMin: 0, breakMin: 0 };
  $: todaySessions = sessions.filter(s => s.date === todayKey);

  // Focus vs Break donut
  $: totalToday = todayEntry.workMin + todayEntry.breakMin;
  $: workPct = totalToday > 0 ? todayEntry.workMin / totalToday : 0;
  $: breakPct = totalToday > 0 ? todayEntry.breakMin / totalToday : 0;

  // SVG donut helpers
  function donutPath(startPct: number, endPct: number, r: number, cx: number, cy: number) {
    const toRad = (p: number) => (p * 2 * Math.PI) - Math.PI / 2;
    const x1 = cx + r * Math.cos(toRad(startPct));
    const y1 = cy + r * Math.sin(toRad(startPct));
    const x2 = cx + r * Math.cos(toRad(endPct));
    const y2 = cy + r * Math.sin(toRad(endPct));
    const large = (endPct - startPct) > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  // 24h clock sessions – map startHour + duration to SVG arc
  const CX = 100, CY = 100, CLOCK_R = 80;
  function sessionArc(startHour: number, durationMin: number) {
    const startFrac = startHour / 24;
    const endFrac = (startHour + durationMin / 60) / 24;
    return donutPath(startFrac, Math.min(endFrac, 1), CLOCK_R - 10, CX, CY);
  }

  // Hour tick positions
  const hourTicks = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 2 * Math.PI - Math.PI / 2;
    const r1 = CLOCK_R;
    const r2 = CLOCK_R - (i % 6 === 0 ? 14 : 7);
    return {
      x1: CX + r1 * Math.cos(angle), y1: CY + r1 * Math.sin(angle),
      x2: CX + r2 * Math.cos(angle), y2: CY + r2 * Math.sin(angle),
      major: i % 6 === 0,
      label: i % 6 === 0 ? String(i) : '',
      lx: CX + (r2 - 10) * Math.cos(angle),
      ly: CY + (r2 - 10) * Math.sin(angle),
    };
  });

  // Productivity score 0–100
  $: productivityScore = (() => {
    if (totalToday === 0) return 0;
    // Component 1: volume vs reference (max 60 pts)
    const volumeScore = Math.min(60, (todayEntry.workMin / REF_DAILY_WORK_MIN) * 60);
    // Component 2: focus:break ratio vs ideal (max 40 pts)
    const actualRatio = todayEntry.breakMin > 0 ? todayEntry.workMin / todayEntry.breakMin : todayEntry.workMin > 0 ? IDEAL_RATIO : 0;
    const ratioDiff = Math.abs(actualRatio - IDEAL_RATIO) / IDEAL_RATIO;
    const ratioScore = Math.max(0, 40 * (1 - ratioDiff));
    return Math.round(volumeScore + ratioScore);
  })();

  $: scoreLabel = productivityScore >= 80 ? 'Ausgezeichnet 🔥'
    : productivityScore >= 60 ? 'Gut gemacht 👍'
    : productivityScore >= 40 ? 'Auf dem richtigen Weg 📈'
    : productivityScore >= 20 ? 'Fang klein an 🌱'
    : 'Noch keine Daten';

  $: scoreColor = productivityScore >= 80 ? '#e8734a'
    : productivityScore >= 60 ? '#5ba3c9'
    : productivityScore >= 40 ? '#7dc47a'
    : '#bbb';

  // Score arc SVG
  const SR = 54, SCX = 70, SCY = 70;
  $: scoreArcPath = (() => {
    const pct = productivityScore / 100;
    if (pct <= 0) return '';
    if (pct >= 1) {
      return `M ${SCX} ${SCY - SR} A ${SR} ${SR} 0 1 1 ${SCX - 0.001} ${SCY - SR}`;
    }
    const endAngle = pct * 2 * Math.PI - Math.PI / 2;
    const ex = SCX + SR * Math.cos(endAngle);
    const ey = SCY + SR * Math.sin(endAngle);
    return `M ${SCX} ${SCY - SR} A ${SR} ${SR} 0 ${pct > 0.5 ? 1 : 0} 1 ${ex} ${ey}`;
  })();
</script>

<main>
  <nav>
    <button class="nav-btn" on:click={() => goto('/pomodoro')} aria-label="Back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  </nav>

  <div class="hero">
    <div class="logo">
      <span class="logo-icon">📊</span>
      <h1>Statistiken</h1>
    </div>

    <!-- Summary cards -->
    <div class="cards">
      <div class="card">
        <span class="card-icon">🍅</span>
        <span class="card-value">{stats.sessions}</span>
        <span class="card-label">Sessions</span>
      </div>
      <div class="card">
        <span class="card-icon">⏱️</span>
        <span class="card-value">{formatTime(stats.totalWork)}</span>
        <span class="card-label">Fokuszeit</span>
      </div>
      <div class="card">
        <span class="card-icon">☕</span>
        <span class="card-value">{formatTime(stats.totalBreak)}</span>
        <span class="card-label">Pausenzeit</span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab" class:active={activeTab === 'week'} on:click={() => activeTab = 'week'}>Woche</button>
      <button class="tab" class:active={activeTab === 'day'}  on:click={() => activeTab = 'day'}>Heute</button>
    </div>

    <!-- WEEK VIEW -->
    {#if activeTab === 'week'}
      <div class="chart-box">
        <p class="chart-title">Sessions diese Woche</p>
        <div class="bar-chart">
          {#each chartData as day}
            <div class="bar-col">
              <div class="bar-track">
                <div class="bar-fill" style="height: {(day.sessions / maxSessions) * 100}%"></div>
              </div>
              <span class="bar-label">{day.label}</span>
            </div>
          {/each}
        </div>
        {#if stats.sessions === 0}
          <p class="empty-hint">Noch keine Sessions – starte deinen ersten Pomodoro! 🍅</p>
        {/if}
      </div>
    {/if}

    <!-- DAY VIEW -->
    {#if activeTab === 'day'}

      <!-- Focus vs Break donut -->
      <div class="chart-box">
        <p class="chart-title">Fokus vs. Pause – heute</p>
        {#if totalToday === 0}
          <p class="empty-hint">Noch keine Sessions heute.</p>
        {:else}
          <div class="donut-row">
            <svg viewBox="0 0 100 100" class="donut-svg">
              <circle cx="50" cy="50" r="38" fill="none" stroke="#f5f0eb" stroke-width="14"/>
              <!-- Break arc first (full circle as background if needed) -->
              {#if breakPct > 0}
                <path d={donutPath(workPct, 1, 38, 50, 50)} fill="none" stroke="#5ba3c9" stroke-width="14" stroke-linecap="butt"/>
              {/if}
              <!-- Work arc -->
              {#if workPct > 0}
                <path d={donutPath(0, workPct, 38, 50, 50)} fill="none" stroke="#e8734a" stroke-width="14" stroke-linecap="butt"/>
              {/if}
              <text x="50" y="47" text-anchor="middle" dominant-baseline="central" class="donut-pct">{Math.round(workPct * 100)}%</text>
              <text x="50" y="60" text-anchor="middle" dominant-baseline="central" class="donut-sub">Fokus</text>
            </svg>
            <div class="donut-legend">
              <div class="legend-item">
                <span class="legend-dot" style="background:#e8734a"></span>
                <div>
                  <p class="legend-label">Fokuszeit</p>
                  <p class="legend-val">{formatTime(todayEntry.workMin)}</p>
                </div>
              </div>
              <div class="legend-item">
                <span class="legend-dot" style="background:#5ba3c9"></span>
                <div>
                  <p class="legend-label">Pausenzeit</p>
                  <p class="legend-val">{formatTime(todayEntry.breakMin)}</p>
                </div>
              </div>
              <div class="legend-item">
                <span class="legend-dot" style="background:#1a1a1a"></span>
                <div>
                  <p class="legend-label">Sessions</p>
                  <p class="legend-val">{todayEntry.sessions}</p>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- 24h Clock -->
      <div class="chart-box">
        <p class="chart-title">Sessions auf 24h-Uhr</p>
        {#if todaySessions.length === 0}
          <p class="empty-hint">Noch keine Session-Zeitdaten vorhanden.<br><span style="font-size:0.8rem">Tipp: Speichere Startzeiten in pomodoro-sessions im localStorage.</span></p>
        {:else}
          <div class="clock-24-wrap">
            <svg viewBox="0 0 200 200" class="clock-24-svg">
              <!-- Background ring -->
              <circle cx={CX} cy={CY} r={CLOCK_R} fill="none" stroke="#f5f0eb" stroke-width="18"/>
              <!-- Sessions -->
              {#each todaySessions as s}
                <path
                  d={sessionArc(s.startHour, s.durationMin)}
                  fill="none"
                  stroke={s.type === 'work' ? '#e8734a' : '#5ba3c9'}
                  stroke-width="16"
                  stroke-linecap="round"
                />
              {/each}
              <!-- Tick marks -->
              {#each hourTicks as t}
                <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  stroke={t.major ? '#ccc' : '#eee'} stroke-width={t.major ? 1.5 : 1}/>
                {#if t.label}
                  <text x={t.lx} y={t.ly} text-anchor="middle" dominant-baseline="central" class="clock-hour-label">{t.label}</text>
                {/if}
              {/each}
              <!-- Center -->
              <circle cx={CX} cy={CY} r="28" fill="white"/>
              <text x={CX} y={CY - 6} text-anchor="middle" dominant-baseline="central" class="clock-center-big">{todayEntry.sessions}</text>
              <text x={CX} y={CY + 10} text-anchor="middle" dominant-baseline="central" class="clock-center-sub">Sessions</text>
            </svg>
            <div class="clock-legend">
              <div class="legend-item"><span class="legend-dot" style="background:#e8734a"></span><p class="legend-label">Fokus</p></div>
              <div class="legend-item"><span class="legend-dot" style="background:#5ba3c9"></span><p class="legend-label">Pause</p></div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Productivity Score -->
      <div class="chart-box score-box">
        <p class="chart-title">Produktivitäts-Score</p>
        <div class="score-row">
          <svg viewBox="0 0 140 140" class="score-svg">
            <!-- Background arc -->
            <circle cx={SCX} cy={SCY} r={SR} fill="none" stroke="#f5f0eb" stroke-width="12"/>
            <!-- Score arc -->
            {#if productivityScore > 0}
              <path d={scoreArcPath} fill="none" stroke={scoreColor} stroke-width="12" stroke-linecap="round"/>
            {/if}
            <text x={SCX} y={SCY - 6} text-anchor="middle" dominant-baseline="central" class="score-number" style="fill:{scoreColor}">{productivityScore}</text>
            <text x={SCX} y={SCY + 14} text-anchor="middle" dominant-baseline="central" class="score-sub">/ 100</text>
          </svg>
          <div class="score-info">
            <p class="score-label">{scoreLabel}</p>
            <div class="score-breakdown">
              <div class="breakdown-row">
                <span class="breakdown-key">Dein Volumen</span>
                <span class="breakdown-val">{formatTime(todayEntry.workMin)}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-key">Referenz (Uni)</span>
                <span class="breakdown-val">{formatTime(REF_DAILY_WORK_MIN)}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-key">Fokus:Pause</span>
                <span class="breakdown-val">
                  {todayEntry.breakMin > 0 ? (todayEntry.workMin / todayEntry.breakMin).toFixed(1) : '—'}:1
                </span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-key">Ideal</span>
                <span class="breakdown-val">4:1</span>
              </div>
            </div>
          </div>
        </div>
        <div class="score-note">
          Basierend auf Studien zur studentischen Lernzeit: ⌀ 3,5h aktive Fokuszeit/Tag, optimales Fokus:Pause-Verhältnis 4:1.
        </div>
      </div>
    {/if}

    <button class="reset-btn" on:click={resetStats}>Zurücksetzen</button>
  </div>
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    background: #fdf8f4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 40px 24px;
    position: relative;
  }

  nav { position: fixed; top: 20px; left: 24px; z-index: 10; }
  .nav-btn {
    background: white; border: none; border-radius: 14px;
    width: 44px; height: 44px; display: grid; place-items: center;
    cursor: pointer; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    color: #555; transition: transform 0.15s, box-shadow 0.15s, color 0.15s;
  }
  .nav-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12); color: #e8734a; }
  .nav-btn svg { width: 20px; height: 20px; }

  .hero {
    display: flex; flex-direction: column; align-items: center;
    gap: 24px; max-width: 480px; width: 100%; text-align: center;
  }

  .logo { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .logo-icon { font-size: 3rem; }
  h1 { font-size: 2.8rem; font-weight: 800; color: #1a1a1a; letter-spacing: -1px; }

  /* Cards */
  .cards { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; width: 100%; }
  .card {
    background: white; border-radius: 20px; padding: 18px 14px;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06); flex: 1; min-width: 100px;
  }
  .card-icon { font-size: 1.6rem; }
  .card-value { font-size: 1.4rem; font-weight: 800; color: #1a1a1a; letter-spacing: -0.5px; }
  .card-label { font-size: 0.78rem; color: #999; font-weight: 500; }

  /* Tabs */
  .tabs {
    display: flex; gap: 8px; background: white; border-radius: 16px;
    padding: 6px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); width: 100%;
  }
  .tab {
    flex: 1; border: none; background: transparent; border-radius: 12px;
    padding: 10px; font-size: 0.95rem; font-weight: 600; color: #bbb;
    cursor: pointer; transition: background 0.15s, color 0.15s;
  }
  .tab.active { background: #e8734a; color: white; }

  /* Chart box */
  .chart-box {
    background: white; border-radius: 20px; padding: 22px 18px 18px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06); width: 100%;
  }
  .chart-title {
    font-size: 0.82rem; font-weight: 700; color: #bbb;
    text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 18px; text-align: left;
  }

  /* Week bar chart */
  .bar-chart { display: flex; gap: 10px; align-items: flex-end; height: 110px; padding: 0 4px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; }
  .bar-track { flex: 1; width: 100%; background: #f5f0eb; border-radius: 8px; display: flex; align-items: flex-end; overflow: hidden; }
  .bar-fill { width: 100%; background: #e8734a; border-radius: 8px 8px 0 0; transition: height 0.6s cubic-bezier(0.34,1.56,0.64,1); min-height: 0; }
  .bar-label { font-size: 0.75rem; color: #bbb; font-weight: 600; }

  /* Donut */
  .donut-row { display: flex; align-items: center; gap: 20px; }
  .donut-svg { width: 110px; height: 110px; flex-shrink: 0; }
  .donut-pct { font-family: -apple-system, sans-serif; font-size: 18px; font-weight: 800; fill: #1a1a1a; }
  .donut-sub { font-family: -apple-system, sans-serif; font-size: 9px; fill: #bbb; font-weight: 500; }

  .donut-legend { display: flex; flex-direction: column; gap: 12px; flex: 1; }
  .legend-item { display: flex; align-items: center; gap: 10px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .legend-label { font-size: 0.78rem; color: #999; }
  .legend-val { font-size: 1rem; font-weight: 700; color: #1a1a1a; }

  /* 24h clock */
  .clock-24-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .clock-24-svg { width: 200px; height: 200px; }
  .clock-hour-label { font-family: -apple-system, sans-serif; font-size: 9px; fill: #bbb; font-weight: 600; }
  .clock-center-big { font-family: -apple-system, sans-serif; font-size: 18px; font-weight: 800; fill: #1a1a1a; }
  .clock-center-sub { font-family: -apple-system, sans-serif; font-size: 8px; fill: #bbb; }
  .clock-legend { display: flex; gap: 20px; }

  /* Score */
  .score-box { display: flex; flex-direction: column; gap: 16px; }
  .score-row { display: flex; align-items: center; gap: 16px; }
  .score-svg { width: 140px; height: 140px; flex-shrink: 0; }
  .score-number { font-family: -apple-system, sans-serif; font-size: 28px; font-weight: 800; }
  .score-sub { font-family: -apple-system, sans-serif; font-size: 11px; fill: #bbb; }
  .score-info { flex: 1; display: flex; flex-direction: column; gap: 10px; text-align: left; }
  .score-label { font-size: 1rem; font-weight: 700; color: #1a1a1a; }
  .score-breakdown { display: flex; flex-direction: column; gap: 6px; }
  .breakdown-row { display: flex; justify-content: space-between; align-items: center; }
  .breakdown-key { font-size: 0.78rem; color: #999; }
  .breakdown-val { font-size: 0.82rem; font-weight: 700; color: #1a1a1a; }
  .score-note {
    font-size: 0.75rem; color: #bbb; line-height: 1.5;
    border-top: 1px solid #f5f0eb; padding-top: 12px; text-align: left;
  }

  .empty-hint { font-size: 0.88rem; color: #bbb; line-height: 1.6; }

  /* Reset */
  .reset-btn {
    background: transparent; border: 2px solid #eee; color: #bbb;
    padding: 12px 32px; border-radius: 50px; font-size: 0.9rem; font-weight: 600;
    cursor: pointer; transition: border-color 0.15s, color 0.15s;
  }
  .reset-btn:hover { border-color: #e8734a; color: #e8734a; }
</style>
