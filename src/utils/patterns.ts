/**
 * Pattern matching utilities for flexible project selection
 * Supports patterns like work/*, *-api, frontend-*, work/apis/*
 */

import { ClaudeConfig } from '../core/config';

/**
 * Match projects based on pattern(s)
 * @param patterns - Single pattern or array of patterns (comma-separated string or array)
 * @param config - Claude configuration
 * @returns Array of [projectName, projectConfig] tuples
 */
export function matchProjects(
  patterns: string | string[], 
  config: ClaudeConfig
): Array<[string, any]> {
  const patternList = typeof patterns === 'string' 
    ? patterns.split(',').map(p => p.trim())
    : patterns;
  
  const allProjects = Object.entries(config.projects || {});
  const matchedProjects = new Set<string>();
  
  patternList.forEach(pattern => {
    const regex = patternToRegex(pattern);
    
    allProjects.forEach(([projectName]) => {
      if (regex.test(projectName)) {
        matchedProjects.add(projectName);
      }
    });
  });
  
  return allProjects.filter(([name]) => matchedProjects.has(name));
}

/**
 * Convert a glob-like pattern to regex
 * Supports:
 * - * for any characters
 * - ** for any path segments
 * - ? for single character
 */
function patternToRegex(pattern: string): RegExp {
  let regexStr = pattern
    // Escape special regex characters (except * and ?)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Replace ** with special marker
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    // Replace * with any characters except /
    .replace(/\*/g, '[^/]*')
    // Replace ? with single character
    .replace(/\?/g, '.')
    // Replace ** marker with any characters including /
    .replace(/__DOUBLE_STAR__/g, '.*');
  
  // Anchor the pattern
  regexStr = `^${regexStr}$`;
  
  return new RegExp(regexStr);
}

/**
 * Check if a project name matches any of the given patterns
 */
export function projectMatchesPatterns(
  projectName: string, 
  patterns: string | string[]
): boolean {
  const patternList = typeof patterns === 'string' 
    ? patterns.split(',').map(p => p.trim())
    : patterns;
  
  return patternList.some(pattern => {
    const regex = patternToRegex(pattern);
    return regex.test(projectName);
  });
}

/**
 * Group projects by their parent directory
 */
export function groupProjectsByDirectory(
  projects: Array<[string, any]>
): Map<string, Array<[string, any]>> {
  const groups = new Map<string, Array<[string, any]>>();
  
  projects.forEach(([projectName, config]) => {
    const parts = projectName.split('/');
    const directory = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
    
    if (!groups.has(directory)) {
      groups.set(directory, []);
    }
    
    groups.get(directory)!.push([projectName, config]);
  });
  
  return groups;
}

/**
 * Parse project specifier which can be:
 * - Pattern(s): "work/*,personal/*"
 * - --all flag: apply to all projects
 * - Empty: interactive selection
 */
export interface ProjectSpecifier {
  patterns?: string[];
  all?: boolean;
}

export function parseProjectSpecifier(
  value?: string | boolean,
  allFlag?: boolean
): ProjectSpecifier {
  if (allFlag || value === true) {
    return { all: true };
  }
  
  if (typeof value === 'string' && value.trim()) {
    return { patterns: value.split(',').map(p => p.trim()) };
  }
  
  return {}; // Interactive mode
}