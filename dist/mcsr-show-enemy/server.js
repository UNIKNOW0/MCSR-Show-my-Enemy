const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const CONFIG_PATH = path.join(__dirname, 'config.json');
const API_BASE = 'https://api.mcsrranked.com';
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Skin proxy (bypass CORS) ---
app.get('/api/skin/:uuid', async (req, res) => {
  const uuid = req.params.uuid;
  // Try mc-heads first, then crafatar as fallback
  const urls = [
    `https://mc-heads.net/skin/${uuid}`,
    `https://crafatar.com/skins/${uuid}`,
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600');
        const buf = Buffer.from(await resp.arrayBuffer());
        return res.send(buf);
      }
    } catch {}
  }
  res.status(502).end();
});

// --- Config ---

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json(config || { username: '', uuid: '' });
});

app.post('/api/config', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    const resp = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`);
    const data = await resp.json();
    if (data.status !== 'success') {
      return res.status(404).json({ error: 'Player not found' });
    }
    const config = {
      username: data.data.nickname,
      uuid: data.data.uuid,
      pollInterval: 5000,
      displayDuration: 10000,
    };
    saveConfig(config);
    startPolling();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve player: ' + err.message });
  }
});

// --- Customization ---

const CUSTOM_PATH = path.join(__dirname, 'customization.json');

const DEFAULT_CUSTOM = {
  font: 'Inter',
  fontSizeNick: 24,
  fontSizeMMR: 28,
  fontSizeStats: 24,
  showNickname: true,
  showMMR: true,
  showBadges: true,
  showChart: true,
  showStats: true,
  showHead: true,
  animationDuration: 500,
  animationDirection: 'top',
  rankColors: {
    coal: { color: '#333333', glow: '#666666' },
    iron: { color: '#AAAAAA', glow: '#DDDDDD' },
    gold: { color: '#FFAA00', glow: '#FFCC44' },
    emerald: { color: '#00AA00', glow: '#44DD44' },
    diamond: { color: '#55FFFF', glow: '#99FFFF' },
    netherite: { color: '#443333', glow: '#776655' },
  },
};

function loadCustom() {
  try {
    const data = JSON.parse(fs.readFileSync(CUSTOM_PATH, 'utf-8'));
    return { ...DEFAULT_CUSTOM, ...data };
  } catch {
    return { ...DEFAULT_CUSTOM };
  }
}

function saveCustom(custom) {
  fs.writeFileSync(CUSTOM_PATH, JSON.stringify(custom, null, 2));
}

app.get('/api/customization', (req, res) => {
  res.json(loadCustom());
});

app.post('/api/customization', (req, res) => {
  const current = loadCustom();
  const updated = { ...current, ...req.body };
  saveCustom(updated);
  // Notify overlay of customization change
  broadcast({ type: 'CUSTOMIZATION_UPDATE', customization: updated });
  res.json(updated);
});

app.get('/api/fonts', (req, res) => {
  const fontsDir = path.join(__dirname, 'public', 'fonts');
  try {
    const files = fs.readdirSync(fontsDir).filter(f => f.endsWith('.ttf'));
    const fonts = files.map(f => ({
      name: f.replace('.ttf', '').replace(/-Regular/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
      file: f,
    }));
    res.json(fonts);
  } catch {
    res.json([]);
  }
});

// --- Rank helpers ---

const RANKS = [
  { name: 'coal',      min: 0,    color: '#333333', glow: '#666666' },
  { name: 'iron',      min: 600,  color: '#AAAAAA', glow: '#DDDDDD' },
  { name: 'gold',      min: 900,  color: '#FFAA00', glow: '#FFCC44' },
  { name: 'emerald',   min: 1200, color: '#00AA00', glow: '#44DD44' },
  { name: 'diamond',   min: 1500, color: '#55FFFF', glow: '#99FFFF' },
  { name: 'netherite', min: 2000, color: '#443333', glow: '#776655' },
];

function getRankInfo(elo) {
  if (elo == null) return { name: 'unranked', color: '#555555', glow: '#777777', iconUrl: '' };
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (elo >= r.min) rank = r;
  }
  return {
    ...rank,
    iconUrl: `https://mcsrrankedtracker.vercel.app/images/ranks/${rank.name}.png`,
  };
}

