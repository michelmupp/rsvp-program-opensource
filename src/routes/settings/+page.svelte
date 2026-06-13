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
    // Dark mode sync
    const theme = localStorage.getItem('glimpse-theme');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');

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
  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 40px 24px;
    position: relative;
  }

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
    color: var(--text);
    letter-spacing: -1px;
  }

  .section {
    background: var(--panel);
    border-radius: 20px;
    padding: 24px 20px;
    width: 100%;
    box-shadow: 0 2px 12px var(--shadow);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
    align-self: flex-start;
  }

  .section-sub {
    font-size: 0.85rem;
    color: var(--muted);
    align-self: flex-start;
    text-align: left;
    line-height: 1.5;
    margin-top: -8px;
  }

  .goal-row {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .stepper {
    background: var(--panel-inner);
    border: none;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--muted);
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    display: grid;
    place-items: center;
  }
  .stepper:hover { background: var(--border); transform: scale(1.08); }
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
    color: var(--text);
    line-height: 1;
    letter-spacing: -1px;
  }
  .goal-label {
    font-size: 0.8rem;
    color: var(--muted);
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
    background: var(--border);
    transition: background 0.2s;
  }
  .dot.active { background: var(--accent); }

  .presets {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  .preset-card {
    background: var(--panel-inner);
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
    background: var(--border);
    transform: translateX(2px);
  }
  .preset-card.active {
    border-color: var(--accent);
    background: var(--panel);
  }

  .preset-icon { font-size: 1.4rem; flex-shrink: 0; }

  .preset-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }

  .preset-time {
    font-size: 0.82rem;
    color: var(--muted);
    font-weight: 500;
    white-space: nowrap;
    margin-right: 24px;
  }

  .preset-check {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--accent);
    font-weight: 800;
    font-size: 1rem;
    line-height: 1;
    width: 20px;
    text-align: center;
  }

  .cta {
    background: var(--accent);
    color: white;
    border: none;
    padding: 18px 48px;
    border-radius: 50px;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 20px var(--accent-shadow);
    width: 100%;
    max-width: 280px;
  }
  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px var(--accent-shadow);
  }
  .cta:active { transform: translateY(0); }
</style>