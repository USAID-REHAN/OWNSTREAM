import { hasControlCharacters } from '../games/launch-target';

/**
 * The agent may only touch files inside its workspace folder (Implementation Plan section 12.4).
 * The host checks every path again; this server-side check refuses folders that are obviously
 * unsafe before a task is ever created. Returns an error message, or null when the folder is fine.
 */
export function workspaceFolderError(folder: string): string | null {
  if (folder.length > 240) return 'workspaceFolder must be at most 240 characters';
  if (!/^[A-Za-z]:\\/.test(folder)) return 'workspaceFolder must be a full Windows folder path, such as D:\\Notes';

  const parts = folder.slice(3).split('\\').filter((p, i, all) => !(p === '' && i === all.length - 1));
  if (parts.length === 0 || parts[0] === '') return 'Choose a folder, not the whole drive';
  if (parts.some((p) => p === '' || p === '.' || p === '..' || /[<>:"/|?*]/.test(p) || hasControlCharacters(p))) {
    return 'workspaceFolder must not contain "..", empty parts or characters Windows does not allow';
  }

  const top = parts[0].toLowerCase();
  if (SYSTEM_FOLDERS.has(top)) return `The agent may not work inside ${folder.slice(0, 3)}${parts[0]}`;
  if (parts.some((p) => p.toLowerCase() === 'appdata')) return 'The agent may not work inside AppData';
  return null;
}

const SYSTEM_FOLDERS = new Set(['windows', 'program files', 'program files (x86)', 'programdata', '$recycle.bin', 'system volume information', 'recovery']);
