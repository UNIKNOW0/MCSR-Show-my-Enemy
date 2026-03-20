const express = require('express');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'public')));

// --- Font list from /public/fonts/ ---
const FONT_NAME_OVERRIDES = {
  '8bitwonderrusbylyajka_nominal': '8bit Wonder',
  'PressStart2P': 'Press Start 2P',
  'DotGothic16': 'DotGothic16',
  'PixelifySans': 'Pixelify Sans',
  'Micro5-Regular': 'Micro5',
  'Keleti-Regular': 'Keleti',
  'Jacquard12': 'Jacquard 12',
};

app.get('/api/fonts', (req, res) => {
  const fontsDir = path.join(__dirname, 'public', 'fonts');
  try {
    const files = fs.readdirSync(fontsDir).filter(f => /\.(ttf|otf|woff2?)$/i.test(f));
    const fonts = files.map(file => {
      const base = file.replace(/\.(ttf|otf|woff2?)$/i, '');
      const name = FONT_NAME_OVERRIDES[base] || base;
      return { name, file };
    });
    res.json(fonts);
  } catch {
    res.json([]);
  }
});

// --- Skin proxy (bypass CORS) ---
app.get('/api/skin/:uuid', async (req, res) => {
  const uuid = req.params.uuid;
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

// --- WebSocket: relay test commands from setup to overlays ---
wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'test') {
        // Broadcast to all other clients
        for (const client of wss.clients) {
          if (client !== ws && client.readyState === 1) {
            client.send(msg.toString());
          }
        }
      }
    } catch {}
  });
  ws.on('close', () => console.log('Client disconnected'));
});

// --- Start ---
server.listen(PORT, () => {
  console.log(`MCSR Show Enemy running at http://localhost:${PORT}`);
  console.log(`Overlay: http://localhost:${PORT}/`);
  console.log(`Setup:   http://localhost:${PORT}/setup.html`);
});
