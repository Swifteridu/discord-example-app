// commands.js
import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

const PING_COMMAND = {
  name: 'ping',
  description: 'Antwortet mit pong 🏓',
  type: 1,
  integration_types: [0, 1],
  contexts: [0],
};

const BET_COMMAND = {
  name: 'bet',
  description: 'Wetten verwalten',
  type: 1,
  integration_types: [0, 1],
  contexts: [0],
  options: [
    {
      type: 1,
      name: 'setchannel',
      description: 'Den einzigen erlaubten Bet-Channel für diesen Server setzen (nur Mods).',
      options: [
        { type: 7, name: 'channel', description: 'Channel auswählen', required: true }, // 7 = CHANNEL
      ],
    },
    {
      type: 1,
      name: 'create',
      description: 'Neue Bet eröffnen (im erlaubten Channel)',
      options: [
        { type: 3, name: 'title', description: 'Titel der Bet', required: true },
        { type: 4, name: 'amount', description: 'Einsatz je Spieler (Coins)', required: true },
      ],
    },
    {
      type: 1,
      name: 'list',
      description: 'Offene Bets im Channel auflisten',
    },
    {
      type: 1,
      name: 'join',
      description: 'Bei einer Bet mitmachen (freier Text)',
      options: [
        { type: 4, name: 'bet_id', description: 'ID der Bet', required: true },
        { type: 3, name: 'choice', description: 'Dein Tipp (freier Text)', required: true },
      ],
    },
    {
      type: 1,
      name: 'status',
      description: 'Status einer Bet anzeigen',
      options: [
        { type: 4, name: 'bet_id', description: 'ID der Bet', required: true },
      ],
    },
    {
      type: 1,
      name: 'close',
      description: 'Bet schließen (nur Ersteller)',
      options: [
        { type: 4, name: 'bet_id', description: 'ID der Bet', required: true },
      ],
    },
    {
      type: 1,
      name: 'settle',
      description: 'Bet auswerten (mehrere Gewinner, kommagetrennt)',
      options: [
        { type: 4, name: 'bet_id', description: 'ID der Bet', required: true },
        { type: 3, name: 'winners', description: 'Gewinner-Outcomes, kommagetrennt', required: true },
      ],
    },
    { type: 1, name: 'balance', description: 'Dein Kontostand' },
    { type: 1, name: 'leaderboard', description: 'Top-Spieler' },
    { type: 1, name: 'claim', description: 'Tägliche Belohnung abholen (+10 Coins alle 24h)' },
  ],
};

InstallGlobalCommands(process.env.APP_ID, [PING_COMMAND, BET_COMMAND]);
