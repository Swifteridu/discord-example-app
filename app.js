// app.js
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import 'dotenv/config';

import {
  setBettingChannel,
  requireBettingChannel,
  createBet,
  joinBet,
  closeBet,
  settleBet,
  claimDaily,
  getBalance,
  getLeaderboard,
  getBetSnapshot,
  listOpenBets,
} from './bets.js';

const app = express();

function msg(content) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content },
  };
}

// Discord Permission Bits (BigInt)
const PERM_ADMIN = 0x8n;          // Administrator
const PERM_MANAGE_GUILD = 0x20n;  // Manage Server

function hasModPerm(member) {
  try {
    const bitstr = member?.permissions;
    if (!bitstr) return false;
    const bits = BigInt(bitstr);
    return (bits & PERM_ADMIN) === PERM_ADMIN || (bits & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;
  } catch {
    return false;
  }
}

app.post(
  '/interactions',
  verifyKeyMiddleware(process.env.PUBLIC_KEY),
  async (req, res) => {
    const { type, data } = req;

    // PING
    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }

    if (type === InteractionType.APPLICATION_COMMAND) {
      const name = data.name;
      const body = req.body;
      const guildId = body.guild_id;
      const channelId = body.channel?.id || body.channel_id;
      const member = body.member;
      const userId = member?.user?.id || body.user?.id;

      // /ping
      if (name === 'ping') {
        return res.send(msg('pong 🏓'));
      }

      // /bet ...
      if (name === 'bet') {
        const sub = data.options?.[0];
        const subName = sub?.name;
        const opts = Object.fromEntries((sub?.options || []).map(o => [o.name, o.value]));

        // setchannel (nur Mods/Admins)
        if (subName === 'setchannel') {
          if (!hasModPerm(member)) {
            return res.send(msg('❌ Du brauchst **Administrator** oder **Manage Server**, um den Bet-Channel zu setzen.'));
          }
          const targetChannelId = opts.channel; // Discord liefert Snowflake als String
          const r = setBettingChannel({ guildId, channelId: targetChannelId });
          if (!r.ok) return res.send(msg(`❌ ${r.msg}`));
          return res.send(msg(`✅ Bet-Channel gesetzt auf <#${targetChannelId}>. Nur dort sind Bets erlaubt.`));
        }

        // balance/leaderboard/claim sind serverweit OK, kein Channel-Lock nötig
        if (subName === 'balance') {
          const bal = getBalance({ userId });
          return res.send(msg(`💰 Dein Kontostand: **${bal}** Coins`));
        }
        if (subName === 'leaderboard') {
          const top = getLeaderboard(10)
            .map((e, i) => `${i + 1}. <@${e.userId}> — ${e.bal} Coins`)
            .join('\n');
          return res.send(msg(`🏆 **Leaderboard**\n${top || 'Noch keine Einträge.'}`));
        }
        if (subName === 'claim') {
          const r = claimDaily({ userId });
          if (!r.ok) return res.send(msg(`⏳ ${r.msg}`));
          return res.send(msg(`✅ Daily abgeholt: **+${r.reward}** Coins\nNeuer Kontostand: **${r.balance}**`));
        }

        // Ab hier: Channel muss der konfigurierte sein
        const guard = requireBettingChannel({ guildId, channelId });
        if (!guard.ok) return res.send(msg(`🚫 ${guard.msg}`));

        if (subName === 'create') {
          const r = createBet({ guildId, channelId, ownerId: userId, title: opts.title, amount: opts.amount });
          if (!r.ok) return res.send(msg(`❌ ${r.msg}`));
          return res.send(msg(`🎲 **Bet eröffnet (#${r.betId}):** ${opts.title}\nEinsatz: **${opts.amount}** Coins\nMit **/bet join bet_id:${r.betId} choice:<Text>** teilnehmen.`));
        }

        if (subName === 'list') {
          const r = listOpenBets({ guildId, channelId });
          if (!r.ok) return res.send(msg(`❌ ${r.msg}`));
          if (r.bets.length === 0) return res.send(msg('ℹ️ Keine offenen Bets in diesem Channel.'));
          const lines = r.bets.slice(0, 20).map(b => `• #${b.id} — **${b.title}** (Einsatz ${b.amount}) — Ersteller: <@${b.ownerId}>`);
          const more = r.bets.length > 20 ? `\n… und ${r.bets.length - 20} weitere` : '';
          return res.send(msg(`📜 **Offene Bets:**\n${lines.join('\n')}${more}`));
        }

        if (subName === 'join') {
          const r = joinBet({ guildId, channelId, userId, betId: opts.bet_id, choice: opts.choice });
          if (!r.ok) return res.send(msg(`❌ ${r.msg}`));
          return res.send(msg(`✅ Einsatz platziert für Bet **#${opts.bet_id}**. Dein Tipp: “${opts.choice}”\nAktueller Pot: **${r.pot}**`));
        }

        if (subName === 'status') {
          const snap = getBetSnapshot({ betId: opts.bet_id });
          if (!snap || snap.channelId !== channelId) return res.send(msg('❓ Bet nicht gefunden in diesem Channel.'));
          const lines = snap.entries.slice(0, 25).map(e => `• <@${e.userId}>: ${e.choice}`);
          const more = snap.entries.length > 25 ? `\n… und ${snap.entries.length - 25} weitere` : '';
          return res.send(msg(
            `📊 **Bet #${snap.id}: ${snap.title}**\n` +
            `Einsatz: **${snap.amount}** | Status: ${snap.isClosed ? '🔒 geschlossen' : '🟢 offen'}\n` +
            `Ersteller: <@${snap.ownerId}> | Entries: **${snap.entriesCount}**\n` +
            `${lines.join('\n') || '_Noch keine Tipps._'}${more}`
          ));
        }

        if (subName === 'close') {
          const r = closeBet({ guildId, channelId, userId, betId: opts.bet_id });
          if (!r.ok) return res.send(msg(`❌ ${r.msg}`));
          const snap = getBetSnapshot({ betId: opts.bet_id });
          return res.send(msg(`🔒 Bet **#${opts.bet_id}** geschlossen: **${snap?.title ?? '—'}**`));
        }

        if (subName === 'settle') {
          const winners = String(opts.winners).split(',').map(s => s.trim()).filter(Boolean);
          const r = settleBet({ guildId, channelId, userId, betId: opts.bet_id, winners });
          if (!r.ok) return res.send(msg(`❌ ${r.msg}`));

          const winnersMention =
            r.result.winnerUserIds.length
              ? r.result.winnerUserIds.map(uid => `<@${uid}>`).join(', ')
              : 'Keine Gewinner';

          return res.send(msg(
            `🏁 **Auswertung Bet #${opts.bet_id}**\n` +
            `Pot: **${r.result.pot}**\n` +
            `Gewinner: ${winnersMention}\n` +
            `Auszahlung je: **${r.result.payoutPerWinner}**`
          ));
        }

        return res.status(400).json({ error: 'unknown /bet subcommand' });
      }

      return res.status(400).json({ error: 'unknown command' });
    }

    return res.status(400).json({ error: 'unknown interaction type' });
  }
);

app.get('/', (_, res) => res.send('Bot is running ✅'));

app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server läuft auf Port ${process.env.PORT || 3000}`);
});
