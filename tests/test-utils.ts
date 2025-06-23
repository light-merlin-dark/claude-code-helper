/**
 * Shared test utilities for simpler, faster tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Base test data directory
export const TEST_DATA_DIR = path.join(__dirname, 'data');
export const TEST_CCH_DIR = path.join(TEST_DATA_DIR, '.cch');
export const TEST_CONFIG_PATH = path.join(TEST_DATA_DIR, '.claude.json');

// CLI path
export const CLI_PATH = path.join(__dirname, '../src/index.ts');

/**
 * Run CCH command with test mode
 */
export function runCCH(args: string): string {
  try {
    return execSync(`bun run ${CLI_PATH} ${args} --test`, {
      encoding: 'utf8',
      cwd: TEST_DATA_DIR,
      env: { ...process.env, TEST_MODE: 'true' }
    });
  } catch (error: any) {
    return error.stdout || error.stderr || error.message;
  }
}

/**
 * Reset test environment
 */
export function resetTestEnv(): void {
  // Ensure test data directory exists
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  
  // Clean CCH directory
  if (fs.existsSync(TEST_CCH_DIR)) {
    fs.rmSync(TEST_CCH_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_CCH_DIR, { recursive: true });
}

/**
 * Create test config with sample projects
 */
export function createTestConfig(projects: Record<string, any> = {}): void {
  const defaultProjects = {
    "/test/project1": {
      allowedTools: ["Bash(npm:*)", "Bash(git:*)", "Bash(mcp__vssh__run_command:*)"],
      history: []
    },
    "/test/project2": {
      allowedTools: ["Bash(docker:*)", "Bash(mcp__vssh__run_command:*)"],
      history: []
    },
    "/test/project3": {
      allowedTools: ["Bash(mcp__vssh__run_command:*)", "Bash(mcp__github__search_code:*)"],
      history: []
    }
  };
  
  const config = {
    projects: { ...defaultProjects, ...projects },
    mcp: {}
  };
  
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Read test permissions
 */
export function readPermissions(): string[] {
  const permissionsPath = path.join(TEST_CCH_DIR, 'permissions.json');
  if (!fs.existsSync(permissionsPath)) return [];
  return JSON.parse(fs.readFileSync(permissionsPath, 'utf8'));
}

/**
 * Quick test setup
 */
export function setupQuickTest(): void {
  resetTestEnv();
  createTestConfig();
}