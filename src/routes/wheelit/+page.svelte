<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // ── Players ────────────────────────────────────────────────
  let players: string[] = ['Alex', 'Sam', 'Jordan', 'Taylor'];
  let editingIndex: number | null = null;
  let editingValue = '';

  function addPlayer() {
    players = [...players, `Spieler ${players.length + 1}`];
    editingIndex = players.length - 1;
    editingValue = players[editingIndex];
  }

  function removePlayer(i: number) {
    if (players.length <= 2) return;
    players = players.filter((_, idx) => idx !== i);
  }

  function startEdit(i: number) {
    editingIndex = i;
    editingValue = players[i];
  }

  function commitEdit() {
    if (editingIndex !== null) {
      const trimmed = editingValue.trim();
      if (trimmed) players[editingIndex] = trimmed;
      editingIndex = null;
    }
  }

  function onEditKey(e: KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') editingIndex = null;
  }

  // ── Wheel geometry ─────────────────────────────────────────
  const CX = 200, CY = 200, R = 185;

  // Warm palette cycling
  const PALETTE = [
    '#e8734a', '#5ba3c9', '#7dc47a', '#f0b84b',
    '#c97bb2', '#6ec6c0', '#e87a7a', '#a78bfa',
    '#fb923c', '#34d399', '#60a5fa', '#f472b6',
  ];

  function slicePath(startAngle: number, endAngle: number): string {
    const s = (startAngle - 90) * Math.PI / 180;
    const e = (endAngle - 90) * Math.PI / 180;
    const x1 = CX + R * Math.cos(s);
    const y1 = CY + R * Math.sin(s);
    const x2 = CX + R * Math.cos(e);
    const y2 = CY + R * Math.sin(e);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
  }

  function labelPos(startAngle: number, endAngle: number, r: number) {
    const mid = ((startAngle + endAngle) / 2 - 90) * Math.PI / 180;
    return { x: CX + r * Math.cos(mid), y: CY + r * Math.sin(mid) };
  }

  $: sliceAngle = 360 / players.length;
  $: slices = players.map((name, i) => ({
    name,
    color: PALETTE[i % PALETTE.length],
    start: i * sliceAngle,
    end: (i + 1) * sliceAngle,
    label: labelPos(i * sliceAngle, (i + 1) * sliceAngle, R * 0.62),
    angle: (i * sliceAngle + (i + 1) * sliceAngle) / 2,
  }));

  // ── Spin physics ───────────────────────────────────────────
  let rotation = 0;       // current visual rotation (degrees)
  let velocity = 0;       // degrees/frame
  let spinning = false;
  let rafId: number | null = null;

  // Drag tracking
  let isDragging = false;
  let lastAngle = 0;
  let lastTime = 0;
  let dragVelocity = 0;
  let prevAngle = 0;
  let svgEl: SVGSVGElement;

  // Result
  let winner: string | null = null;
  let showResult = false;
  let confettiParticles: Confetti[] = [];

  type Confetti = {
    x: number; y: number; vx: number; vy: number;
    size: number; color: string; rotation: number; rotSpeed: number;
    opacity: number; shape: 'rect' | 'circle';
  };

  function getAngleFromEvent(e: MouseEvent | TouchEvent): number {
    const rect = svgEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const svgX = ((clientX - rect.left) / rect.width) * 400;
    const svgY = ((clientY - rect.top) / rect.height) * 400;
    const dx = svgX - CX;
    const dy = svgY - CY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }

  function onPointerDown(e: MouseEvent | TouchEvent) {
    if (spinning) return;
    winner = null;
    showResult = false;
    isDragging = true;
    lastAngle = getAngleFromEvent(e);
    prevAngle = lastAngle;
    lastTime = performance.now();
    dragVelocity = 0;
    velocity = 0;
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    e.preventDefault();
    const now = performance.now();
    const current = getAngleFromEvent(e);
    const dt = now - lastTime;
    if (dt > 0) {
      let delta = current - prevAngle;
      // handle wrap
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      rotation += delta;
      dragVelocity = delta / dt * 16; // degrees per frame (at 60fps)
    }
    prevAngle = current;
    lastAngle = current;
    lastTime = now;
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    velocity = dragVelocity;
    // minimum spin if flicked hard enough
    if (Math.abs(velocity) > 1) {
      spinning = true;
      animate();
    }
  }

  const FRICTION = 0.972;
  const MIN_SPEED = 0.08;

  function animate() {
    velocity *= FRICTION;
    rotation += velocity;

    if (Math.abs(velocity) < MIN_SPEED) {
      spinning = false;
      velocity = 0;
      pickWinner();
      return;
    }
    rafId = requestAnimationFrame(animate);
  }

  function pickWinner() {
    // The pointer is at top (270° in SVG = -90°). 
    // Normalize rotation to find which slice is at top.
    const normalized = (((-rotation % 360) + 360) % 360);
    const winnerIndex = Math.floor(normalized / sliceAngle) % players.length;
    winner = players[winnerIndex];
    setTimeout(() => {
      showResult = true;
      spawnConfetti();
    }, 200);
  }

  // ── Confetti ───────────────────────────────────────────────
  let canvasEl: HTMLCanvasElement;
  let confettiRaf: number | null = null;

  function spawnConfetti() {
    const colors = ['#e8734a','#5ba3c9','#7dc47a','#f0b84b','#c97bb2','#a78bfa','#f472b6'];
    confettiParticles = Array.from({ length: 120 }, () => ({
      x: Math.random() * window.innerWidth,
      y: -20,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 2,
      size: Math.random() * 9 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      opacity: 1,
      shape: Math.random() > 0.4 ? 'rect' : 'circle',
    }));
    animateConfetti();
  }

  function animateConfetti() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d')!;
    canvasEl.width = window.innerWidth;
    canvasEl.height = window.innerHeight;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    let alive = false;
    for (const p of confettiParticles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.vx *= 0.99;
      p.rotation += p.rotSpeed;
      if (p.y < canvasEl.height + 40) {
        p.opacity = Math.max(0, 1 - (p.y / canvasEl.height) * 0.6);
        alive = true;
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (alive) {
      confettiRaf = requestAnimationFrame(animateConfetti);
    } else {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }
  }

  function closeResult() {
    showResult = false;
    winner = null;
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    if (canvasEl) {
      const ctx = canvasEl.getContext('2d');
      ctx?.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }
  }

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
  });

  // ── Truncate label ─────────────────────────────────────────
  function truncate(s: string, maxChars: number) {
    return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
  }

  $: labelMaxChars = players.length <= 4 ? 10 : players.length <= 6 ? 7 : 5;
  $: fontSize = players.length <= 4 ? 16 : players.length <= 7 ? 13 : 11;
