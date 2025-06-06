import { normalizePermission } from './permissions';

/**
 * Commands that are completely blocked - never allowed
 */
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -fr /',
  'rm -fr /*',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  ':(){:|:&};:', // Fork bomb
  'mkfs',
  'mkfs.ext4',
  'mkfs.ext3',
  'mkfs.xfs',
  'mkfs.btrfs',
  'format c:',
  'format',
  '> /dev/sda',
  'wipefs'
];

/**
 * Commands that require user confirmation
 */
const DANGEROUS_COMMANDS = [
  'rm',
  'rm -rf',
  'rm -fr',
  'rm -r',
  'mv /*',
  'chmod -R 777',
  'chmod 777',
  'chown -R',
  'find / -delete',
  'find . -delete',
  'find / -exec rm',
  '> /etc/',
  'dd',
  'fdisk',
  'parted',
  'systemctl stop',
  'systemctl disable',
  'service stop',
  'killall',
  'pkill'
];

/**
 * Dangerous patterns to check for
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-[a-z]*r[a-z]*f?\s*\/(?:\s|$)/, // rm with recursive and root
  />\s*\/(?:etc|usr|bin|sbin|lib|dev|proc|sys)/, // Overwriting system files
  /chmod\s+-?R?\s*777/, // Making everything world-writable
  /find\s+\/.*-delete/, // Find with delete on root
  /curl.*\|\s*(?:bash|sh)/, // Piping curl to shell
  /wget.*\|\s*(?:bash|sh)/ // Piping wget to shell
];

export enum PermissionSafety {
  SAFE = 'safe',
  DANGEROUS = 'dangerous',
  BLOCKED = 'blocked'
}

export interface SafetyCheckResult {
  safety: PermissionSafety;
  reason?: string;
}

/**
 * Check if a command is completely blocked
 */
export function isBlockedCommand(command: string): boolean {
  const normalized = normalizePermission(command).toLowerCase().trim();
  
  // Check exact matches
  for (const blocked of BLOCKED_COMMANDS) {
    if (normalized === blocked || normalized.startsWith(blocked + ' ')) {
      return true;
    }
  }
  
  // Check if it's trying to use wildcards with blocked commands
  if (normalized.includes(':*')) {
    const base = normalized.split(':')[0];
    for (const blocked of BLOCKED_COMMANDS) {
      if (blocked.startsWith(base)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if a command is dangerous (requires confirmation)
 */
export function isDangerousCommand(command: string): boolean {
  const normalized = normalizePermission(command).toLowerCase().trim();
  
  // First check if it's blocked - blocked commands are beyond dangerous
  if (isBlockedCommand(command)) {
    return false; // Will be handled as blocked, not just dangerous
  }
  
  // Check exact matches and prefixes
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (normalized === dangerous || 
        normalized.startsWith(dangerous + ' ') ||
        normalized.startsWith(dangerous + ':')) {
      return true;
    }
  }
  
  // Check patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  
  // Check if it's a wildcard for a dangerous command
  if (normalized.includes(':*')) {
    const base = normalized.split(':')[0];
    for (const dangerous of DANGEROUS_COMMANDS) {
      if (dangerous === base || dangerous.startsWith(base + ' ')) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Perform a complete safety check on a command
 */
export function checkCommandSafety(command: string): SafetyCheckResult {
  if (isBlockedCommand(command)) {
    return {
      safety: PermissionSafety.BLOCKED,
      reason: 'This command could cause irreversible system damage'
    };
  }
  
  if (isDangerousCommand(command)) {
    return {
      safety: PermissionSafety.DANGEROUS,
      reason: 'This command could potentially delete or modify important files'
    };
  }
  
  return {
    safety: PermissionSafety.SAFE
  };
}

/**
 * Filter out blocked commands from a list
 */
export function filterBlockedCommands(commands: string[]): {
  safe: string[];
  blocked: string[];
} {
  const safe: string[] = [];
  const blocked: string[] = [];
  
  for (const command of commands) {
    if (isBlockedCommand(command)) {
      blocked.push(command);
    } else {
      safe.push(command);
    }
  }
  
  return { safe, blocked };
}

/**
 * Get human-readable description of why a command is dangerous
 */
export function getDangerDescription(command: string): string {
  const normalized = normalizePermission(command).toLowerCase().trim();
  
  if (normalized.includes('rm')) {
    if (normalized.includes('-rf /') || normalized.includes('-fr /')) {
      return 'Could recursively delete your entire filesystem';
    }
    if (normalized.includes('-rf') || normalized.includes('-fr')) {
      return 'Could recursively delete files without confirmation';
    }
    return 'Could permanently delete files';
  }
  
  if (normalized.includes('chmod') && normalized.includes('777')) {
    return 'Makes files accessible to everyone, creating security vulnerabilities';
  }
  
  if (normalized.includes('dd')) {
    return 'Direct disk access could corrupt or erase drives';
  }
  
  if (normalized.includes('mkfs') || normalized.includes('format')) {
    return 'Could format and erase entire drives';
  }
  
  if (normalized.includes('mv /*')) {
    return 'Could move critical system files';
  }
  
  if (normalized.includes('find') && normalized.includes('delete')) {
    return 'Could delete many files at once';
  }
  
  if (normalized.includes('fork bomb') || normalized.includes(':(){:|:&};:')) {
    return 'Fork bomb that would crash your system';
  }
  
  return 'Could potentially harm your system or data';
}