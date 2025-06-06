/**
 * Core permission utilities for formatting and validation
 */

/**
 * Normalize a permission by removing Bash() wrapper if present
 */
export function normalizePermission(permission: string): string {
  if (permission.startsWith('Bash(') && permission.endsWith(')')) {
    return permission.slice(5, -1);
  }
  return permission;
}

/**
 * Wrap a permission with Bash() for Claude config
 */
export function wrapPermission(permission: string): string {
  if (permission.startsWith('Bash(') && permission.endsWith(')')) {
    return permission;
  }
  return `Bash(${permission})`;
}

/**
 * Check if a permission is already wrapped
 */
export function isWrapped(permission: string): boolean {
  return permission.startsWith('Bash(') && permission.endsWith(')');
}

/**
 * Format permissions for display (removes Bash wrapper)
 */
export function formatForDisplay(permissions: string[]): string[] {
  return permissions.map(normalizePermission);
}

/**
 * Format permissions for Claude config (adds Bash wrapper)
 */
export function formatForConfig(permissions: string[]): string[] {
  return permissions.map(wrapPermission);
}

/**
 * Remove duplicate permissions from a list
 */
export function deduplicatePermissions(permissions: string[]): string[] {
  const normalized = permissions.map(normalizePermission);
  const unique = Array.from(new Set(normalized));
  return unique;
}

/**
 * Check if a permission is a wildcard permission
 */
export function isWildcardPermission(permission: string): boolean {
  const normalized = normalizePermission(permission);
  return normalized.includes(':*');
}

/**
 * Check if a permission is a simple command (single word)
 */
export function isSimpleCommand(permission: string): boolean {
  const normalized = normalizePermission(permission);
  return !normalized.includes(' ') && !normalized.includes(':');
}

/**
 * Compare two permission lists and return differences
 */
export interface PermissionDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export function comparePermissions(
  oldPermissions: string[],
  newPermissions: string[]
): PermissionDiff {
  const oldSet = new Set(oldPermissions.map(normalizePermission));
  const newSet = new Set(newPermissions.map(normalizePermission));
  
  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];
  
  // Find added permissions
  for (const perm of newSet) {
    if (!oldSet.has(perm)) {
      added.push(perm);
    } else {
      unchanged.push(perm);
    }
  }
  
  // Find removed permissions
  for (const perm of oldSet) {
    if (!newSet.has(perm)) {
      removed.push(perm);
    }
  }
  
  return { added, removed, unchanged };
}

/**
 * Filter out base permissions from a list
 */
export function filterOutBasePermissions(
  permissions: string[],
  basePermissions: string[]
): string[] {
  const baseSet = new Set(basePermissions.map(normalizePermission));
  return permissions.filter(perm => !baseSet.has(normalizePermission(perm)));
}

/**
 * Merge permission lists, preserving order and avoiding duplicates
 */
export function mergePermissions(
  basePermissions: string[],
  additionalPermissions: string[]
): string[] {
  const result = [...basePermissions];
  const resultSet = new Set(result.map(normalizePermission));
  
  for (const perm of additionalPermissions) {
    const normalized = normalizePermission(perm);
    if (!resultSet.has(normalized)) {
      result.push(perm);
      resultSet.add(normalized);
    }
  }
  
  return result;
}