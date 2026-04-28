<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<main>
  <div class="hero">
    <div class="logo">
      <span class="logo-icon">👁️</span>
      <h1>Glimpse</h1>
    </div>
    <p class="tagline">Read faster. Understand more.<br>One word at a time.</p>

    <button class="cta" on:click={() => goto('/reader')}>
      Start Reading
    </button>

    <div class="features">
      <div class="feature">
        <span>⚡</span>
        <p>Up to 1000 words per minute</p>
      </div>
      <div class="feature">
        <span>📚</span>
        <p>Load any EPUB book</p>
      </div>
      <div class="feature">
        <span>🌙</span>
        <p>Day & night mode</p>
      </div>
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
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    max-width: 480px;
    text-align: center;
  }

  .logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .logo-icon {
    font-size: 3.5rem;
  }

  h1 {
    font-size: 3rem;
    font-weight: 800;
    color: #1a1a1a;
    letter-spacing: -1px;
  }

  .tagline {
    font-size: 1.2rem;
    color: #666;
    line-height: 1.7;
  }

  .cta {
    background: #e8734a;
    color: white;
    border: none;
    padding: 18px 48px;
    border-radius: 50px;
    font-size: 1.15rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 20px rgba(232, 115, 74, 0.35);
  }

  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(232, 115, 74, 0.45);
  }

  .cta:active {
    transform: translateY(0px);
  }

  .features {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .feature {
    background: white;
    border-radius: 16px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    color: #555;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    width: 130px;
  }

  .feature span {
    font-size: 1.6rem;
  }
</style>