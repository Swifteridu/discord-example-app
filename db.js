// db.js
import Database from 'better-sqlite3';
import 'dotenv/config';

const db = new Database(process.env.DB_PATH || 'bets.sqlite', { fileMustExist: false });

db.pragma('journal_mode = WAL');
db.pragma('cache_size = -16000');
db.pragma('foreign_keys = ON');

// Basis-Schema
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL,
  last_claim_at INTEGER
);

CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  owner_id TEXT NOT NULL,
  is_closed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bet_entries (
  bet_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  choice TEXT NOT NULL,
  choice_norm TEXT NOT NULL,
  PRIMARY KEY (bet_id, user_id),
  FOREIGN KEY (bet_id) REFERENCES bets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  betting_channel_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bets_open ON bets(channel_id, is_closed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_norm ON bet_entries(bet_id, choice_norm);
`);

// Migration: altes Unique-Index (eine offene Bet pro Channel) entfernen, falls vorhanden
try { db.exec(`DROP INDEX IF EXISTS idx_open_bet_per_channel;`); } catch {}

// Migration: falls ältere DB bets.guild_id nicht hat -> hinzufügen
const cols = db.prepare(`PRAGMA table_info(bets);`).all().map(c => c.name);
if (!cols.includes('guild_id')) {
  db.exec(`ALTER TABLE bets ADD COLUMN guild_id TEXT;`);
  // bestehende Zeilen bestmöglich füllen (lassen guild_id leer, neue Inserts schreiben korrekt)
}

export default db;
