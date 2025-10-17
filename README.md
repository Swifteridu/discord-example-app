# 🎲 Discord Gambling Bets Bot

Ein moderner Discord-Bot zum Erstellen und Verwalten von Community-Wetten mit persistenter SQLite-Datenbank, Coins, Leaderboard und täglichem Claim-System.  
Perfekt für Spaß und Unterhaltung auf deinem Server! 😎

---

## ⚙️ Features

✅ **Mehrere Bets gleichzeitig pro Channel**  
✅ **Nur ein erlaubter Bet-Channel pro Server (durch Mods festgelegt)**  
✅ **Freie Textantworten als Tipps (keine vordefinierten Optionen)**  
✅ **SQLite-Persistenz** – alle Daten bleiben auch nach Neustart erhalten  
✅ **Startguthaben & tägliche Coins (+10 alle 24h)**  
✅ **Leaderboard**  
✅ **Rollen- und Adminschutz für wichtige Befehle**  
✅ **Einfache Installation mit npm & Termux-kompatibel**

---

## 🧩 Voraussetzungen

- Node.js **18+**  
- Eine erstellte Discord Application + Bot Token  
- Zugriff auf deinen Server (mit „applications.commands“ und „bot“-Scope)

---

## 🚀 Setup (einmalig)

```bash
# 1️⃣ Klonen
git clone https://github.com/<deinName>/discord-bets-bot.git
cd discord-bets-bot

# 2️⃣ Abhängigkeiten installieren
npm install

# 3️⃣ .env-Datei anlegen (Umgebungsvariablen)
cp .env.example .env
nano .env  # oder über Texteditor anpassen

# 4️⃣ Slash-Commands registrieren
npm run register

# 5️⃣ Bot starten
npm run start
