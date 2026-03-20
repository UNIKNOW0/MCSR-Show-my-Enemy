const container = document.getElementById('overlay-container');
let currentCard = null;
let hideTimeout = null;
let skinViewer = null;

// --- WebSocket ---
function connect() {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'MATCH_FOUND') showCard(data);
    if (data.type === 'MATCH_ENDED') removeCard();
    if (data.type === 'CUSTOMIZATION_UPDATE') applyCustomization(data.customization);
  };
  ws.onclose = () => setTimeout(connect, 3000);
  ws.onerror = () => ws.close();
}
connect();

// Preview mode: always show card, no auto-hide
const isPreview = new URLSearchParams(location.search).has('preview');
if (isPreview) {
  // Trigger test data on load
  setTimeout(() => fetch('/api/test', { method: 'POST' }), 500);
}

// --- Apply customization ---
let animDirection = 'top';
let animDuration = 500;

function applyCustomization(c) {
  if (!c) return;
  const root = document.documentElement.style;
  if (c.font) root.setProperty('--card-font', c.font);
  if (c.animationDuration) { animDuration = c.animationDuration; root.setProperty('--anim-duration', c.animationDuration + 'ms'); }
  if (c.animationDirection) animDirection = c.animationDirection;
  if (c.fontSizeNick) root.setProperty('--font-size-nick', c.fontSizeNick + 'px');
  if (c.fontSizeMMR) root.setProperty('--font-size-mmr', c.fontSizeMMR + 'px');
  if (c.fontSizeStats) root.setProperty('--font-size-stats', c.fontSizeStats + 'px');
}

// --- Card ---
function showCard(data) {
  removeCard(true);

  const { opponent, rankInfo, stats, matchHistory, displayDuration, customization: c } = data;
  if (c) applyCustomization(c);

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'card-wrapper';
  wrapper.style.setProperty('--rank-color', rankInfo.color);
  wrapper.style.setProperty('--rank-glow', rankInfo.glow);
  wrapper.style.setProperty('--rank-color-alpha', rankInfo.color + '66');

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  // --- Header: nickname left, MMR right ---
  const header = document.createElement('div');
  header.className = 'card-header';

  const nickname = document.createElement('div');
  nickname.className = 'card-nickname';
  nickname.textContent = opponent.nickname;

  const mmrBlock = document.createElement('div');
  mmrBlock.className = 'card-mmr';
  if (rankInfo.iconUrl) {
    const icon = document.createElement('img');
    icon.className = 'rank-icon';
    icon.src = rankInfo.iconUrl;
    mmrBlock.appendChild(icon);
  }
  const mmrValue = document.createElement('span');
  mmrValue.textContent = opponent.eloRate ?? '?';
  mmrBlock.appendChild(mmrValue);
  const mmrLabel = document.createElement('span');
  mmrLabel.className = 'mmr-label';
  mmrLabel.textContent = 'MMR';
  mmrBlock.appendChild(mmrLabel);

  if (c && c.showNickname === false) nickname.style.display = 'none';
  if (c && c.showMMR === false) mmrBlock.style.display = 'none';
  header.append(nickname, mmrBlock);

  // --- Middle: 3D head + stats ---
  const middle = document.createElement('div');
  middle.className = 'card-middle';

  const headContainer = document.createElement('div');
  headContainer.className = 'card-head-container';

  // Badges (achievements)
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

  // Stats (compact, right-aligned)
  const statsBlock = document.createElement('div');
  statsBlock.className = 'card-stats';

  const statItems = [
    { value: stats?.winrate != null ? stats.winrate + '%' : '—', label: 'winrate' },
    { value: stats?.average ?? '—', label: 'average' },
    { value: stats?.pb ?? '—', label: 'pb' },
  ];

  for (const s of statItems) {
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
  if (c && c.showBadges === false) badgesBlock.style.display = 'none';
  if (c && c.showStats === false) statsBlock.style.display = 'none';
  middle.append(headContainer, badgesBlock, statsBlock);

  // --- Chart ---
  const chartContainer = document.createElement('div');
  chartContainer.className = 'card-chart';
  const canvas = document.createElement('canvas');
  chartContainer.appendChild(canvas);

  // Assemble
  inner.append(header, middle, chartContainer);
  wrapper.appendChild(inner);
  // Apply direction-based animation
  wrapper.style.animation = `slideIn-${animDirection} ${animDuration}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`;
  container.appendChild(wrapper);
  currentCard = wrapper;

  // 3D head
  initSkinViewer(headContainer, opponent.uuid);

  // Chart
  if (c && c.showChart === false) {
    chartContainer.style.display = 'none';
  } else if (matchHistory && matchHistory.length > 0) {
    renderChart(canvas, matchHistory, rankInfo.color);
  }

  // Auto-hide (skip in preview mode)
  if (!isPreview) {
    hideTimeout = setTimeout(() => removeCard(), displayDuration || 10000);
  }
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

// --- 3D Head with skinview3d ---
function initSkinViewer(container, uuid) {
  if (typeof skinview3d === 'undefined') {
    fallbackHead(container, uuid);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  // Render full body big, then use CSS to show only head area
  canvas.style.width = '300px';
  canvas.style.height = '300px';
  canvas.style.marginTop = '-10px';   // shift up to show head
  canvas.style.marginLeft = '-100px'; // center horizontally
  container.appendChild(canvas);

  try {
    const viewer = new skinview3d.SkinViewer({ canvas, width: 300, height: 300 });
    viewer.renderer.setClearColor(0x000000, 0);

    viewer.loadSkin(`/api/skin/${uuid}`).then(() => {
      viewer.playerObject.skin.body.visible = false;
      viewer.playerObject.skin.leftArm.visible = false;
      viewer.playerObject.skin.rightArm.visible = false;
      viewer.playerObject.skin.leftLeg.visible = false;
      viewer.playerObject.skin.rightLeg.visible = false;

      // Sine wave rotation
      viewer.autoRotate = false;
      viewer.animation = {
        update(player) {
          player.rotation.y = Math.sin(performance.now() / 1000 * 0.7) * 0.6;
        }
      };
    }).catch(() => {
      container.removeChild(canvas);
      fallbackHead(container, uuid);
    });
  } catch (e) {
    container.innerHTML = '';
    fallbackHead(container, uuid);
  }
}

function fallbackHead(container, uuid) {
  const img = document.createElement('img');
  img.src = `https://mc-heads.net/head/${uuid}/100`;
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
  container.appendChild(img);
}

// --- Chart with win/loss bars ---

// Plugin: draw vertical colored bars behind each data point

function renderChart(canvasEl, history, rankColor) {
  const eloValues = history.map(h => h.eloRate).filter(v => v != null);
  if (eloValues.length === 0) return;

  const chartWidth = 440;
  const chartHeight = 120;
  canvasEl.width = chartWidth;
  canvasEl.height = chartHeight;
  canvasEl.style.width = chartWidth + 'px';
  canvasEl.style.height = chartHeight + 'px';

  // Build segment colors: each segment colored by the destination point's win/loss
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
