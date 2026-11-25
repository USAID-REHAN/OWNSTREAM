import type { LaunchType } from '@ownstream/shared';

/**
 * Checks that a launch target matches its launch type (Implementation Plan section 10.7).
 * The host only ever starts targets saved in the user's library, so this keeps the library clean
 * and stops obviously broken or dangerous values from being saved.
 * Returns an error message, or null when the target is valid.
 */
export function launchTargetError(launch: LaunchType, target: string): string | null {
  if (target.length > 500) return 'launchTarget must be at most 500 characters';
  if (hasControlCharacters(target)) return 'launchTarget must be on one line, without control characters';

  switch (launch) {
    case 'steam':
      return /^steam:\/\/rungameid\/\d{1,10}$/.test(target)
        ? null
        : 'A Steam game needs steam://rungameid/APP_ID (the number from its Steam store page)';
    case 'epic':
      return EPIC_LINK.test(target) || isWindowsFile(target, ['.lnk', '.url', '.exe'])
        ? null
        : 'An Epic game needs a com.epicgames.launcher://apps/... link or the path to its shortcut';
    case 'exe':
      return isWindowsFile(target, ['.exe']) ? null : 'An exe game needs a full Windows path ending in .exe, such as C:\\Games\\Mafia\\game.exe';
    case 'command':
      return target.trim().length > 0 ? null : 'A command must not be empty';
  }
}

/** Line breaks, tabs and other invisible control characters. */
export function hasControlCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

const EPIC_LINK = /^com\.epicgames\.launcher:\/\/apps\/[A-Za-z0-9%:._-]+(\?action=launch(&silent=true)?)?$/;

/** A full Windows path such as C:\Games\Mafia\game.exe, with no ".." parts. */
function isWindowsFile(target: string, extensions: string[]): boolean {
  if (!/^[A-Za-z]:\\/.test(target)) return false;
  const parts = target.slice(3).split('\\');
  if (parts.some((p) => p === '' || p === '.' || p === '..' || /[<>:"/|?*]/.test(p))) return false;
  const lower = target.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}