// --- Achievement helpers ---

// API ID → wiki badge filename base
const ACHIEVEMENT_MAP = {
  playedMatches: 'match_master',
  playtime: 'practice_makes_perfect',
  wins: 'w_collector',
  bestTime: 'break_the_barrier',
  highestWinStreak: 'consistent_wins',
  ironHoe: 'farming_time',
  overtake: 'valuable_artifact',
  ironPickless: 'it_isnt_iron_pick',
  highLevel: 'too_many_levels',
  netherite: 'smithing_time',
  forfeitRate: 'never_give_up',
  limitedDiet: 'a_limited_diet',
  classic: 'classic',
  gigachad: 'gigachad',
  wrongCategory: 'wrong_category',
  oneShot: 'you_only_get_one_shot',
};

function extractBadges(userData) {
  const badges = [];
  const display = userData?.achievements?.display;
  if (!display || !Array.isArray(display)) return badges;

  for (const ach of display) {
    const baseName = ACHIEVEMENT_MAP[ach.id] || ach.id;
    const level = ach.level || 1;
    // Try level-specific image first, fallback to base
    const hasLevels = ['match_master','practice_makes_perfect','w_collector',
      'break_the_barrier','consistent_wins','never_give_up','too_many_levels'].includes(baseName);
    const filename = hasLevels ? `${baseName}_level_${level}.png` : `${baseName}.png`;

    badges.push({
      id: ach.id,
      name: baseName.replace(/_/g, ' '),
      level,
      iconUrl: `/badges/${filename}`,
    });
  }
  return badges;
}

// --- Stats helpers ---

