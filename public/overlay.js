const container = document.getElementById('overlay-container');
let currentCard = null;
let hideTimeout = null;

const API_BASE = 'https://api.mcsrranked.com';

// --- Parse URL params ---
const params = new URLSearchParams(location.search);
const isPreview = params.has('preview');
const previewRank = params.get('previewRank');

const config = {
  player: params.get('player') || localStorage.getItem('mcsr_player') || '',
  pollInterval: parseInt(params.get('pollInterval')) || 5000,
  displayDuration: parseInt(params.get('displayDuration')) || 10000,
};

const customization = {
  font: params.get('font') || 'Inter',
  fontSizeNick: parseInt(params.get('fontSizeNick')) || 36,
  fontSizeMMR: parseInt(params.get('fontSizeMMR')) || 28,
  fontSizeStats: parseInt(params.get('fontSizeStats')) || 28,
  showNickname: params.get('showNickname') !== 'false',
  showMMR: params.get('showMMR') !== 'false',
  showBadges: params.get('showBadges') === 'true',
  showChart: params.get('showChart') !== 'false',
  showStats: params.get('showStats') !== 'false',
  showHead: params.get('showHead') !== 'false',
  showWinrate: params.get('showWinrate') !== 'false',
  showAverage: params.get('showAverage') !== 'false',
  showPB: params.get('showPB') !== 'false',
  showForfeit: params.get('showForfeit') !== 'false',
  showRank: params.get('showRank') !== 'false',
  fontSizeRank: parseInt(params.get('fontSizeRank')) || 20,
  animationDuration: parseInt(params.get('animationDuration')) || 727,
  animationDirection: params.get('animation') || 'top',
  badgeSize: parseInt(params.get('badgeSize')) || 88,
  headSpeed: parseInt(params.get('headSpeed')) || 4500,
  rankIconSize: parseInt(params.get('rankIconSize')) || 48,
};

let animDirection = customization.animationDirection;
let animDuration = customization.animationDuration;

// --- Rank helpers ---
const RANKS = [
  { name: 'coal',      min: 0,    color: '#333333', glow: '#666666' },
  { name: 'iron',      min: 600,  color: '#AAAAAA', glow: '#DDDDDD' },
  { name: 'gold',      min: 900,  color: '#FFAA00', glow: '#FFCC44' },
  { name: 'emerald',   min: 1200, color: '#00AA00', glow: '#44DD44' },
  { name: 'diamond',   min: 1500, color: '#55FFFF', glow: '#99FFFF' },
  { name: 'netherite', min: 2000, color: '#ff2222', glow: '#ff6644' },
];

// Apply custom rank colors from URL: colors=coal:333333:666666,iron:aaaaaa:dddddd
const colorsParam = params.get('colors');
if (colorsParam) {
  for (const entry of colorsParam.split(',')) {
    const [name, color, glow] = entry.split(':');
    const rank = RANKS.find(r => r.name === name);
    if (rank && color && glow) {
      rank.color = '#' + color;
      rank.glow = '#' + glow;
    }
  }
}

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
  // Playoffs
  playoffs1st: 'playoffs_1st',
  playoffs2nd: 'playoffs_2nd',
  playoffs3rd: 'playoffs_3rd',
  playoffsParticipant: 'playoffs_participant',
  // Season placement
  seasonPlacement1: 'season_placement_top_1',
  seasonPlacement5: 'season_placement_top_5',
  seasonPlacement10: 'season_placement_top_10',
  seasonPlacement50: 'season_placement_top_50',
  seasonPlacement100: 'season_placement_top_100',
  seasonPlacement500: 'season_placement_top_500',
  seasonPlacement1000: 'season_placement_top_1000',
  // Weekly race
  weeklyRace1: 'weekly_race_top_1',
  weeklyRace5: 'weekly_race_top_5',
  weeklyRace10: 'weekly_race_top_10',
  weeklyRace15: 'weekly_race_top_15',
};

// Achievements that have leveled file variants (level_1, level_2, ...)
const LEVELED_ACHIEVEMENTS = new Set([
  'match_master', 'practice_makes_perfect', 'w_collector',
  'break_the_barrier', 'consistent_wins',
]);

