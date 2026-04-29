<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<main>
  <div class="hero">

    <!-- Welcome -->
    <div class="welcome">
      <span class="logo-icon">✦</span>
      <h1>Glimpse</h1>
      <p class="tagline">Deine kleinen Tools für den Alltag.<br>Einfach. Schnell. Schön.</p>
    </div>

    <!-- RSVP Reader -->
    <div class="app-card">
      <div class="app-header">
        <span class="app-icon">👁️</span>
        <div>
          <h2>RSVP Reader</h2>
          <p class="app-sub">Schneller lesen, mehr verstehen</p>
        </div>
      </div>
      <div class="features">
        <div class="feature">
          <span>⚡</span>
          <p>Bis zu 1000 Wörter pro Minute</p>
        </div>
        <div class="feature">
          <span>📚</span>
          <p>EPUB Bücher laden</p>
        </div>
        <div class="feature">
          <span>🌙</span>
          <p>Tag- & Nachtmodus</p>
        </div>
      </div>
      <button class="cta" on:click={() => goto('/reader')}>
        Start Reading
      </button>
    </div>

    <!-- Pomodoro Timer -->
    <div class="app-card">
      <div class="app-header">
        <span class="app-icon">🍅</span>
        <div>
          <h2>Pomodoro Timer</h2>
          <p class="app-sub">Fokussiert lernen, bewusst pausieren</p>
        </div>
      </div>
      <div class="features">
        <div class="feature">
          <span>🕐</span>
          <p>Lernzeit per Uhr einstellen</p>
        </div>
        <div class="feature">
          <span>☕</span>
          <p>Automatische Pausen</p>
        </div>
        <div class="feature">
          <span>📊</span>
          <p>Session-Statistiken</p>
        </div>
      </div>
      <button class="cta pomodoro" on:click={() => goto('/pomodoro')}>
        Start Timer
      </button>
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
    padding: 40px 24px;
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

  /* Welcome block */
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding-bottom: 8px;
  }

  .logo-icon {
    font-size: 2.8rem;
  }

  h1 {
    font-size: 3rem;
    font-weight: 800;
    color: #1a1a1a;
    letter-spacing: -1px;
  }

  .tagline {
    font-size: 1.1rem;
    color: #888;
    line-height: 1.7;
  }

  /* App cards */
  .app-card {
    background: white;
    border-radius: 24px;
    padding: 28px 24px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.07);
  }

  .app-header {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    text-align: left;
  }

  .app-icon {
    font-size: 2.4rem;
    flex-shrink: 0;
  }

  h2 {
    font-size: 1.4rem;
    font-weight: 800;
    color: #1a1a1a;
    letter-spacing: -0.4px;
  }

  .app-sub {
    font-size: 0.88rem;
    color: #999;
    margin-top: 2px;
  }

  /* Feature chips */
  .features {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    width: 100%;
  }

  .feature {
    background: #fdf8f4;
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    color: #666;
    flex: 1;
    min-width: 90px;
    max-width: 130px;
  }

  .feature span {
    font-size: 1.4rem;
  }

  /* Buttons */
  .cta {
    background: #e8734a;
    color: white;
    border: none;
    padding: 16px 48px;
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

  .cta:active {
    transform: translateY(0);
  }

  .cta.pomodoro {
    background: #1a1a1a;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18);
  }

  .cta.pomodoro:hover {
    box-shadow: 0 8px 28px rgba(0,0,0,0.26);
  }
</style>