function formatTime(ms) {
  if (!ms) return null;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function extractStats(userData, uuid) {
  const s = userData?.statistics?.season;
  if (!s) return { winrate: null, average: null, pb: null };

  const played = s.playedMatches?.ranked || 0;
  const wins = s.wins?.ranked || 0;
  const winrate = played > 0 ? Math.round((wins / played) * 100) : null;

  const completions = s.completions?.ranked || 0;
  const totalTime = s.completionTime?.ranked || 0;
  const average = completions > 0 ? formatTime(Math.floor(totalTime / completions)) : null;

  const pb = formatTime(s.bestTime?.ranked);

  return { winrate, average, pb };
}

function extractMatchHistory(matchesResp, playerUuid) {
  const matchHistory = [];
  if (matchesResp.status === 'success' && matchesResp.data) {
    const matches = Array.isArray(matchesResp.data) ? matchesResp.data : (matchesResp.data.matches || matchesResp.data);
    const cleanUuid = playerUuid.replace(/-/g, '');
    for (const m of matches) {
      if (!m.changes) continue;
      const change = m.changes.find(c => c.uuid?.replace(/-/g, '') === cleanUuid);
      if (change) {
        const won = m.result?.uuid?.replace(/-/g, '') === cleanUuid;
        matchHistory.push({ eloRate: change.eloRate, change: change.change, won });
      }
    }
    matchHistory.reverse();
  }
  return matchHistory;
}

// --- Polling ---

let pollTimer = null;
let currentMatchId = null;

async function fetchJSON(url) {
  const resp = await fetch(url);
  return resp.json();
}

async function pollForMatch() {
  const config = loadConfig();
  if (!config || !config.uuid) return;

  try {
    const liveData = await fetchJSON(`${API_BASE}/live`);
    if (liveData.status !== 'success') return;

    const userUuid = config.uuid.replace(/-/g, '');
    let foundMatch = null;
    let opponent = null;

    for (const match of liveData.data.liveMatches || []) {
      const players = match.players || [];
      const me = players.find(p => p.uuid.replace(/-/g, '') === userUuid);
      if (me) {
        opponent = players.find(p => p.uuid.replace(/-/g, '') !== userUuid);
        foundMatch = match;
        break;
      }
    }

    if (foundMatch && opponent) {
      // Use only opponent UUID as match ID — show once per opponent per match
      const matchId = opponent.uuid;
      if (matchId === currentMatchId) return; // already shown
      currentMatchId = matchId;

      // Fetch opponent details in parallel
      const [userResp, matchesResp] = await Promise.all([
        fetchJSON(`${API_BASE}/users/${opponent.uuid}`),
        fetchJSON(`${API_BASE}/users/${opponent.uuid}/matches?type=2&count=20&excludedecay=true`),
      ]);

      const opponentData = userResp.status === 'success' ? userResp.data : null;
      const elo = opponentData?.eloRate ?? opponent.eloRate;
      const rankInfo = getRankInfo(elo);
      const stats = extractStats(opponentData, opponent.uuid);
      const badges = extractBadges(opponentData);
      const matchHistory = extractMatchHistory(matchesResp, opponent.uuid);

      broadcast({
        type: 'MATCH_FOUND',
        opponent: {
          uuid: opponent.uuid,
          nickname: opponentData?.nickname ?? opponent.nickname,
          eloRate: elo,
          eloRank: opponentData?.eloRank ?? opponent.eloRank,
        },
        rankInfo,
        stats,
        badges,
        matchHistory,
        displayDuration: config.displayDuration || 10000,
        customization: loadCustom(),
      });

      console.log(`Match found! Opponent: ${opponent.nickname} (${elo} MMR, ${rankInfo.name})`);
    } else {
      if (currentMatchId) {
        currentMatchId = null;
        broadcast({ type: 'MATCH_ENDED' });
      }
    }
  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

function startPolling() {
  const config = loadConfig();
  if (!config || !config.uuid) return;
  if (pollTimer) clearInterval(pollTimer);
  const interval = config.pollInterval || 5000;
  pollTimer = setInterval(pollForMatch, interval);
  pollForMatch(); // immediate first check
  console.log(`Polling started for ${config.username} (every ${interval / 1000}s)`);
}

// --- WebSocket ---

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on('connection', (ws) => {
  console.log('Overlay connected');
  ws.on('close', () => console.log('Overlay disconnected'));
});

// --- Test endpoint ---

app.post('/api/test', async (req, res) => {
  const config = loadConfig();
  if (!config || !config.uuid) {
    return res.status(400).json({ error: 'Сначала сохрани свой ник!' });
  }
  const testUuid = config.uuid;
  try {
    const [userResp, matchesResp] = await Promise.all([
      fetchJSON(`${API_BASE}/users/${testUuid}`),
      fetchJSON(`${API_BASE}/users/${testUuid}/matches?type=2&count=20&excludedecay=true`),
    ]);

    const opponentData = userResp.status === 'success' ? userResp.data : null;
    const elo = opponentData?.eloRate ?? 1500;
    const rankInfo = getRankInfo(elo);
    const stats = extractStats(opponentData, testUuid);
    const badges = extractBadges(opponentData);
    const matchHistory = extractMatchHistory(matchesResp, testUuid);

    broadcast({
      type: 'MATCH_FOUND',
      opponent: {
        uuid: testUuid,
        nickname: opponentData?.nickname ?? 'TestPlayer',
        eloRate: elo,
        eloRank: opponentData?.eloRank ?? 100,
      },
      rankInfo,
      stats,
      badges,
      matchHistory,
      displayDuration: 10000,
      customization: loadCustom(),
    });

    res.json({ ok: true, nickname: opponentData?.nickname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start ---

server.listen(PORT, () => {
  console.log(`MCSR Show Enemy running at http://localhost:${PORT}`);
  console.log(`Overlay: http://localhost:${PORT}/`);
  console.log(`Setup:   http://localhost:${PORT}/setup.html`);
  const config = loadConfig();
  if (config?.uuid) startPolling();
});
