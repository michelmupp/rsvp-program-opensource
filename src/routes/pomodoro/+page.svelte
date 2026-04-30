<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';

  const SERVER_URL = 'https://rsvp-program-opensource-production.up.railway.app';

  // Clock state
  let workMinutes = 25;
  let breakMinutes = 5;

  onMount(() => {
    try {
      const s = JSON.parse(localStorage.getItem('pomodoro-settings') || '{}');
      if (s.workMinutes) {
        workMinutes = s.workMinutes;
        minuteRotations = Math.floor(s.workMinutes / 60);
      }
      if (s.breakMinutes) {
        breakMinutes = s.breakMinutes;
        hourRotations = Math.floor(s.breakMinutes / 12);
      }
    } catch {}

    try {
      const savedEndTime = localStorage.getItem('pomodoro-endtime');
      const savedPhase = localStorage.getItem('pomodoro-phase') as 'work' | 'break' | null;
      if (savedEndTime && savedPhase) {
        const remaining = Math.floor((Number(savedEndTime) - Date.now()) / 1000);
        if (remaining > 0) {
          phase = savedPhase;
          secondsLeft = remaining;
          // Interval neu starten – zieht sich jetzt die korrekte secondsLeft
          interval = setInterval(tick, 1000);
        } else {
          // Timer abgelaufen während App zu war
          sendNotification(
            savedPhase === 'work' ? '🍅 Fokuszeit vorbei!' : '☕ Pause vorbei!',
            savedPhase === 'work' ? 'Zeit für eine Pause!' : 'Bereit für die nächste Session?'
          );
          localStorage.removeItem('pomodoro-endtime');
          localStorage.removeItem('pomodoro-phase');
          phase = 'idle';
          secondsLeft = 0;
        }
      }
    } catch {}
  });

  let isDraggingMinute = false;
  let isDraggingHour = false;

  // Timer state
  type Phase = 'idle' | 'work' | 'break' | 'paused';
  let phase: Phase = 'idle';
  let pausedPhase: 'work' | 'break' = 'work';
  let secondsLeft = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  // Stats (stored in localStorage)
  let stats = loadStats();

  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem('pomodoro-stats') || '{"sessions":0,"totalWork":0,"totalBreak":0}');
    } catch { return { sessions: 0, totalWork: 0, totalBreak: 0 }; }
  }
  function saveStats() {
    localStorage.setItem('pomodoro-stats', JSON.stringify(stats));
  }

  async function requestNotificationPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  // Service Worker registrieren
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // VAPID Public Key vom Server holen
  const res = await fetch(`${SERVER_URL}/vapid-public-key`);
  const { key } = await res.json();

  // Subscription erstellen
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });

  // Subscription an Server schicken
  await fetch(`${SERVER_URL}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
}

function sendNotification(title: string, body: string) {
  // Lokal als Fallback wenn App offen ist
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.png' });
  }
}

  // SVG clock geometry
  const CX = 150, CY = 150, R = 130;

  function angleToCoords(angleDeg: number, r: number) {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  // Minute hand: 1–59 min → 6°–354° (6° per minute)
  $: minuteAngle = workMinutes * 6;
  $: minuteHandEnd = angleToCoords(minuteAngle, R * 0.72);

  // Hour hand: 1–11 break min → mapped to 30°–330° (30° per step)
  $: hourAngle = breakMinutes * 30;
  $: hourHandEnd = angleToCoords(hourAngle, R * 0.5);

  // Tick marks
  const minuteTicks = Array.from({ length: 60 }, (_, i) => i);
  const hourTicks = Array.from({ length: 12 }, (_, i) => i);

  // Track rotations for unlimited turns
  let minuteRotations = 0;
  let hourRotations = 0;
  let lastMinuteAngle = -1;
  let lastHourAngle = -1;

  function getAngleFromEvent(e: MouseEvent | TouchEvent, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const svgX = ((clientX - rect.left) / rect.width) * 300;
    const svgY = ((clientY - rect.top) / rect.height) * 300;
    const dx = svgX - CX;
    const dy = svgY - CY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return angle;
  }

  let svgEl: SVGSVGElement;

  function onMouseMove(e: MouseEvent) {
    if (!isDraggingMinute && !isDraggingHour) return;
    e.preventDefault();
    const angle = getAngleFromEvent(e, svgEl);

    if (isDraggingMinute) {
      if (lastMinuteAngle >= 0) {
        // Detect wrap-around
        if (lastMinuteAngle > 300 && angle < 60) minuteRotations++;
        if (lastMinuteAngle < 60 && angle > 300) minuteRotations = Math.max(0, minuteRotations - 1);
      }
      lastMinuteAngle = angle;
      const totalMinutes = minuteRotations * 60 + Math.round(angle / 6);
      workMinutes = Math.max(1, totalMinutes === 0 ? 1 : totalMinutes);
    }

    if (isDraggingHour) {
      if (lastHourAngle >= 0) {
        if (lastHourAngle > 300 && angle < 60) hourRotations++;
        if (lastHourAngle < 60 && angle > 300) hourRotations = Math.max(0, hourRotations - 1);
      }
      lastHourAngle = angle;
      const totalHours = hourRotations * 12 + Math.round(angle / 30);
      breakMinutes = Math.max(1, totalHours === 0 ? 1 : totalHours);
    }
  }

  function onMouseUp() {
    isDraggingMinute = false;
    isDraggingHour = false;
    lastMinuteAngle = -1;
    lastHourAngle = -1;
  }

  function startTimer() {
    requestNotificationPermission();
    if (phase === 'paused') {
      phase = pausedPhase;
      // Neue Endzeit berechnen basierend auf verbleibender Zeit
      const endTime = Date.now() + secondsLeft * 1000;
      localStorage.setItem('pomodoro-endtime', String(endTime));
      localStorage.setItem('pomodoro-phase', phase);
      interval = setInterval(tick, 1000);
      return;
    }
    if (phase !== 'idle') {
      stopTimer();
      return;
    }
    phase = 'work';
    secondsLeft = workMinutes * 60;
    // Server informieren
    fetch(`${SERVER_URL}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endsAt: Date.now() + secondsLeft * 1000,
        phase: 'work',
      }),
    }).catch(() => {});
    const endTime = Date.now() + secondsLeft * 1000;
    localStorage.setItem('pomodoro-endtime', String(endTime));
    localStorage.setItem('pomodoro-phase', 'work');
    const now = new Date();
    const sessionStart = {
      date: now.toISOString().slice(0, 10),
      startHour: now.getHours() + now.getMinutes() / 60,
      durationMin: workMinutes,
      type: 'work' as const
    };
    const existingSessions = JSON.parse(localStorage.getItem('pomodoro-sessions') || '[]');
    existingSessions.push(sessionStart);
    localStorage.setItem('pomodoro-sessions', JSON.stringify(existingSessions));
    interval = setInterval(tick, 1000);
  }

  function pauseTimer() {
    if (phase !== 'work' && phase !== 'break') return;
    pausedPhase = phase;
    phase = 'paused';
    if (interval) clearInterval(interval);
    interval = null;
  }

  function stopTimer() {
    if (interval) clearInterval(interval);
    interval = null;
    phase = 'idle';
    secondsLeft = 0;
    minuteRotations = 0;
    hourRotations = 0;
    localStorage.removeItem('pomodoro-endtime');
    localStorage.removeItem('pomodoro-phase');
    // Server-Timer abbrechen
    fetch(`${SERVER_URL}/cancel`, {
      method: 'POST',
    }).catch(() => {});
  }

  function tick() {
    const savedEndTime = localStorage.getItem('pomodoro-endtime');
    if (savedEndTime) {
      secondsLeft = Math.max(0, Math.floor((Number(savedEndTime) - Date.now()) / 1000));
    } else {
      secondsLeft--;
    }

    if (secondsLeft <= 0) {
      if (phase === 'work') {
        stats.sessions++;
        stats.totalWork += workMinutes;
        saveStats();
        saveHistory(workMinutes, 0);
        sendNotification('🍅 Fokuszeit vorbei!', 'Zeit für eine Pause – gut gemacht!');
        const breakEndTime = Date.now() + breakMinutes * 1000;
        localStorage.setItem('pomodoro-endtime', String(breakEndTime));
        localStorage.setItem('pomodoro-phase', 'break');
        fetch(`${SERVER_URL}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endsAt: breakEndTime, phase: 'break' }),
        }).catch(() => {});
        phase = 'break';
        secondsLeft = breakMinutes * 60;
      } else {
        stats.totalBreak += breakMinutes;
        saveStats();
        saveHistory(0, breakMinutes);
        sendNotification('☕ Pause vorbei!', 'Bereit für die nächste Session?');
        stopTimer();
      }
    }
  }

  function saveHistory(workMin: number, breakMin: number) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const history: {date: string; sessions: number; workMin: number; breakMin: number}[] =
        JSON.parse(localStorage.getItem('pomodoro-history') || '[]');
      const existing = history.find(e => e.date === today);
      if (existing) {
        existing.sessions += workMin > 0 ? 1 : 0;
        existing.workMin += workMin;
        existing.breakMin += breakMin;
      } else {
        history.push({ date: today, sessions: workMin > 0 ? 1 : 0, workMin, breakMin });
      }
      localStorage.setItem('pomodoro-history', JSON.stringify(history));
    } catch {}
  }

  $: displayMinutes = phase === 'idle' ? workMinutes : Math.floor(secondsLeft / 60);
  $: displaySeconds = phase === 'idle' ? 0 : secondsLeft % 60;
  $: progress = phase === 'work'
    ? 1 - secondsLeft / (workMinutes * 60)
    : phase === 'break'
      ? 1 - secondsLeft / (breakMinutes * 60)
      : phase === 'paused'
        ? (pausedPhase === 'work'
            ? 1 - secondsLeft / (workMinutes * 60)
            : 1 - secondsLeft / (breakMinutes * 60))
        : 0;

  // Arc for progress ring
  $: progressAngle = progress * 360;
  $: progressArc = (() => {
    const r = R - 4;
    const start = angleToCoords(0, r);
    const end = angleToCoords(progressAngle, r);
    const large = progressAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
  })();

  onDestroy(() => { if (interval) clearInterval(interval); });
</script>

<svelte:window on:mousemove={onMouseMove} on:mouseup={onMouseUp} on:touchmove|passive={onMouseMove} on:touchend={onMouseUp} />

<main>
  <!-- Top bar -->
  <nav>
    <button class="nav-btn" on:click={() => goto('/')} aria-label="Home">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
    <button class="nav-btn" on:click={() => goto('/stats')} aria-label="Statistics">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="12" width="4" height="9" rx="1"/>
        <rect x="10" y="7" width="4" height="14" rx="1"/>
        <rect x="17" y="3" width="4" height="18" rx="1"/>
      </svg>
    </button>
    <button class="nav-btn" on:click={() => goto('/settings')} aria-label="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    </button>
  </nav>

  <div class="hero">
    <h1>Pomodoro Timer</h1>

    <!-- Clock -->
    <div class="clock-wrapper">
      <svg
        bind:this={svgEl}
        viewBox="0 0 300 300"
        class="clock"
        class:running={phase !== 'idle'}
      >
        <!-- Background circle -->
        <circle cx={CX} cy={CY} r={R} class="clock-face"/>

        <!-- Progress arc -->
        {#if phase !== 'idle'}
          <path d={progressArc} class="progress-arc" class:break-arc={phase === 'break' || (phase === 'paused' && pausedPhase === 'break')}
            stroke-width="8" fill="none" stroke-linecap="round"/>
        {/if}

        <!-- Minute tick marks -->
        {#each minuteTicks as i}
          {@const angle = i * 6}
          {@const isMajor = i % 5 === 0}
          {@const outer = angleToCoords(angle, R - 6)}
          {@const inner = angleToCoords(angle, R - (isMajor ? 20 : 12))}
          <line
            x1={outer.x} y1={outer.y}
            x2={inner.x} y2={inner.y}
            class={isMajor ? 'tick-major' : 'tick-minor'}
          />
        {/each}

        <!-- Hour numbers -->
        {#each [12,1,2,3,4,5,6,7,8,9,10,11] as n, i}
          {@const pos = angleToCoords(i * 30, R - 38)}
          <text x={pos.x} y={pos.y} class="hour-num" dominant-baseline="central" text-anchor="middle">{n}</text>
        {/each}

        <!-- Center time display -->
        <text x={CX} y={CY - 14} class="time-big" dominant-baseline="central" text-anchor="middle">
          {String(displayMinutes).padStart(2,'0')}:{String(displaySeconds).padStart(2,'0')}
        </text>
        <text x={CX} y={CY + 22} class="phase-label" dominant-baseline="central" text-anchor="middle">
          {phase === 'work' ? '🍅 Focus' : phase === 'break' ? '☕ Break' : phase === 'paused' ? '⏸ Pausiert' : `${workMinutes}m work · ${breakMinutes}m break`}
        </text>

        <!-- Hour hand (break duration) -->
        <line
          x1={CX} y1={CY}
          x2={hourHandEnd.x} y2={hourHandEnd.y}
          class="hand hour-hand"
          on:mousedown|preventDefault={() => { if (phase === 'idle') isDraggingHour = true; }}
          on:touchstart|preventDefault={() => { if (phase === 'idle') isDraggingHour = true; }}
        />
        <circle
          cx={hourHandEnd.x} cy={hourHandEnd.y} r="10"
          class="hand-knob hour-knob"
          on:mousedown|preventDefault={() => { if (phase === 'idle') isDraggingHour = true; }}
          on:touchstart|preventDefault={() => { if (phase === 'idle') isDraggingHour = true; }}
        />

        <!-- Minute hand (work duration) -->
        <line
          x1={CX} y1={CY}
          x2={minuteHandEnd.x} y2={minuteHandEnd.y}
          class="hand minute-hand"
          on:mousedown|preventDefault={() => { if (phase === 'idle') isDraggingMinute = true; }}
          on:touchstart|preventDefault={() => { if (phase === 'idle') isDraggingMinute = true; }}
        />
        <circle
          cx={minuteHandEnd.x} cy={minuteHandEnd.y} r="10"
          class="hand-knob minute-knob"
          on:mousedown|preventDefault={() => { if (phase === 'idle') isDraggingMinute = true; }}
          on:touchstart|preventDefault={() => { if (phase === 'idle') isDraggingMinute = true; }}
        />

        <!-- Center dot -->
        <circle cx={CX} cy={CY} r="6" class="center-dot"/>
      </svg>

      <!-- Labels -->
      <div class="clock-labels">
        <span class="label-minute">🔴 Minutenzeiger = Lernzeit</span>
        <span class="label-hour">⚫ Stundenzeiger = Pause</span>
      </div>
    </div>

    <div class="btn-row">
      <button class="cta" on:click={startTimer}
        class:stop={phase !== 'idle' && phase !== 'paused'}
        class:resume={phase === 'paused'}>
        {phase === 'idle' ? 'Start' : phase === 'paused' ? 'Weiter' : 'Stop'}
      </button>
      {#if phase === 'work' || phase === 'break'}
        <button class="cta-pause" on:click={pauseTimer}>⏸</button>
      {/if}
    </div>
  </div>
</main>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  :global(body) {
    background: #fdf8f4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    position: relative;
  }

  nav {
    position: fixed;
    top: 20px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    padding: 0 24px;
    pointer-events: none;
    z-index: 10;
  }

  .nav-btn {
    pointer-events: all;
    background: white;
    border: none;
    border-radius: 14px;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    color: #555;
    transition: transform 0.15s, box-shadow 0.15s, color 0.15s;
  }
  .nav-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.12);
    color: #e8734a;
  }
  .nav-btn svg {
    width: 20px;
    height: 20px;
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    max-width: 500px;
    width: 100%;
    text-align: center;
  }

  h1 {
    font-size: 2.2rem;
    font-weight: 800;
    color: #1a1a1a;
    letter-spacing: -1px;
  }

  .clock-wrapper {
    width: min(66vw, 340px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .clock {
    width: 100%;
    filter: drop-shadow(0 8px 32px rgba(0,0,0,0.10));
    user-select: none;
  }

  /* SVG internals */
  .clock-face {
    fill: white;
    stroke: #f0ebe5;
    stroke-width: 2;
  }
  .tick-major {
    stroke: #bbb;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .tick-minor {
    stroke: #ddd;
    stroke-width: 1;
    stroke-linecap: round;
  }
  .hour-num {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    font-weight: 600;
    fill: #999;
  }
  .time-big {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 32px;
    font-weight: 800;
    fill: #1a1a1a;
    letter-spacing: -1px;
  }
  .phase-label {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    fill: #999;
  }
  .progress-arc {
    stroke: #e8734a;
  }
  .progress-arc.break-arc {
    stroke: #5ba3c9;
  }
  .hand {
    stroke-linecap: round;
    cursor: grab;
    transition: filter 0.15s;
  }
  .hand:active { cursor: grabbing; }
  .minute-hand {
    stroke: #e8734a;
    stroke-width: 4;
  }
  .hour-hand {
    stroke: #1a1a1a;
    stroke-width: 3.5;
  }
  .hand-knob {
    cursor: grab;
    transition: transform 0.15s, filter 0.15s;
    transform-box: fill-box;
    transform-origin: center;
  }
  .hand-knob:hover {
    filter: brightness(0.88);
  }
  .hand-knob:active { cursor: grabbing; }
  .minute-knob {
    fill: #e8734a;
    stroke: white;
    stroke-width: 2.5;
  }
  .hour-knob {
    fill: #1a1a1a;
    stroke: white;
    stroke-width: 2.5;
  }
  .center-dot {
    fill: #1a1a1a;
  }

  .clock-labels {
    display: flex;
    gap: 20px;
    font-size: 0.8rem;
    color: #999;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .cta {
    background: #e8734a;
    color: white;
    border: none;
    padding: 18px 64px;
    border-radius: 50px;
    font-size: 1.15rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s, background 0.2s;
    box-shadow: 0 4px 20px rgba(232, 115, 74, 0.35);
    letter-spacing: 0.3px;
  }
  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(232, 115, 74, 0.45);
  }
  .cta:active {
    transform: translateY(0);
  }
  .cta.stop {
    background: #1a1a1a;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18);
  }
  .cta.stop:hover {
    box-shadow: 0 8px 28px rgba(0,0,0,0.25);
  }
  .cta.resume {
    background: #e8734a;
    box-shadow: 0 4px 20px rgba(232, 115, 74, 0.35);
  }

  .cta-pause {
    background: white;
    color: #1a1a1a;
    border: 2px solid #eee;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    font-size: 1.3rem;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    flex-shrink: 0;
  }
  .cta-pause:hover {
    transform: translateY(-2px);
    border-color: #ccc;
    box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  }
</style>