function extractBadges(userData) {
  const badges = [];
  const display = userData?.achievements?.display;
  if (!display || !Array.isArray(display)) return badges;

  for (const ach of display) {
    const baseName = ACHIEVEMENT_MAP[ach.id] || ach.id;
    const level = ach.level || 1;
    const filename = LEVELED_ACHIEVEMENTS.has(baseName)
      ? `${baseName}_level_${level}.png`
      : `${baseName}.png`;

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

function extractStats(userData) {
  const s = userData?.statistics?.season;
  if (!s) return { winrate: null, average: null, pb: null, forfeit: null, eloRank: null };

  const played = s.playedMatches?.ranked || 0;
  const wins = s.wins?.ranked || 0;
  const winrate = played > 0 ? Math.round((wins / played) * 100) : null;

  const completions = s.completions?.ranked || 0;
  const totalTime = s.completionTime?.ranked || 0;
  const average = completions > 0 ? formatTime(Math.floor(totalTime / completions)) : null;

  const pb = formatTime(s.bestTime?.ranked);

  const forfeits = s.forfeits?.ranked || 0;
  const forfeit = played > 0 ? Math.round((forfeits / played) * 100) : null;

  const eloRank = userData?.eloRank ?? null;

  return { winrate, average, pb, forfeit, eloRank };
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
let playerUuid = null;
let currentMatchId = null;
let pollTimer = null;

async function fetchJSON(url) {
  const resp = await fetch(url);
  return resp.json();
}

async function pollForMatch() {
  if (!playerUuid) return;

  try {
    const liveData = await fetchJSON(`${API_BASE}/live`);
    if (liveData.status !== 'success') return;

    const userUuid = playerUuid.replace(/-/g, '');
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
      const matchId = opponent.uuid;
      if (matchId === currentMatchId) return;
      currentMatchId = matchId;

      const [userResp, matchesResp] = await Promise.all([
        fetchJSON(`${API_BASE}/users/${opponent.uuid}`),
        fetchJSON(`${API_BASE}/users/${opponent.uuid}/matches?type=2&count=20&excludedecay=true`),
      ]);

      const opponentData = userResp.status === 'success' ? userResp.data : null;
      const elo = opponentData?.eloRate ?? opponent.eloRate;
      const rankInfo = getRankInfo(elo);
      const stats = extractStats(opponentData);
      const badges = extractBadges(opponentData);
      const matchHistory = extractMatchHistory(matchesResp, opponent.uuid);

      showCard({
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
        displayDuration: config.displayDuration,
        customization,
      });

      console.log(`Match found! Opponent: ${opponent.nickname} (${elo} MMR, ${rankInfo.name})`);
    } else {
      if (currentMatchId) {
        currentMatchId = null;
        removeCard();
      }
    }
  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollForMatch, config.pollInterval);
  pollForMatch();
  console.log(`Polling started for ${config.player} (every ${config.pollInterval / 1000}s)`);
}

// --- Test / Preview ---
async function runTest() {
  if (!playerUuid) return;
  try {
    const [userResp, matchesResp] = await Promise.all([
      fetchJSON(`${API_BASE}/users/${playerUuid}`),
      fetchJSON(`${API_BASE}/users/${playerUuid}/matches?type=2&count=20&excludedecay=true`),
    ]);

    const opponentData = userResp.status === 'success' ? userResp.data : null;
    const elo = opponentData?.eloRate ?? 1500;
    let rankInfo = getRankInfo(elo);
    if (previewRank) {
      const forced = RANKS.find(r => r.name === previewRank);
      if (forced) rankInfo = { ...forced, iconUrl: `https://mcsrrankedtracker.vercel.app/images/ranks/${forced.name}.png` };
    }
    const stats = extractStats(opponentData);
    const badges = extractBadges(opponentData);
    const matchHistory = extractMatchHistory(matchesResp, playerUuid);

    showCard({
      opponent: {
        uuid: playerUuid,
        nickname: opponentData?.nickname ?? config.player,
        eloRate: elo,
        eloRank: opponentData?.eloRank ?? 100,
      },
      rankInfo,
      stats,
      badges,
      matchHistory,
      displayDuration: 10000,
      customization,
    });
  } catch (err) {
    console.error('Test error:', err);
  }
}

// --- Apply customization ---
function applyCustomization(c) {
  if (!c) return;
  const root = document.documentElement.style;
  if (c.font) root.setProperty('--card-font', `'${c.font}'`);
  if (c.animationDuration) { animDuration = c.animationDuration; root.setProperty('--anim-duration', c.animationDuration + 'ms'); }
  if (c.animationDirection) animDirection = c.animationDirection;
  if (c.fontSizeNick) root.setProperty('--font-size-nick', c.fontSizeNick + 'px');
  if (c.fontSizeMMR) root.setProperty('--font-size-mmr', c.fontSizeMMR + 'px');
  if (c.fontSizeStats) root.setProperty('--font-size-stats', c.fontSizeStats + 'px');
  if (c.badgeSize) root.setProperty('--badge-size', c.badgeSize + 'px');
  if (c.rankIconSize) root.setProperty('--rank-icon-size', c.rankIconSize + 'px');
}

// --- Card ---
function showCard(data) {
  removeCard(true);

  const { opponent, rankInfo, stats, matchHistory, displayDuration, customization: c } = data;
  if (c) applyCustomization(c);

  const wrapper = document.createElement('div');
  wrapper.className = 'card-wrapper';
  wrapper.style.setProperty('--rank-color', rankInfo.color);
  wrapper.style.setProperty('--rank-glow', rankInfo.glow);
  wrapper.style.setProperty('--rank-color-alpha', rankInfo.color + '66');

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  // Header: nickname row (nick + world rank)
  // Header: nick+rank left, MMR right
  const header = document.createElement('div');
  header.className = 'card-header';

  const nickSide = document.createElement('div');
  nickSide.className = 'card-nick-side';

  const nickname = document.createElement('span');
  nickname.className = 'card-nickname';
  nickname.textContent = opponent.nickname;

  const rankBlock = document.createElement('span');
  rankBlock.className = 'card-rank-position';
  if (stats?.eloRank != null) {
    rankBlock.textContent = '#' + stats.eloRank;
    rankBlock.style.fontSize = (c?.fontSizeRank || 20) + 'px';
  }
  if (c && c.showRank === false) rankBlock.style.display = 'none';
  if (c && c.showNickname === false) nickname.style.display = 'none';
  nickSide.append(nickname, rankBlock);

  const mmrBlock = document.createElement('div');
  mmrBlock.className = 'card-mmr';
  const mmrTop = document.createElement('div');
  mmrTop.className = 'mmr-top';
  if (rankInfo.iconUrl) {
    const icon = document.createElement('img');
    icon.className = 'rank-icon';
    icon.src = rankInfo.iconUrl;
    mmrTop.appendChild(icon);
  }
  const mmrValue = document.createElement('span');
  mmrValue.textContent = opponent.eloRate ?? '?';
  mmrTop.appendChild(mmrValue);
  mmrBlock.appendChild(mmrTop);
  const mmrLabel = document.createElement('div');
  mmrLabel.className = 'mmr-label';
  mmrLabel.textContent = 'MMR';
  mmrBlock.appendChild(mmrLabel);

  if (c && c.showMMR === false) mmrBlock.style.display = 'none';
  header.append(nickSide, mmrBlock);

  // Middle
  const middle = document.createElement('div');
  middle.className = 'card-middle';

  const headContainer = document.createElement('div');
  headContainer.className = 'card-head-container';

  const badgesBlock = document.createElement('div');
  badgesBlock.className = 'card-badges';
  if (data.badges && data.badges.length > 0) {
    for (const badge of data.badges) {
      const img = document.createElement('img');
      img.className = 'card-badge';
      img.src = badge.iconUrl;
      img.alt = badge.name;
      img.title = badge.name;
      badgesBlock.appendChild(img);
    }
  }

  const statsBlock = document.createElement('div');
  statsBlock.className = 'card-stats';

  const statItems = [
    { value: stats?.pb ?? '—', label: 'pb', key: 'showPB' },
    { value: stats?.winrate != null ? stats.winrate + '%' : '—', label: 'wr', key: 'showWinrate' },
    { value: stats?.average ?? '—', label: 'avg', key: 'showAverage' },
    { value: stats?.forfeit != null ? stats.forfeit + '%' : '—', label: 'ff', key: 'showForfeit' },
  ];

  for (const s of statItems) {
    if (c && c[s.key] === false) continue;
    const row = document.createElement('div');
    row.className = 'card-stat';
    const val = document.createElement('span');
    val.className = 'stat-value';
    val.textContent = s.value;
    const lbl = document.createElement('span');
    lbl.className = 'stat-label';
    lbl.textContent = s.label;
    row.append(val, lbl);
    statsBlock.appendChild(row);
  }

  if (c && c.showHead === false) headContainer.style.display = 'none';
  if (c && c.showStats === false) statsBlock.style.display = 'none';
  middle.append(headContainer, statsBlock);

  // Badges — horizontal row above chart
  if (c && c.showBadges === false) badgesBlock.style.display = 'none';

  // Chart
  const chartContainer = document.createElement('div');
  chartContainer.className = 'card-chart';
  const canvas = document.createElement('canvas');
  chartContainer.appendChild(canvas);

  // Assemble
  inner.append(header, middle, badgesBlock, chartContainer);
  wrapper.appendChild(inner);

  // Hide until all resources loaded
  wrapper.style.visibility = 'hidden';
  container.appendChild(wrapper);
  currentCard = wrapper;

  // Collect promises for all loading resources
  const loadPromises = [];

  // 3D head
  loadPromises.push(initSkinViewer(headContainer, opponent.uuid));

  // Chart
  if (c && c.showChart === false) {
    chartContainer.style.display = 'none';
  } else if (matchHistory && matchHistory.length > 0) {
    renderChart(canvas, matchHistory, rankInfo.color);
  }

  // Wait for all images in the card (rank icon, badges)
  const images = wrapper.querySelectorAll('img');
  for (const img of images) {
    if (!img.complete) {
      loadPromises.push(new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      }));
    }
  }

  // Show card only after everything is loaded
  Promise.all(loadPromises).then(() => {
    if (currentCard !== wrapper) return; // card was removed while loading
    wrapper.style.visibility = 'visible';
    wrapper.style.animation = `slideIn-${animDirection} ${animDuration}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`;

    // Wave animation: children appear one by one after wrapper slides in
    const waveDelay = 80; // ms between each element
    const waveDuration = 350;
    const children = inner.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      if (el.style.display === 'none') continue;
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      el.style.transition = 'none';
    }

    // Start wave after wrapper animation finishes
    setTimeout(() => {
      let idx = 0;
      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        if (el.style.display === 'none') continue;
        const delay = idx * waveDelay;
        setTimeout(() => {
          el.style.transition = `opacity ${waveDuration}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${waveDuration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, delay);
        idx++;
      }
    }, animDuration * 0.6); // start wave slightly before wrapper finishes

    // Auto-hide (skip in preview mode)
    if (!isPreview) {
      hideTimeout = setTimeout(() => removeCard(), displayDuration || 10000);
    }
  });
}

function removeCard(immediate) {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
  if (!currentCard) return;
  if (immediate) { currentCard.remove(); currentCard = null; return; }
  const card = currentCard;
  card.style.animation = `slideOut-${animDirection} ${animDuration}ms cubic-bezier(0.55, 0, 1, 0.45) forwards`;
  card.addEventListener('animationend', () => {
    card.remove();
    if (currentCard === card) currentCard = null;
  });
}

// --- Easing function ---
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// --- 3D Head with skinview3d ---
function initSkinViewer(container, uuid) {
  if (typeof skinview3d === 'undefined') {
    fallbackHead(container, uuid);
    return Promise.resolve();
  }

  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  canvas.style.width = '300px';
  canvas.style.height = '300px';
  canvas.style.marginTop = '-10px';
  canvas.style.marginLeft = '-100px';
  container.appendChild(canvas);

  try {
    const viewer = new skinview3d.SkinViewer({ canvas, width: 300, height: 300 });
    viewer.renderer.setClearColor(0x000000, 0);

    const skinUrl = `/api/skin/${uuid}`;

    return viewer.loadSkin(skinUrl).then(() => {
      viewer.playerObject.skin.body.visible = false;
      viewer.playerObject.skin.leftArm.visible = false;
      viewer.playerObject.skin.rightArm.visible = false;
      viewer.playerObject.skin.leftLeg.visible = false;
      viewer.playerObject.skin.rightLeg.visible = false;
      viewer.autoRotate = false;
      viewer.animation = {
        update(player) {
          const period = customization.headSpeed;
          const t = (performance.now() % period) / period;
          const ping = t < 0.5 ? t * 2 : 2 - t * 2;
          const eased = easeInOutCubic(ping);
          player.rotation.y = (eased * 2 - 1) * 0.7;
        }
      };
    }).catch(() => {
      container.removeChild(canvas);
      fallbackHead(container, uuid);
    });
  } catch (e) {
    container.innerHTML = '';
    fallbackHead(container, uuid);
    return Promise.resolve();
  }
}

function fallbackHead(container, uuid) {
  const img = document.createElement('img');
  img.src = `https://mc-heads.net/head/${uuid}/100`;
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
  container.appendChild(img);
}

// --- Chart ---
function renderChart(canvasEl, history, rankColor) {
  const eloValues = history.map(h => h.eloRate).filter(v => v != null);
  if (eloValues.length === 0) return;

  const chartWidth = 440;
  const chartHeight = 120;
  canvasEl.width = chartWidth;
  canvasEl.height = chartHeight;
  canvasEl.style.width = chartWidth + 'px';
  canvasEl.style.height = chartHeight + 'px';

  const segmentColor = (ctx) => {
    const idx = ctx.p1DataIndex;
    if (idx < history.length) {
      return history[idx].won ? '#4ade80' : '#f87171';
    }
    return rankColor;
  };

  const chartCtx = canvasEl.getContext('2d');
  new Chart(chartCtx, {
    type: 'line',
    data: {
      labels: history.map((_, i) => i + 1),
      datasets: [{
        data: history.map(h => h.eloRate),
        borderColor: rankColor,
        borderWidth: 2.5,
        segment: {
          borderColor: (ctx) => segmentColor(ctx),
        },
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
      }],
    },
    options: {
      responsive: false,
      maintainAspectRatio: true,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: { display: false },
        y: {
          display: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          border: { display: false },
          ticks: {
            color: 'rgba(255,255,255,0.3)',
            font: { size: 11 },
            maxTicksLimit: 3,
          },
        },
      },
      layout: { padding: { left: 0, right: 8, top: 6, bottom: 2 } },
    },
  });
}

// --- Load fonts dynamically from server ---
async function loadFonts() {
  try {
    const resp = await fetch('/api/fonts');
    const fonts = await resp.json();
    await Promise.all(fonts.map(f => {
      const face = new FontFace(f.name, `url('/fonts/${f.file}')`);
      document.fonts.add(face);
      return face.load().catch(() => {});
    }));
  } catch {}
}

// --- Init ---
async function init() {
  if (!config.player) {
    console.error('No player specified. Use ?player=USERNAME');
    return;
  }

  await loadFonts();
  applyCustomization(customization);

  try {
    const resp = await fetch(`${API_BASE}/users/${encodeURIComponent(config.player)}`);
    const data = await resp.json();
    if (data.status === 'success') {
      playerUuid = data.data.uuid;
      console.log(`Resolved ${config.player} -> ${playerUuid}`);

      if (isPreview) {
        runTest();
      } else {
        startPolling();
      }
    } else {
      console.error('Player not found:', config.player);
    }
  } catch (err) {
    console.error('Failed to resolve player:', err);
  }
}

// --- WebSocket: listen for test command from setup page ---
function connectWs() {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'test') runTest();
    } catch {}
  };
  ws.onclose = () => setTimeout(connectWs, 3000);
  ws.onerror = () => ws.close();
}
connectWs();

init();
