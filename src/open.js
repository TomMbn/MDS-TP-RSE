import { spawn } from 'node:child_process';

/** Ouvre un fichier avec l'application par défaut du système (macOS/Linux/Windows). */
export function openInBrowser(filePath) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const args = platform === 'win32' ? ['', filePath] : [filePath];

  const child = spawn(command, args, { shell: platform === 'win32', stdio: 'ignore', detached: true });
  child.on('error', () => {
    console.warn(`Impossible d'ouvrir automatiquement ${filePath} (commande "${command}" indisponible). Ouvre-le manuellement.`);
  });
  child.unref();
}
