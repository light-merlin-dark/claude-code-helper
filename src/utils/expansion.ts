import { normalizePermission, isSimpleCommand } from '../core/permissions';

/**
 * Common commands that benefit from wildcard expansion
 */
const EXPANDABLE_COMMANDS = [
  'make',
  'npm',
  'yarn',
  'pnpm',
  'cargo',
  'go',
  'python',
  'pip',
  'poetry',
  'bundle',
  'gem',
  'rake',
  'rails',
  'docker',
  'docker-compose',
  'kubectl',
  'terraform',
  'ansible',
  'vagrant',
  'gradle',
  'mvn',
  'ant',
  'composer',
  'artisan',
  'mix',
  'dotnet',
  'flutter',
  'pod',
  'swift',
  'rustc',
  'gcc',
  'g++',
  'clang',
  'node',
  'deno',
  'bun',
  'jest',
  'vitest',
  'pytest',
  'rspec',
  'phpunit'
];

/**
 * Commands that should NOT be expanded (they're meant to be used as-is)
 */
const NON_EXPANDABLE_COMMANDS = [
  'ls',
  'cd',
  'pwd',
  'echo',
  'cat',
  'grep',
  'find',
  'which',
  'whoami',
  'date',
  'time',
  'ps',
  'top',
  'htop',
  'df',
  'du',
  'free',
  'uptime',
  'uname',
  'hostname',
  'ifconfig',
  'ping',
  'curl',
  'wget',
  'ssh',
  'scp',
  'rsync'
];

/**
 * Check if a command should be expanded with wildcards
 */
export function shouldExpand(command: string): boolean {
  const normalized = normalizePermission(command).toLowerCase();
  
  // Already has wildcards or parameters
  if (normalized.includes(':') || normalized.includes(' ')) {
    return false;
  }
  
  // Check if it's in the non-expandable list
  if (NON_EXPANDABLE_COMMANDS.includes(normalized)) {
    return false;
  }
  
  // Check if it's in the expandable list or is a simple command
  return EXPANDABLE_COMMANDS.includes(normalized) || isSimpleCommand(command);
}

/**
 * Expand a command with wildcards if appropriate
 */
export function expandCommand(command: string): string {
  const normalized = normalizePermission(command);
  
  if (!shouldExpand(command)) {
    return normalized;
  }
  
  return `${normalized}:*`;
}

/**
 * Process a command with smart expansion
 * Returns the expanded command and whether it was expanded
 */
export function smartExpand(command: string): {
  expanded: string;
  wasExpanded: boolean;
} {
  const normalized = normalizePermission(command);
  const expanded = expandCommand(command);
  
  return {
    expanded,
    wasExpanded: expanded !== normalized
  };
}

/**
 * Get a user-friendly message about the expansion
 */
export function getExpansionMessage(original: string, expanded: string): string | null {
  if (original === expanded) {
    return null;
  }
  
  return `Expanded "${original}" to "${expanded}" (allows all subcommands)`;
}

/**
 * Check if a command is a known tool that benefits from expansion
 */
export function isKnownExpandableCommand(command: string): boolean {
  const normalized = normalizePermission(command).toLowerCase();
  const baseCommand = normalized.split(/[\s:]/)[0];
  return EXPANDABLE_COMMANDS.includes(baseCommand);
}

/**
 * Suggest expansion for a command (used in interactive prompts)
 */
export function suggestExpansion(command: string): string | null {
  const normalized = normalizePermission(command);
  
  // If it already has wildcards or parameters, no suggestion
  if (normalized.includes(':') || normalized.includes(' ')) {
    return null;
  }
  
  // If it's a known expandable command, suggest expansion
  if (isKnownExpandableCommand(command)) {
    return `${normalized}:*`;
  }
  
  // For other simple commands, only suggest if they're not in the non-expandable list
  if (isSimpleCommand(command) && !NON_EXPANDABLE_COMMANDS.includes(normalized.toLowerCase())) {
    return `${normalized}:*`;
  }
  
  return null;
}