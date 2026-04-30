import express from 'express';
import webpush from 'web-push';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:michel@keiffer.lu',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Multi-device: Map von deviceId -> subscription
const subscriptions = new Map();

// Pro-device Timer: Map von deviceId -> setTimeout handle
const pendingTimers = new Map();

// PWA schickt ihre Subscription + deviceId hierher
app.post('/subscribe', (req, res) => {
  const { deviceId, ...sub } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId fehlt' });
  subscriptions.set(deviceId, sub);
  console.log(`Device registriert: ${deviceId} (${subscriptions.size} total)`);
  res.json({ ok: true });
});

// PWA schickt Timer-Endzeit + deviceId hierher
app.post('/schedule', (req, res) => {
  const { endsAt, phase, deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId fehlt' });

  // Bestehenden Timer für dieses Gerät löschen
  if (pendingTimers.has(deviceId)) {
    clearTimeout(pendingTimers.get(deviceId));
    pendingTimers.delete(deviceId);
  }

  const sub = subscriptions.get(deviceId);
  if (!sub) return res.status(400).json({ error: 'Keine Subscription für dieses Gerät' });

  const delay = endsAt - Date.now();
  if (delay <= 0) return res.json({ ok: true, note: 'Timer bereits abgelaufen' });

  const t = setTimeout(async () => {
    const isWork = phase === 'work';
    const payload = JSON.stringify({
      title: isWork ? '🍅 Fokuszeit vorbei!' : '☕ Pause vorbei!',
      body: isWork ? 'Zeit für eine Pause – gut gemacht!' : 'Bereit für die nächste Session?',
    });
    try {
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      console.error(`Push fehlgeschlagen für ${deviceId}:`, err.statusCode || err.message);
      // Subscription ungültig → entfernen
      if (err.statusCode === 410 || err.statusCode === 404) {
        subscriptions.delete(deviceId);
      }
    }
    pendingTimers.delete(deviceId);
  }, delay);

  pendingTimers.set(deviceId, t);
  res.json({ ok: true, delaySeconds: Math.round(delay / 1000) });
});

// Timer abbrechen für ein bestimmtes Gerät
app.post('/cancel', (req, res) => {
  const { deviceId } = req.body;
  if (deviceId && pendingTimers.has(deviceId)) {
    clearTimeout(pendingTimers.get(deviceId));
    pendingTimers.delete(deviceId);
  }
  res.json({ ok: true });
});

// Public Key an PWA schicken
app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