</script>

<!-- Confetti canvas (fullscreen, pointer-events none) -->
<canvas bind:this={canvasEl} class="confetti-canvas"></canvas>

<!-- Result overlay -->
{#if showResult && winner}
  <div class="result-overlay" on:click={closeResult} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && closeResult()}>
    <div class="result-card" on:click|stopPropagation>
      <div class="result-emoji">🎉</div>
      <p class="result-label">Dran ist</p>
      <h2 class="result-name">{winner}</h2>
      <button class="result-close" on:click={closeResult}>Weiter drehen</button>
    </div>
  </div>
{/if}

<main>
  <!-- Back button -->
  <nav>
    <button class="nav-btn" on:click={() => goto('/')} aria-label="Zurück">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  </nav>

  <div class="hero">
    <div class="header">
      <span class="logo-icon">🎡</span>
      <h1>Wheelit</h1>
      <p class="tagline">Dreh das Rad – entscheide fair</p>
    </div>

    <!-- Wheel -->
    <div class="wheel-wrap">
      <!-- Pointer -->
      <div class="pointer">▼</div>

      <svg
        bind:this={svgEl}
        viewBox="0 0 400 400"
        class="wheel"
        class:spinning
        on:mousedown={onPointerDown}
        on:mousemove={onPointerMove}
        on:mouseup={onPointerUp}
        on:mouseleave={onPointerUp}
        on:touchstart|preventDefault={onPointerDown}
        on:touchmove|preventDefault={onPointerMove}
        on:touchend={onPointerUp}
        style="transform: rotate({rotation}deg)"
        role="img"
        aria-label="Glücksrad"
      >
        <!-- Outer glow ring -->
        <circle cx={CX} cy={CY} r={R + 4} fill="none" stroke="rgba(232,115,74,0.15)" stroke-width="8"/>

        <!-- Slices -->
        {#each slices as slice, i}
          <path d={slicePath(slice.start, slice.end)} fill={slice.color} />
          <!-- Divider lines -->
          <line
            x1={CX} y1={CY}
            x2={CX + R * Math.cos((slice.start - 90) * Math.PI / 180)}
            y2={CY + R * Math.sin((slice.start - 90) * Math.PI / 180)}
            stroke="white" stroke-width="2" opacity="0.6"
          />
          <!-- Label -->
          <text
            x={slice.label.x}
            y={slice.label.y}
            text-anchor="middle"
            dominant-baseline="central"
            fill="white"
            font-size={fontSize}
            font-weight="700"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            style="pointer-events:none; text-shadow: 0 1px 3px rgba(0,0,0,0.3);"
            transform="rotate({slice.angle}, {slice.label.x}, {slice.label.y})"
          >
            {truncate(slice.name, labelMaxChars)}
          </text>
        {/each}

        <!-- Center cap -->
        <circle cx={CX} cy={CY} r="26" fill="white" filter="url(#shadow)"/>
        <circle cx={CX} cy={CY} r="20" fill="#fdf8f4" stroke="#e8734a" stroke-width="3"/>
        <circle cx={CX} cy={CY} r="6" fill="#e8734a"/>

        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.15"/>
          </filter>
        </defs>
      </svg>
    </div>

    <p class="hint">{spinning ? '🌀 Dreht sich...' : isDragging ? '✊ Loslassen zum Starten' : '👆 Rad drehen zum Starten'}</p>

    <!-- Players editor -->
    <div class="players-box">
      <div class="players-header">
        <span class="players-title">Spieler ({players.length})</span>
        <button class="add-btn" on:click={addPlayer} disabled={players.length >= 12}>+ Hinzufügen</button>
      </div>

      <div class="players-list">
        {#each players as player, i}
          <div class="player-row">
            <span class="player-dot" style="background: {PALETTE[i % PALETTE.length]}"></span>

            {#if editingIndex === i}
              <input
                class="player-input"
                bind:value={editingValue}
                on:blur={commitEdit}
                on:keydown={onEditKey}
                autofocus
                maxlength="20"
              />
            {:else}
              <span class="player-name" on:click={() => startEdit(i)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && startEdit(i)}>
                {player}
              </span>
            {/if}

            <button class="remove-btn" on:click={() => removePlayer(i)} disabled={players.length <= 2} aria-label="Entfernen">
              ✕
            </button>
          </div>
        {/each}
      </div>
    </div>
  </div>
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    background: #fdf8f4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .confetti-canvas {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 200;
  }

  /* ── Result overlay ── */
  .result-overlay {
    position: fixed;
    inset: 0;
    background: rgba(26, 26, 26, 0.55);
    backdrop-filter: blur(6px);
    display: grid;
    place-items: center;
    z-index: 300;
    animation: fadeIn 0.25s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .result-card {
    background: white;
    border-radius: 32px;
    padding: 48px 40px;
    text-align: center;
    box-shadow: 0 20px 80px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    animation: popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    max-width: 340px;
    width: 90%;
  }

  @keyframes popIn {
    from { transform: scale(0.7); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .result-emoji {
    font-size: 3.5rem;
    animation: bounce 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
  }

  @keyframes bounce {
    from { transform: scale(0); }
    to   { transform: scale(1); }
  }

  .result-label {
    font-size: 0.9rem;
    color: #999;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .result-name {
    font-size: 2.8rem;
    font-weight: 900;
    color: #1a1a1a;
    letter-spacing: -1.5px;
    line-height: 1;
  }

  .result-close {
    margin-top: 12px;
    background: #e8734a;
    color: white;
    border: none;
    padding: 14px 36px;
    border-radius: 50px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(232,115,74,0.35);
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .result-close:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(232,115,74,0.45);
  }

  /* ── Layout ── */
  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 72px 24px 40px;
    position: relative;
  }

  nav {
    position: fixed;
    top: 20px;
    left: 24px;
    z-index: 10;
  }

  .nav-btn {
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

  .nav-btn svg { width: 20px; height: 20px; }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    max-width: 480px;
    width: 100%;
    text-align: center;
  }

  /* ── Header ── */
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .logo-icon { font-size: 2.4rem; }

  h1 {
    font-size: 2.8rem;
    font-weight: 900;
    color: #1a1a1a;
    letter-spacing: -1.5px;
  }

  .tagline {
    font-size: 0.95rem;
    color: #aaa;
    font-weight: 500;
  }

  /* ── Wheel wrapper ── */
  .wheel-wrap {
    position: relative;
    width: min(80vw, 360px);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .pointer {
    position: absolute;
    top: -16px;
    z-index: 10;
    font-size: 1.8rem;
    color: #1a1a1a;
    line-height: 1;
    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.25));
    pointer-events: none;
  }

  .wheel {
    width: 100%;
    cursor: grab;
    filter: drop-shadow(0 8px 32px rgba(0,0,0,0.12));
    user-select: none;
    touch-action: none;
    will-change: transform;
  }

  .wheel:active { cursor: grabbing; }
  .wheel.spinning { cursor: default; }

  /* ── Hint ── */
  .hint {
    font-size: 0.88rem;
    color: #bbb;
    font-weight: 600;
    letter-spacing: 0.2px;
    height: 20px;
  }

  /* ── Players box ── */
  .players-box {
    background: white;
    border-radius: 24px;
    padding: 20px;
    width: 100%;
    box-shadow: 0 2px 16px rgba(0,0,0,0.06);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .players-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .players-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: #bbb;
    text-transform: uppercase;
    letter-spacing: 0.7px;
  }

  .add-btn {
    background: #e8734a;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 50px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 3px 12px rgba(232,115,74,0.3);
  }

  .add-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 5px 18px rgba(232,115,74,0.4);
  }

  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .players-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .player-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #fdf8f4;
    border-radius: 14px;
    transition: background 0.15s;
  }

  .player-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .player-name {
    flex: 1;
    font-size: 0.95rem;
    font-weight: 600;
    color: #1a1a1a;
    text-align: left;
    cursor: pointer;
    padding: 2px 0;
  }

  .player-name:hover {
    color: #e8734a;
  }

  .player-input {
    flex: 1;
    font-size: 0.95rem;
    font-weight: 600;
    color: #1a1a1a;
    border: none;
    background: transparent;
    outline: 2px solid #e8734a;
    border-radius: 8px;
    padding: 2px 6px;
  }

  .remove-btn {
    background: none;
    border: none;
    color: #ccc;
    font-size: 0.8rem;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 8px;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .remove-btn:hover:not(:disabled) {
    color: #e8734a;
    background: rgba(232,115,74,0.08);
  }

  .remove-btn:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }
</style>
