[Setup]
AppName=MCSR Show Enemy
AppVersion=1.0.0
DefaultDirName={autopf}\MCSR Show Enemy
DefaultGroupName=MCSR Show Enemy
OutputDir=.
OutputBaseFilename=MCSR-Show-Enemy-Setup
Compression=lzma2
SolidCompression=yes
SetupIconFile=C:\Users\000-d\Desktop\JShit\mcsrshowenemy\dist\mcsr-show-enemy\icon.ico
UninstallDisplayIcon={app}\icon.ico

[Files]
Source: "C:\Users\000-d\Desktop\JShit\mcsrshowenemy\dist\mcsr-show-enemy\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\MCSR Show Enemy"; Filename: "{app}\MCSR Show Enemy.vbs"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\MCSR Show Enemy"; Filename: "{app}\MCSR Show Enemy.vbs"; IconFilename: "{app}\icon.ico"

[Run]
Filename: "{app}\MCSR Show Enemy.vbs"; Description: "Launch MCSR Show Enemy"; Flags: nowait postinstall
