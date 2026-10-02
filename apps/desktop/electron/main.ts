import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { DEV_CSP, DEV_SERVER_ORIGIN, PROD_CSP } from './csp';
import { IPC_CHANNELS, handlePing, type PingDeps } from './ipc';
import { runSqliteProbe, type ProbeResult } from './smoke';

app.setName('ContextBridge');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.contextbridge.desktop');
}

const devServerUrl = process.env.CONTEXTBRIDGE_DEV_SERVER || undefined;

interface SmokePayload {
  ok: boolean;
  probe?: ProbeResult;
  versions?: { electron?: string; node?: string; chrome?: string };
  error?: string;
}

function runSmokeMode(outPath: string | undefined): void {
  app.whenReady().then(() => {
    let payload: SmokePayload;
    let exitCode: number;
    try {
      const probe = runSqliteProbe(join(app.getPath('userData'), 'smoke', 'probe.db'));
      const ok = probe.fts5Available && probe.fts5QueryWorked;
      payload = {
        ok,
        probe,
        versions: {
          electron: process.versions.electron,
          node: process.versions.node,
          chrome: process.versions.chrome,
        },
      };
      exitCode = ok ? 0 : 1;
    } catch (err) {
      payload = { ok: false, error: err instanceof Error ? err.message : String(err) };
      exitCode = 1;
    }
    if (outPath) {
      writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    }
    console.log(`[contextbridge-smoke] ${JSON.stringify(payload)}`);
    app.exit(exitCode);
  });
}

const smokeFlagIndex = process.argv.indexOf('--smoke-test');
if (smokeFlagIndex !== -1) {
  const outArg = process.argv.find((arg) => arg.startsWith('--smoke-out='));
  runSmokeMode(outArg ? outArg.slice('--smoke-out='.length) : undefined);
} else {
  startApp();
}

function senderIsTrusted(senderUrl: string): boolean {
  if (devServerUrl) {
    return senderUrl.startsWith(DEV_SERVER_ORIGIN);
  }
  return senderUrl.startsWith('file:');
}

let cachedProbe: ProbeResult | null = null;

function getPingDeps(): PingDeps {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    security: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    probe: () => {
      if (!cachedProbe) {
        cachedProbe = runSqliteProbe(join(app.getPath('userData'), 'ping', 'probe.db'));
      }
      return cachedProbe;
    },
  };
}

function applySecurityPolicies(): void {
  const csp = devServerUrl ? DEV_CSP : PROD_CSP;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isOurs =
      details.url.startsWith(DEV_SERVER_ORIGIN) || details.url.startsWith('file:');
    if (!isOurs) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  ipcMain.handle(IPC_CHANNELS.ping, (event, payload: unknown) => {
    const senderUrl = event.senderFrame?.url ?? '';
    if (!senderIsTrusted(senderUrl)) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN_SENDER', message: 'Untrusted sender.' },
      };
    }
    return handlePing(payload, getPingDeps());
  });
}

function hardenWebContents(webContents: Electron.WebContents): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, url) => {
    if (!senderIsTrusted(url)) {
      event.preventDefault();
    }
  });
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#020617',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

function startApp(): void {
  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents);
  });

  void app.whenReady().then(() => {
    applySecurityPolicies();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
