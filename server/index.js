import express from 'express';
import webpush from 'web-push';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();
app.use(express.json());
app.use(cors());

// ── PostgreSQL ─────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Tabellen beim Start erstellen falls sie nicht existieren
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      pin TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reading_log (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username),
      date TEXT NOT NULL,
      words INTEGER NOT NULL,
      source TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Datenbank bereit');
}
initDb().catch(err => console.error('DB Init Fehler:', err));

// ── Auth Helper ────────────────────────────────────────────
async function checkAuth(username, pin) {
  if (!username || !pin) return false;
  const result = await pool.query('SELECT pin FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) return false;
  return result.rows[0].pin === pin;
}

// ── VAPID / Push ───────────────────────────────────────────
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:michel@keiffer.lu',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const subscriptions = new Map();
const pendingTimers = new Map();

app.post('/subscribe', (req, res) => {
  const { deviceId, ...sub } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId fehlt' });
  subscriptions.set(deviceId, sub);
  console.log(`Device registriert: ${deviceId} (${subscriptions.size} total)`);
  res.json({ ok: true });
});

app.post('/schedule', (req, res) => {
  const { endsAt, phase, deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId fehlt' });

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
      if (err.statusCode === 410 || err.statusCode === 404) subscriptions.delete(deviceId);
    }
    pendingTimers.delete(deviceId);
  }, delay);

  pendingTimers.set(deviceId, t);
  res.json({ ok: true, delaySeconds: Math.round(delay / 1000) });
});

app.post('/cancel', (req, res) => {
  const { deviceId } = req.body;
  if (deviceId && pendingTimers.has(deviceId)) {
    clearTimeout(pendingTimers.get(deviceId));
    pendingTimers.delete(deviceId);
  }
  res.json({ ok: true });
});

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

// ── Sync Endpoints ─────────────────────────────────────────

// Account erstellen
app.post('/sync/register', async (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ error: 'Benutzername und PIN erforderlich' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN muss 4 Ziffern sein' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Benutzername: 3–20 Zeichen' });

  try {
    await pool.query('INSERT INTO users (username, pin) VALUES ($1, $2)', [username.toLowerCase(), pin]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Benutzername bereits vergeben' });
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Login prüfen
app.post('/sync/login', async (req, res) => {
  const { username, pin } = req.body;
  const ok = await checkAuth(username?.toLowerCase(), pin);
  if (!ok) return res.status(401).json({ error: 'Falscher Benutzername oder PIN' });
  res.json({ ok: true });
});

// Lokale Daten hochladen (push)
app.post('/sync/push', async (req, res) => {
  const { username, pin, log } = req.body;
  const authed = await checkAuth(username?.toLowerCase(), pin);
  if (!authed) return res.status(401).json({ error: 'Nicht autorisiert' });
  if (!Array.isArray(log)) return res.status(400).json({ error: 'log muss ein Array sein' });

  const user = username.toLowerCase();
  try {
    // Alle alten Einträge löschen und neu schreiben (einfachste Sync-Strategie)
    await pool.query('DELETE FROM reading_log WHERE username = $1', [user]);
    for (const entry of log) {
      await pool.query(
        'INSERT INTO reading_log (username, date, words, source, note) VALUES ($1, $2, $3, $4, $5)',
        [user, entry.date, entry.words, entry.source, entry.note ?? null]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Serverfehler beim Speichern' });
  }
});

// Daten vom Server holen (pull)
app.get('/sync/pull', async (req, res) => {
  const { username, pin } = req.query;
  const authed = await checkAuth(username?.toLowerCase(), pin);
  if (!authed) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const result = await pool.query(
      'SELECT date, words, source, note FROM reading_log WHERE username = $1 ORDER BY date DESC',
      [username.toLowerCase()]
    );
    res.json({ ok: true, log: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
