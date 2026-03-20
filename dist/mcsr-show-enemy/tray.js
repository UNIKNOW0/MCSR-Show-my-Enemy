const SysTray = require('systray2').default;
const { exec, execSync } = require('child_process');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3001;
const APP_NAME = 'MCSR Show Enemy';
const EXE_PATH = process.execPath;
const STARTUP_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

// Read icon as base64 (ICO for Windows tray)
const iconPath = path.join(__dirname, 'icon.ico');
const iconBase64 = fs.readFileSync(iconPath).toString('base64');

// Check if autostart is enabled
function isAutoStartEnabled() {
  try {
    const result = execSync(`reg query "${STARTUP_KEY}" /v "${APP_NAME}" 2>nul`, { encoding: 'utf8' });
    return result.includes(APP_NAME);
  } catch {
    return false;
  }
}

function toggleAutoStart() {
  if (isAutoStartEnabled()) {
    execSync(`reg delete "${STARTUP_KEY}" /v "${APP_NAME}" /f 2>nul`);
    return false;
  } else {
    execSync(`reg add "${STARTUP_KEY}" /v "${APP_NAME}" /t REG_SZ /d "\\"${EXE_PATH}\\"" /f`);
    return true;
  }
}

// Start Express server
const serverProcess = fork(path.join(__dirname, 'server.js'), [], {
  env: { ...process.env, PORT: String(PORT) },
  silent: true,
});

serverProcess.stdout.on('data', (d) => process.stdout.write(d));
serverProcess.stderr.on('data', (d) => process.stderr.write(d));

const autoStartEnabled = isAutoStartEnabled();

// Create system tray
const systray = new SysTray({
  menu: {
    icon: iconBase64,
    title: '',
    tooltip: APP_NAME,
    items: [
      {
        title: APP_NAME,
        enabled: false,
      },
      {
        title: 'Select Account',
        tooltip: 'Open setup page',
      },
      {
        title: 'Open Overlay',
        tooltip: 'Open overlay in browser',
      },
      {
        title: `Autostart: ${autoStartEnabled ? 'ON' : 'OFF'}`,
        tooltip: 'Toggle autostart with Windows',
      },
      {
        title: 'Quit',
        tooltip: 'Close application',
      },
    ],
  },
  debug: false,
  copyDir: true,
});

systray.onClick((action) => {
  if (action.item.title === 'Select Account') {
    openUrl(`http://localhost:${PORT}/setup.html`);
  } else if (action.item.title === 'Open Overlay') {
    openUrl(`http://localhost:${PORT}`);
  } else if (action.item.title.startsWith('Autostart:')) {
    const enabled = toggleAutoStart();
    action.item.title = `Autostart: ${enabled ? 'ON' : 'OFF'}`;
    systray.sendAction({
      type: 'update-item',
      item: action.item,
      seq_id: action.seq_id,
    });
  } else if (action.item.title === 'Quit') {
    serverProcess.kill();
    systray.kill(false);
    process.exit(0);
  }
});

function openUrl(url) {
  exec(`start "" "${url}"`);
}

// Cleanup on exit
process.on('exit', () => serverProcess.kill());
process.on('SIGINT', () => { serverProcess.kill(); process.exit(); });
process.on('SIGTERM', () => { serverProcess.kill(); process.exit(); });

console.log(`${APP_NAME} tray started`);
