<script>
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let { children } = $props();
  let dark = $state(false);
  let menuOpen = $state(false);

  onMount(() => {
    dark = document.documentElement.classList.contains('dark');
  });

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    if (browser) localStorage.setItem('glimpse-theme', dark ? 'dark' : 'light');
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
  }

  function navigate(path) {
    menuOpen = false;
    goto(path);
  }

  const pages = [
    { path: '/',         icon: '✦',  label: 'Home' },
    { path: '/reader',   icon: '👁️', label: 'RSVP Reader' },
    { path: '/pomodoro', icon: '🍅', label: 'Pomodoro Timer' },
    { path: '/qr',       icon: '⬛', label: 'QR Generator' },
    { path: '/wheelit',  icon: '🎡', label: 'Wheelit' },
  ];
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<!-- Dark mode toggle -->
<button class="theme-toggle" onclick={toggleTheme}>
  {dark ? '☀️' : '🌙'}
</button>

<!-- Hamburger button -->
<button class="hamburger" onclick={toggleMenu} aria-label="Menü">
  <span class:open={menuOpen}></span>
  <span class:open={menuOpen}></span>
  <span class:open={menuOpen}></span>
</button>

<!-- Menu overlay -->
{#if menuOpen}
  <div class="overlay" onclick={toggleMenu}></div>
  <nav class="menu">
    <p class="menu-title">Glimpse</p>
    {#each pages as page}
      <button class="menu-item" onclick={() => navigate(page.path)}>
        <span class="menu-icon">{page.icon}</span>
        <span>{page.label}</span>
      </button>
    {/each}
  </nav>
{/if}

{@render children()}

<style>
  /* Dark mode toggle */
  .theme-toggle {
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 1000;
    background: var(--panel);
    border: none;
    border-radius: 14px;
    width: 44px;
    height: 44px;
    font-size: 1.2rem;
    cursor: pointer;
    box-shadow: 0 2px 12px var(--shadow);
    display: grid;
    place-items: center;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .theme-toggle:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px var(--shadow);
  }

  /* Hamburger button */
  .hamburger {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    background: var(--panel);
    border: none;
    border-radius: 14px;
    width: 44px;
    height: 44px;
    cursor: pointer;
    box-shadow: 0 2px 12px var(--shadow);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 5px;
    padding: 0;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .hamburger:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px var(--shadow);
  }

  .hamburger span {
    display: block;
    width: 18px;
    height: 2px;
    background: var(--muted);
    border-radius: 2px;
    transition: transform 0.2s, opacity 0.2s;
  }

  .hamburger span.open:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
  }
  .hamburger span.open:nth-child(2) {
    opacity: 0;
  }
  .hamburger span.open:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
  }

  /* Overlay */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    z-index: 998;
  }

  /* Menu panel */
  .menu {
    position: fixed;
    top: 0;
    right: 0;
    height: 100%;
    width: 260px;
    background: var(--panel);
    box-shadow: -8px 0 40px var(--shadow);
    z-index: 999;
    display: flex;
    flex-direction: column;
    padding: 80px 20px 40px;
    gap: 6px;
  }

  .menu-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 0 12px;
    margin-bottom: 8px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 14px;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.15s, color 0.15s;
  }

  .menu-item:hover {
    background: var(--panel-inner);
    color: var(--accent);
  }

  .menu-icon {
    font-size: 1.2rem;
    width: 28px;
    text-align: center;
  }
</style>