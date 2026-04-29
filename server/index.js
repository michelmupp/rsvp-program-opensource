import express from 'express';
import webpush from 'web-push';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

// VAPID Keys – wir generieren diese gleich
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:michel@keiffer.lu',  // ersetze das mit deiner echten Email
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Subscriptions im Speicher halten (reicht für eine Person)
let subscription = null;
const pendingTimers = new Map();

// PWA schickt ihre Subscription hierher
app.post('/subscribe', (req, res) => {
  subscription = req.body;
  res.json({ ok: true });
});

// PWA schickt Timer-Endzeit hierher
app.post('/schedule', (req, res) => {
  const { endsAt, phase, breakMinutes } = req.body;
  // endsAt = Unix timestamp in ms

  // Bestehende Timer löschen
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();

  if (!subscription) {
    return res.status(400).json({ error: 'Keine Subscription vorhanden' });
  }

  const delay = endsAt - Date.now();
  if (delay <= 0) {
    return res.json({ ok: true, note: 'Timer bereits abgelaufen' });
  }

  // Timer planen
  const t = setTimeout(async () => {
    const isWork = phase === 'work';
    const payload = JSON.stringify({
      title: isWork ? '🍅 Fokuszeit vorbei!' : '☕ Pause vorbei!',
      body: isWork ? 'Zeit für eine Pause – gut gemacht!' : 'Bereit für die nächste Session?',
    });
    try {
      await webpush.sendNotification(subscription, payload);
    } catch (err) {
      console.error('Push fehlgeschlagen:', err);
    }
    pendingTimers.delete('current');
  }, delay);

  pendingTimers.set('current', t);
  res.json({ ok: true, delaySeconds: Math.round(delay / 1000) });
});

// Timer abbrechen (wenn User auf Stop drückt)
app.post('/cancel', (req, res) => {
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();
  res.json({ ok: true });
});

// Public Key an PWA schicken
app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));