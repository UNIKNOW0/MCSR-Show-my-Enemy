const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST = path.join(__dirname, 'dist');
const APP_DIR = path.join(DIST, 'mcsr-show-enemy');
const NODE_VERSION = '20.20.0';
const NODE_ZIP = `node-v${NODE_VERSION}-win-x64.zip`;
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP}`;
const NODE_DIR = `node-v${NODE_VERSION}-win-x64`;

console.log('=== MCSR Show Enemy Build ===\n');

// Clean
if (fs.existsSync(APP_DIR)) {
  fs.rmSync(APP_DIR, { recursive: true });
}
fs.mkdirSync(APP_DIR, { recursive: true });

// Step 1: Download Node.js portable if not cached
const cacheDir = path.join(DIST, '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const cachedZip = path.join(cacheDir, NODE_ZIP);

if (!fs.existsSync(cachedZip)) {
  console.log(`Downloading Node.js v${NODE_VERSION}...`);
  execSync(`curl -L "${NODE_URL}" -o "${cachedZip}"`, { stdio: 'inherit' });
} else {
  console.log('Using cached Node.js...');
}

// Step 2: Extract Node.js (only node.exe needed)
console.log('Extracting node.exe...');
const nodeExeInZip = `${NODE_DIR}/node.exe`;
execSync(`"C:/Program Files/7-Zip/7z.exe" e "${cachedZip}" "${nodeExeInZip}" -o"${APP_DIR}" -y 2>nul || tar -xf "${cachedZip}" --strip-components=1 -C "${APP_DIR}" "${nodeExeInZip}" 2>nul || powershell -command "Expand-Archive -Path '${cachedZip}' -DestinationPath '${DIST}/.tmp' -Force; Copy-Item '${DIST}/.tmp/${NODE_DIR}/node.exe' '${APP_DIR}/node.exe'"`, { stdio: 'inherit' });

// Step 3: Copy project files
console.log('Copying project files...');
const filesToCopy = ['server.js', 'tray.js', 'package.json', 'icon.ico', 'icon.png', 'icon.webp'];
for (const f of filesToCopy) {
  const src = path.join(__dirname, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(APP_DIR, f));
  }
}

// Copy directories
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(path.join(__dirname, 'public'), path.join(APP_DIR, 'public'));
copyDir(path.join(__dirname, 'node_modules'), path.join(APP_DIR, 'node_modules'));

// Copy config if exists
for (const cfg of ['config.json', 'customization.json']) {
  const src = path.join(__dirname, cfg);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(APP_DIR, cfg));
  }
}

// Step 4: Create launcher .bat
const batContent = `@echo off
cd /d "%~dp0"
start "" /B node.exe tray.js
`;
fs.writeFileSync(path.join(APP_DIR, 'MCSR Show Enemy.bat'), batContent);

// Step 5: Create launcher .vbs (silent, no console window)
const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "node.exe tray.js", 0, False
`;
fs.writeFileSync(path.join(APP_DIR, 'MCSR Show Enemy.vbs'), vbsContent);

// Step 6: Generate Inno Setup script
const issContent = `[Setup]
AppName=MCSR Show Enemy
AppVersion=1.0.0
DefaultDirName={autopf}\\MCSR Show Enemy
DefaultGroupName=MCSR Show Enemy
OutputDir=.
OutputBaseFilename=MCSR-Show-Enemy-Setup
Compression=lzma2
SolidCompression=yes
SetupIconFile=${APP_DIR}\\icon.ico
UninstallDisplayIcon={app}\\icon.ico

[Files]
Source: "${APP_DIR}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\\MCSR Show Enemy"; Filename: "{app}\\MCSR Show Enemy.vbs"; IconFilename: "{app}\\icon.ico"
Name: "{autodesktop}\\MCSR Show Enemy"; Filename: "{app}\\MCSR Show Enemy.vbs"; IconFilename: "{app}\\icon.ico"

[Run]
Filename: "{app}\\MCSR Show Enemy.vbs"; Description: "Launch MCSR Show Enemy"; Flags: nowait postinstall
`;
fs.writeFileSync(path.join(DIST, 'installer.iss'), issContent);

console.log(`\n=== Build complete ===`);
console.log(`App folder: ${APP_DIR}`);
console.log(`\nTo create installer:`);
console.log(`  1. Install Inno Setup: https://jrsoftware.org/isinfo.php`);
console.log(`  2. Run: "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" dist\\installer.iss`);
console.log(`\nOr just zip the folder: dist/mcsr-show-enemy/`);
