<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // Presets
  const presets = [
    { name: 'Classic Pomodoro',       icon: '🍅', work: 25,  break: 5  },
    { name: 'Eisenhower Pomodoro',    icon: '📋', work: 50,  break: 10 },
    { name: '52/17 Rule',             icon: '⚡', work: 52,  break: 17 },
    { name: '90 Minute Work Cycle',   icon: '🧠', work: 90,  break: 20 },
    { name: 'Timeboxing Technique',   icon: '📦', work: 60,  break: 15 },
  ];

  // Settings state
  let focusGoal = 4;         // sessions per day goal
  let activePreset = '';

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pomodoro-settings') || '{}');
      if (saved.focusGoal) focusGoal = saved.focusGoal;
      if (saved.activePreset) activePreset = saved.activePreset;
    } catch {}
  });

  function applyPreset(preset: typeof presets[0]) {
    activePreset = preset.name;
    save();
    // Also write work/break directly so the timer picks them up
    const existing = JSON.parse(localStorage.getItem('pomodoro-settings') || '{}');
    existing.workMinutes = preset.work;
    existing.breakMinutes = preset.break;
    existing.activePreset = preset.name;
    existing.focusGoal = focusGoal;
    localStorage.setItem('pomodoro-settings', JSON.stringify(existing));
  }

  function save() {
    const existing = JSON.parse(localStorage.getItem('pomodoro-settings') || '{}');
    existing.focusGoal = focusGoal;
    existing.activePreset = activePreset;
    localStorage.setItem('pomodoro-settings', JSON.stringify(existing));
  }

  function back() {
    save();
    goto('/pomodoro');
  }
</script>

<main>
  <nav>
    <button class="nav-btn" on:click={back} aria-label="Back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  </nav>

  <div class="hero">
    <div class="logo">
      <span class="logo-icon">⚙️</span>
      <h1>Einstellungen</h1>
    </div>

    <!-- Focus Goal -->
    <div class="section">
      <p class="section-title">🎯 Tagesziel</p>
      <p class="section-sub">Wie viele Focus-Sessions willst du heute schaffen?</p>
      <div class="goal-row">
        <button class="stepper" on:click={() => { focusGoal = Math.max(1, focusGoal - 1); save(); }}>−</button>
        <div class="goal-display">
          <span class="goal-number">{focusGoal}</span>
          <span class="goal-label">Sessions</span>
        </div>
        <button class="stepper" on:click={() => { focusGoal = Math.min(20, focusGoal + 1); save(); }}>+</button>
      </div>
      <div class="goal-dots">
        {#each Array(Math.min(focusGoal, 12)) as _}
          <span class="dot active"></span>
        {/each}
        {#each Array(Math.max(0, 12 - focusGoal)) as _}
          <span class="dot"></span>
        {/each}
      </div>
    </div>

    <!-- Presets -->
    <div class="section">
      <p class="section-title">⏱ Presets</p>
      <p class="section-sub">Wähle eine Technik – die Uhr wird automatisch eingestellt.</p>
      <div class="presets">
        {#each presets as preset}
          <button
            class="preset-card"
            class:active={activePreset === preset.name}
            on:click={() => applyPreset(preset)}
          >
            <span class="preset-icon">{preset.icon}</span>
            <span class="preset-name">{preset.name}</span>
            <span class="preset-time">{preset.work}min / {preset.break}min</span>
            {#if activePreset === preset.name}
              <span class="preset-check">✓</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <button class="cta" on:click={back}>Speichern & zurück</button>
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
    padding: 40px 24px;
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
    gap: 28px;
    max-width: 480px;
    width: 100%;
    text-align: center;
  }

  .logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .logo-icon { font-size: 2.8rem; }
  h1 {
    font-size: 2.8rem;
    font-weight: 800;
    color: #1a1a1a;
    letter-spacing: -1px;
  }

  /* Sections */
  .section {
    background: white;
    border-radius: 20px;
    padding: 24px 20px;
    width: 100%;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 700;
    color: #1a1a1a;
    align-self: flex-start;
  }

  .section-sub {
    font-size: 0.85rem;
    color: #999;
    align-self: flex-start;
    text-align: left;
    line-height: 1.5;
    margin-top: -8px;
  }

  /* Goal */
  .goal-row {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .stepper {
    background: #f5f0eb;
    border: none;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    font-size: 1.4rem;
    font-weight: 700;
    color: #555;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    display: grid;
    place-items: center;
  }
  .stepper:hover { background: #ede6de; transform: scale(1.08); }
  .stepper:active { transform: scale(0.95); }

  .goal-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 64px;
  }
  .goal-number {
    font-size: 2.8rem;
    font-weight: 800;
    color: #1a1a1a;
    line-height: 1;
    letter-spacing: -1px;
  }
  .goal-label {
    font-size: 0.8rem;
    color: #bbb;
    font-weight: 500;
  }

  .goal-dots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    max-width: 200px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #eee;
    transition: background 0.2s;
  }
  .dot.active { background: #e8734a; }

  /* Presets */
  .presets {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  .preset-card {
    background: #fdf8f4;
    border: 2px solid transparent;
    border-radius: 14px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
    text-align: left;
    width: 100%;
    position: relative;
  }
  .preset-card:hover {
    background: #f5ede4;
    transform: translateX(2px);
  }
  .preset-card.active {
    border-color: #e8734a;
    background: #fff5f0;
  }

  .preset-icon { font-size: 1.4rem; flex-shrink: 0; }

  .preset-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #1a1a1a;
    flex: 1;
  }

  .preset-time {
    font-size: 0.82rem;
    color: #aaa;
    font-weight: 500;
    white-space: nowrap;
  }

  .preset-check {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: #e8734a;
    font-weight: 800;
    font-size: 1rem;
  }

  /* CTA */
  .cta {
    background: #e8734a;
    color: white;
    border: none;
    padding: 18px 48px;
    border-radius: 50px;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 20px rgba(232, 115, 74, 0.35);
    width: 100%;
    max-width: 280px;
  }
  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(232, 115, 74, 0.45);
  }
  .cta:active { transform: translateY(0); }
</style>
