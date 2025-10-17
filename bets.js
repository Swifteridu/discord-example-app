// bets.js – SQLite + Multi-Bets + Guild-Channel-Lock
import db from './db.js';

const START_BALANCE = 100;
const DAILY_REWARD = 10;
const DAILY_MS = 24 * 60 * 60 * 1000;

const q = {
  // users
  getUser: db.prepare('SELECT user_id, balance, last_claim_at FROM users WHERE user_id = ?'),
  insertUser: db.prepare('INSERT INTO users (user_id, balance, last_claim_at) VALUES (?, ?, NULL)'),
  setBalance: db.prepare('UPDATE users SET balance = ? WHERE user_id = ?'),
  setLastClaim: db.prepare('UPDATE users SET last_claim_at = ? WHERE user_id = ?'),

  // bets
  insertBet: db.prepare(`
    INSERT INTO bets (guild_id, channel_id, title, amount, owner_id, is_closed, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `),
  getBetById: db.prepare('SELECT * FROM bets WHERE id = ?'),
  listOpenBetsByChannel: db.prepare(`
    SELECT id, title, amount, owner_id, created_at
    FROM bets WHERE channel_id = ? AND is_closed = 0
    ORDER BY created_at DESC
  `),
  closeBet: db.prepare('UPDATE bets SET is_closed = 1 WHERE id = ?'),
  countEntries: db.prepare('SELECT COUNT(*) AS c FROM bet_entries WHERE bet_id = ?'),

  // entries
  insertEntry: db.prepare(`
    INSERT INTO bet_entries (bet_id, user_id, choice, choice_norm)
    VALUES (?, ?, ?, ?)
  `),
  getEntry: db.prepare('SELECT * FROM bet_entries WHERE bet_id = ? AND user_id = ?'),
  listEntries: db.prepare('SELECT user_id, choice, choice_norm FROM bet_entries WHERE bet_id = ? ORDER BY rowid ASC'),
  winnersByNorm: (placeholders) =>
    db.prepare(`SELECT DISTINCT user_id FROM bet_entries WHERE bet_id = ? AND choice_norm IN (${placeholders})`),

  // leaderboard
  topBalances: db.prepare('SELECT user_id, balance FROM users ORDER BY balance DESC, user_id ASC LIMIT ?'),

  // guild settings
  getGuildSetting: db.prepare('SELECT guild_id, betting_channel_id FROM guild_settings WHERE guild_id = ?'),
  upsertGuildSetting: db.prepare(`
    INSERT INTO guild_settings (guild_id, betting_channel_id)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET betting_channel_id = excluded.betting_channel_id
  `),
};

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

function getOrInitUser(userId) {
  let u = q.getUser.get(userId);
  if (!u) {
    q.insertUser.run(userId, START_BALANCE);
    u = q.getUser.get(userId);
  }
  return u;
}

// ---- Guild-Channel-Lock ----
export function setBettingChannel({ guildId, channelId }) {
  if (!guildId || !channelId) return { ok: false, msg: 'Ungültige IDs.' };
  q.upsertGuildSetting.run(guildId, channelId);
  return { ok: true };
}

export function requireBettingChannel({ guildId, channelId }) {
  const s = q.getGuildSetting.get(guildId);
  if (!s) return { ok: false, msg: 'Für diesen Server ist noch kein Bet-Channel gesetzt. Nutze /bet setchannel.' };
  if (s.betting_channel_id !== channelId) {
    return { ok: false, msg: `Bets sind nur im konfigurierten Channel erlaubt (<#${s.betting_channel_id}>).` };
  }
  return { ok: true };
}

// ---- Bets ----
export function createBet({ guildId, channelId, ownerId, title, amount }) {
  const guard = requireBettingChannel({ guildId, channelId });
  if (!guard.ok) return guard;

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, msg: 'Amount muss eine positive Zahl sein.' };
  const t = String(title || '').trim();
  if (!t) return { ok: false, msg: 'Titel darf nicht leer sein.' };

  const createdAt = Date.now();
  const info = q.insertBet.run(guildId, channelId, t, amt, ownerId, createdAt);
  return { ok: true, betId: info.lastInsertRowid };
}

export function joinBet({ guildId, channelId, userId, betId, choice }) {
  const guard = requireBettingChannel({ guildId, channelId });
  if (!guard.ok) return guard;

  const bet = q.getBetById.get(betId);
  if (!bet || bet.channel_id !== channelId) return { ok: false, msg: 'Bet nicht gefunden in diesem Channel.' };
  if (bet.is_closed) return { ok: false, msg: 'Diese Bet ist geschlossen.' };

  const choiceTxt = String(choice || '').trim();
  if (!choiceTxt) return { ok: false, msg: 'Bitte gib deinen Tipp als Text an.' };

  const existing = q.getEntry.get(bet.id, userId);
  if (existing) return { ok: false, msg: 'Du hast für diese Bet bereits einen Tipp abgegeben.' };

  const user = getOrInitUser(userId);
  if (user.balance < bet.amount) return { ok: false, msg: `Du brauchst ${bet.amount} Coins.` };

  const tx = db.transaction(() => {
    q.setBalance.run(user.balance - bet.amount, userId);
    q.insertEntry.run(bet.id, userId, choiceTxt, norm(choiceTxt));
  });
  tx();

  const { c } = q.countEntries.get(bet.id);
  const pot = c * bet.amount;
  return { ok: true, choice: choiceTxt, pot };
}

