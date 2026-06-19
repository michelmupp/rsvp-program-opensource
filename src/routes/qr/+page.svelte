<script lang="ts">
  import { onMount } from 'svelte';

  let input = '';
  let qrCanvas: HTMLCanvasElement;
  let hasQR = false;
  let copied = false;
  let qrError = '';
  let QRCode: any;

  onMount(async () => {
    const mod = await import('qrcode');
    QRCode = mod.default;
  });

  let debounceTimer: ReturnType<typeof setTimeout>;

  async function generate() {
    if (!QRCode || !input.trim()) return;
    
    qrError = '';
    try {
      // Wir nutzen das Canvas aus dem Markup direkt (qrCanvas)
      await QRCode.toCanvas(qrCanvas, input.trim(), {
        width: 260,
        margin: 2,
        color: {
          dark: '#1a1a1a',
          light: '#fdf8f4',
        },
      });
      hasQR = true;
    } catch (err) {
      // Z.B. wenn der Text zu lang für einen QR Code ist
      qrError = 'Text ist zu lang für einen QR-Code.';
      hasQR = false;
    }
  }

  function onInput() {
    clearTimeout(debounceTimer);
    hasQR = false;
    if (!input.trim()) return;
    debounceTimer = setTimeout(generate, 400);
  }

  function download() {
    if (!hasQR) return;
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = qrCanvas.toDataURL('image/png');
    link.click();
  }

  function copyToClipboard() {
    if (!hasQR || !navigator.clipboard) return;
    qrCanvas.toBlob(blob => {
      if (!blob) return;
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      copied = true;
      setTimeout(() => copied = false, 2000);
    });
  }

  function clear() {
    input = '';
    hasQR = false;
    qrError = '';
    // Canvas leeren, ohne das DOM zu zerstören
    if (qrCanvas) {
      const ctx = qrCanvas.getContext('2d');
      ctx?.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
    }
  }
</script>

<main>
  <div class="hero">
    <div class="logo">
      <span class="logo-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
          <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm7-2h7v7h-7V3zm2 2v3h3V5h-3zM3 13h7v7H3v-7zm2 2v3h3v-3H5zm11 0h2v2h-2v-2zm-4-2h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0-4h2v2h-2v-2zm2 2h2v2h-2v-2z"/>
        </svg>
      </span>
      <h1>QR Generator</h1>
      <p class="tagline">Text oder URL in QR Code umwandeln</p>
    </div>

    <!-- Input box -->
    <div class="input-box">
      <p class="section-label">Eingabe</p>
      <div class="input-wrap">
        <textarea
          bind:value={input}
          on:input={onInput}
          placeholder="Text oder URL eingeben…"
          rows="3"
          maxlength="500"
        ></textarea>
        {#if input}
          <button type="button" class="clear-btn" on:click={clear} aria-label="Leeren">✕</button>
        {/if}
      </div>
      <span class="char-count">{input.length} / 500</span>
    </div>

    <!-- QR Display -->
    <div class="qr-box" class:has-qr={hasQR}>
      <!-- Canvas ist jetzt fest im Markup verankert -->
      <canvas bind:this={qrCanvas} class="qr-canvas" class:hidden={!hasQR}></canvas>

      {#if !hasQR}
        <div class="qr-placeholder">
          <div class="placeholder-grid">
            {#each Array(9) as _}
              <div class="placeholder-cell"></div>
            {/each}
          </div>
          <p class="placeholder-text">{qrError ? qrError : 'QR Code erscheint hier'}</p>
        </div>
      {/if}
    </div>

    <!-- Actions -->
    {#if hasQR}
      <div class="actions">
        <button type="button" class="action-btn primary" on:click={download}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Herunterladen
        </button>
        <button type="button" class="action-btn secondary" on:click={copyToClipboard}>
          {#if copied}
            ✓ Kopiert!
          {:else}
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Bild kopieren
          {/if}
        </button>
      </div>
    {/if}
  </div>
</main>

<style>
  main { min-height: 100vh; display: grid; place-items: center; padding: 72px 24px 48px; }

  .hero { display: flex; flex-direction: column; align-items: center; gap: 24px; max-width: 400px; width: 100%; text-align: center; }

  .logo { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .logo-icon { font-size: 2.8rem; color: var(--text); }
  h1 { font-size: 2.8rem; font-weight: 800; color: var(--text); letter-spacing: -1px; }
  .tagline { font-size: 0.92rem; color: var(--muted); font-weight: 500; }

  /* Input */
  .input-box { background: var(--panel); border-radius: 20px; padding: 20px; box-shadow: 0 2px 12px var(--shadow); width: 100%; display: flex; flex-direction: column; gap: 10px; }
  .section-label { font-size: 0.78rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.7px; text-align: left; }

  .input-wrap { position: relative; }
  textarea {
    width: 100%; border: 2px solid var(--border); border-radius: 14px;
    padding: 14px 40px 14px 16px; font-size: 0.95rem; font-weight: 500;
    color: var(--text); background: var(--panel-inner); outline: none;
    resize: none; font-family: inherit; line-height: 1.5;
    transition: border-color 0.15s; box-sizing: border-box;
  }
  textarea:focus { border-color: var(--accent); }
  textarea::placeholder { color: var(--muted); }

  .clear-btn { position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--muted); font-size: 0.85rem; cursor: pointer; padding: 4px 6px; border-radius: 8px; transition: color 0.15s; }
  .clear-btn:hover { color: var(--accent); }

  .char-count { font-size: 0.75rem; color: var(--muted); text-align: right; }

  /* QR box */
  .qr-box { background: var(--panel); border-radius: 24px; padding: 28px; box-shadow: 0 2px 12px var(--shadow); width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; transition: box-shadow 0.3s; position: relative; }
  .qr-box.has-qr { box-shadow: 0 8px 40px var(--accent-shadow); }

  .qr-canvas { border-radius: 12px; }
  .qr-canvas.hidden { display: none; } /* Versteckt das Canvas, wenn der Placeholder da ist */

  /* Placeholder */
  .qr-placeholder { display: flex; flex-direction: column; align-items: center; gap: 20px; position: absolute; }
  .placeholder-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 80px; }
  .placeholder-cell { width: 22px; height: 22px; border-radius: 4px; background: var(--border); animation: pulse 1.8s ease-in-out infinite; }
  .placeholder-cell:nth-child(2) { animation-delay: 0.1s; }
  .placeholder-cell:nth-child(3) { animation-delay: 0.2s; }
  .placeholder-cell:nth-child(4) { animation-delay: 0.3s; }
  .placeholder-cell:nth-child(5) { animation-delay: 0.4s; }
  .placeholder-cell:nth-child(6) { animation-delay: 0.5s; }
  .placeholder-cell:nth-child(7) { animation-delay: 0.6s; }
  .placeholder-cell:nth-child(8) { animation-delay: 0.7s; }
  .placeholder-cell:nth-child(9) { animation-delay: 0.8s; }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  .placeholder-text { font-size: 0.85rem; color: var(--muted); font-weight: 500; }

  /* Actions */
  .actions { display: flex; gap: 12px; width: 100%; }
  .action-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 14px; border: none; font-size: 0.95rem; font-weight: 700; cursor: pointer; font-family: inherit; transition: transform 0.15s, box-shadow 0.15s; }
  .action-btn.primary { background: var(--accent); color: white; box-shadow: 0 4px 16px var(--accent-shadow); }
  .action-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px var(--accent-shadow); }
  .action-btn.secondary { background: var(--panel); color: var(--text); box-shadow: 0 2px 12px var(--shadow); }
  .action-btn.secondary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px var(--shadow); }
</style>