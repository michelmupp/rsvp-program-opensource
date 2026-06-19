<script lang="ts">
  // Wir lagern die Daten in ein Array aus. 
  // So kannst du später ganz einfach neue Apps hinzufügen!
  const apps = [
    {
      title: 'RSVP Reader',
      sub: 'Schneller lesen, mehr verstehen',
      icon: '👁️',
      href: '/reader',
      cta: 'Start Reading',
      features: [
        { icon: '⚡', text: 'Bis zu 1000 Wörter pro Minute' },
        { icon: '📚', text: 'EPUB Bücher laden' },
        { icon: '🌙', text: 'Tag- & Nachtmodus' }
      ]
    },
    {
      title: 'QR Generator',
      sub: 'Text oder URL als QR Code',
      // SVG direkt als String speichern (aria-hidden für Screenreader hinzugefügt)
      icon: `<svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
              <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm7-2h7v7h-7V3zm2 2v3h3V5h-3zM3 13h7v7H3v-7zm2 2v3h3v-3H5zm11 0h2v2h-2v-2zm-4-2h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0-4h2v2h-2v-2zm2 2h2v2h-2v-2z"/>
            </svg>`,
      href: '/qr',
      cta: 'QR erstellen',
      features: [
        { icon: '⌨️', text: 'Text oder URL eingeben' },
        { icon: '⚡', text: 'Sofort generiert' },
        { icon: '💾', text: 'Als PNG herunterladen' }
      ]
    },
    {
      title: 'Pomodoro Timer',
      sub: 'Fokussiert lernen, bewusst pausieren',
      icon: '🍅',
      href: '/pomodoro',
      cta: 'Start Timer',
      features: [
        { icon: '🕐', text: 'Lernzeit per Uhr einstellen' },
        { icon: '☕', text: 'Automatische Pausen' },
        { icon: '📊', text: 'Session-Statistiken' }
      ]
    },
    {
      title: 'Wheelit',
      sub: 'Fair entscheiden, zufällig bestimmen',
      icon: '🎡',
      href: '/wheelit',
      cta: 'Rad drehen',
      features: [
        { icon: '🌀', text: 'Rad drehen & loslassen' },
        { icon: '👥', text: 'Spieler anpassen' },
        { icon: '🎉', text: 'Konfetti-Gewinner' }
      ]
    }
  ];
</script>

<main>
  <div class="hero">

    <!-- Welcome -->
    <div class="welcome">
      <span class="logo-icon" aria-hidden="true">✦</span>
      <h1>Glimpse</h1>
      <p class="tagline">Deine kleinen Tools für den Alltag.<br>Einfach. Schnell. Schön.</p>
    </div>

    <!-- Dynamische Generierung der App-Karten -->
    {#each apps as app (app.title)}
      <article class="app-card">
        <div class="app-header">
          <!-- Wenn das Icon ein SVG String ist, nutzen wir @html, ansonsten rendern wir es als Text -->
          <span class="app-icon" aria-hidden="true">
            {#if app.icon.startsWith('<svg')}
              {@html app.icon}
            {:else}
              {app.icon}
            {/if}
          </span>
          <div>
            <h2>{app.title}</h2>
            <p class="app-sub">{app.sub}</p>
          </div>
        </div>

        <div class="features">
          {#each app.features as feature}
            <div class="feature">
              <span aria-hidden="true">{feature.icon}</span>
              <p>{feature.text}</p>
            </div>
          {/each}
        </div>

        <!-- Standard <a> Tag statt button + goto() für bessere Accessibility -->
        <a href={app.href} class="cta">
          {app.cta}
        </a>
      </article>
    {/each}

  </div>
</main>

<style>
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
    color: var(--text);
  }

  h1 {
    font-size: 3rem;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -1px;
  }

  .tagline {
    font-size: 1.1rem;
    color: var(--muted);
    line-height: 1.7;
  }

  /* App cards */
  /* <article> ist semantisch passender als <div> für inhaltliche Karten */
  .app-card {
    background: var(--panel);
    border-radius: 24px;
    padding: 28px 24px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    box-shadow: 0 2px 16px var(--shadow);
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
    display: flex;
    align-items: center;
    justify-content: center;
  }

  h2 {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.4px;
  }

  .app-sub {
    font-size: 0.88rem;
    color: var(--muted);
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
    background: var(--panel-inner);
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    color: var(--muted);
    flex: 1;
    min-width: 90px;
    max-width: 130px;
  }

  .feature span {
    font-size: 1.4rem;
  }

  /* Buttons (als Links gestyled) */
  .cta {
    background: var(--accent);
    color: var(--panel);
    /* Wichtig, da wir jetzt <a> nutzen: */
    text-decoration: none; 
    display: inline-flex;
    justify-content: center;
    align-items: center;
    padding: 16px 48px;
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
    box-shadow: 0 8px 28px var(--accent-shadow); /* Nutzt jetzt die Variable statt hardcoded RGBA */
  }

  .cta:active {
    transform: translateY(0);
  }
</style>