export function closeBet({ guildId, channelId, userId, betId }) {
  const guard = requireBettingChannel({ guildId, channelId });
  if (!guard.ok) return guard;

  const bet = q.getBetById.get(betId);
  if (!bet || bet.channel_id !== channelId) return { ok: false, msg: 'Bet nicht gefunden in diesem Channel.' };
  if (bet.owner_id !== userId) return { ok: false, msg: 'Nur der Ersteller kann schließen.' };
  if (bet.is_closed) return { ok: false, msg: 'Die Bet ist bereits geschlossen.' };

  q.closeBet.run(bet.id);
  return { ok: true };
}

export function settleBet({ guildId, channelId, userId, betId, winners }) {
  const guard = requireBettingChannel({ guildId, channelId });
  if (!guard.ok) return guard;

  const bet = q.getBetById.get(betId);
  if (!bet || bet.channel_id !== channelId) return { ok: false, msg: 'Bet nicht gefunden in diesem Channel.' };
  if (bet.owner_id !== userId) return { ok: false, msg: 'Nur der Ersteller kann auswerten.' };
  if (!bet.is_closed) return { ok: false, msg: 'Bitte zuerst schließen.' };

  const { c: entriesCount } = q.countEntries.get(bet.id);
  const pot = entriesCount * bet.amount;

  const winnerNorms = (winners || []).map(w => norm(w)).filter(Boolean);
  if (winnerNorms.length === 0) return { ok: false, msg: 'Gib mindestens ein gültiges Gewinner-Outcome an.' };

  const placeholders = winnerNorms.map(() => '?').join(',');
  const rows = q.winnersByNorm(placeholders).all(bet.id, ...winnerNorms);
  const winnerUserIds = rows.map(r => r.user_id);

  let payoutPerWinner = 0;
  if (winnerUserIds.length > 0) {
    payoutPerWinner = Math.floor(pot / winnerUserIds.length);
    const tx = db.transaction(() => {
      for (const uid of winnerUserIds) {
        const u = getOrInitUser(uid);
        q.setBalance.run(u.balance + payoutPerWinner, uid);
      }
    });
    tx();
  }

  return {
    ok: true,
    result: { pot, winnersCount: winnerUserIds.length, payoutPerWinner, winnerUserIds },
  };
}

export function claimDaily({ userId, nowMs = Date.now() }) {
  const u = getOrInitUser(userId);
  const last = u.last_claim_at ?? 0;
  const delta = nowMs - last;

  if (delta < DAILY_MS) {
    const remainingMs = DAILY_MS - delta;
    const hrs = Math.ceil(remainingMs / (60 * 60 * 1000));
    return { ok: false, msg: `Daily bereits abgeholt. Versuche es wieder in ~${hrs}h.` };
  }

  const newBal = u.balance + DAILY_REWARD;
  const tx = db.transaction(() => {
    q.setBalance.run(newBal, userId);
    q.setLastClaim.run(nowMs, userId);
  });
  tx();

  return { ok: true, reward: DAILY_REWARD, balance: newBal };
}

export function getBalance({ userId }) {
  const u = getOrInitUser(userId);
  return u.balance;
}

export function getLeaderboard(limit = 10) {
  return q.topBalances.all(limit).map(r => ({ userId: r.user_id, bal: r.balance }));
}

// Snapshots / Listings
export function getBetSnapshot({ betId }) {
  const bet = q.getBetById.get(betId);
  if (!bet) return null;
  const entries = q.listEntries.all(bet.id).map(r => ({ userId: r.user_id, choice: r.choice }));
  return {
    id: bet.id,
    title: bet.title,
    amount: bet.amount,
    ownerId: bet.owner_id,
    isClosed: !!bet.is_closed,
    createdAt: bet.created_at,
    channelId: bet.channel_id,
    entriesCount: entries.length,
    entries,
  };
}

export function listOpenBets({ guildId, channelId }) {
  const guard = requireBettingChannel({ guildId, channelId });
  if (!guard.ok) return { ok: false, msg: guard.msg, bets: [] };

  const rows = q.listOpenBetsByChannel.all(channelId);
  return {
    ok: true,
    bets: rows.map(r => ({
      id: r.id,
      title: r.title,
      amount: r.amount,
      ownerId: r.owner_id,
      createdAt: r.created_at,
    })),
  };
}
