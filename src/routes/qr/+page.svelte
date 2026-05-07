<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, afterUpdate } from 'svelte';

  let input = '';
  let qrCanvas: HTMLCanvasElement;
  let hasQR = false;
  let copied = false;
  let QRCode: any;

  onMount(async () => {
    const mod = await import('qrcode');
    QRCode = mod.default;
  });

  let debounceTimer: ReturnType<typeof setTimeout>;
  let qrInstance: any = null;

  async function generate() {
    if (!QRCode || !input.trim()) return;

    const container = document.getElementById('qr-container')!;
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    await QRCode.toCanvas(canvas, input.trim(), {
      width: 260,
      margin: 2,
      color: {
        dark: '#1a1a1a',
        light: '#fdf8f4',
      },
    });

    qrCanvas = canvas;
    hasQR = true;
  }

  function onInput() {
    clearTimeout(debounceTimer);
    hasQR = false;
    if (!input.trim()) return;
    debounceTimer = setTimeout(generate, 400);
  }

  function download() {
    if (!qrCanvas) return;
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = qrCanvas.toDataURL('image/png');
    link.click();
  }

  function copyToClipboard() {
    if (!navigator.clipboard) return;
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
    if (qrInstance) { qrInstance.clear(); qrInstance = null; }
    const container = document.getElementById('qr-container');
    if (container) container.innerHTML = '<canvas bind:this={qrCanvas}></canvas>';
  }
</script>

<main>
  <nav>
    <button class="nav-btn" on:click={() => goto('/')} aria-label="Zurück">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  </nav>

  <div class="hero">
    <div class="logo">
      <span class="logo-icon">⬛</span>
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
          <button class="clear-btn" on:click={clear} aria-label="Leeren">✕</button>
        {/if}
      </div>
      <span class="char-count">{input.length} / 500</span>
    </div>

    <!-- QR Display -->
    <div class="qr-box" class:has-qr={hasQR}>
      <div id="qr-container" class="qr-container">
        <!-- QR code rendered here by library -->
      </div>

      {#if !hasQR}
        <div class="qr-placeholder">
          <div class="placeholder-grid">
            {#each Array(9) as _}
              <div class="placeholder-cell"></div>
            {/each}
          </div>
          <p class="placeholder-text">QR Code erscheint hier</p>
        </div>
      {/if}
    </div>

    <!-- Actions -->
    {#if hasQR}
      <div class="actions">
        <button class="action-btn primary" on:click={download}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Herunterladen
        </button>
        <button class="action-btn secondary" on:click={copyToClipboard}>
          {#if copied}
            ✓ Kopiert!
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
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
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) { background: #fdf8f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

  main { min-height: 100vh; display: grid; place-items: center; padding: 72px 24px 48px; }

  nav { position: fixed; top: 20px; left: 24px; z-index: 10; }
  .nav-btn { background: white; border: none; border-radius: 14px; width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer; box-shadow: 0 2px 12px rgba(0,0,0,0.08); color: #555; transition: transform 0.15s, box-shadow 0.15s, color 0.15s; }
  .nav-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12); color: #e8734a; }
  .nav-btn svg { width: 20px; height: 20px; }

  .hero { display: flex; flex-direction: column; align-items: center; gap: 24px; max-width: 400px; width: 100%; text-align: center; }

  .logo { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .logo-icon { font-size: 2.8rem; }
  h1 { font-size: 2.8rem; font-weight: 800; color: #1a1a1a; letter-spacing: -1px; }
  .tagline { font-size: 0.92rem; color: #aaa; font-weight: 500; }

  /* Input */
  .input-box { background: white; border-radius: 20px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); width: 100%; display: flex; flex-direction: column; gap: 10px; }
  .section-label { font-size: 0.78rem; font-weight: 700; color: #bbb; text-transform: uppercase; letter-spacing: 0.7px; text-align: left; }

  .input-wrap { position: relative; }
  textarea {
    width: 100%; border: 2px solid #f0ebe5; border-radius: 14px;
    padding: 14px 40px 14px 16px; font-size: 0.95rem; font-weight: 500;
    color: #1a1a1a; background: #fdf8f4; outline: none;
    resize: none; font-family: inherit; line-height: 1.5;
    transition: border-color 0.15s;
  }
  textarea:focus { border-color: #e8734a; }
  textarea::placeholder { color: #ccc; }

  .clear-btn { position: absolute; top: 10px; right: 10px; background: none; border: none; color: #ccc; font-size: 0.85rem; cursor: pointer; padding: 4px 6px; border-radius: 8px; transition: color 0.15s; }
  .clear-btn:hover { color: #e8734a; }

  .char-count { font-size: 0.75rem; color: #ccc; text-align: right; }

  /* QR box */
  .qr-box { background: white; border-radius: 24px; padding: 28px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; transition: box-shadow 0.3s; }
  .qr-box.has-qr { box-shadow: 0 8px 40px rgba(232,115,74,0.12); }

  .qr-container { display: flex; align-items: center; justify-content: center; }
  :global(#qr-container img) { display: none; } /* hide img, show canvas only */
  :global(#qr-container canvas) { border-radius: 12px; }

  /* Placeholder */
  .qr-placeholder { display: flex; flex-direction: column; align-items: center; gap: 20px; }
  .placeholder-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 80px; }
  .placeholder-cell { width: 22px; height: 22px; border-radius: 4px; background: #f0ebe5; animation: pulse 1.8s ease-in-out infinite; }
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

  .placeholder-text { font-size: 0.85rem; color: #ccc; font-weight: 500; }

  /* Actions */
  .actions { display: flex; gap: 12px; width: 100%; }
  .action-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 14px; border: none; font-size: 0.95rem; font-weight: 700; cursor: pointer; font-family: inherit; transition: transform 0.15s, box-shadow 0.15s; }
  .action-btn.primary { background: #e8734a; color: white; box-shadow: 0 4px 16px rgba(232,115,74,0.3); }
  .action-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(232,115,74,0.4); }
  .action-btn.secondary { background: white; color: #1a1a1a; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .action-btn.secondary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12); }
</style>
