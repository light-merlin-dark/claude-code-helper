/**
 * Test setup and utilities for Claude Code Helper tests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// Test data paths
export const TEST_DATA_DIR = path.join(__dirname, 'data');
export const TEST_CONFIG_PATH = path.join(TEST_DATA_DIR, '.claude.json');
export const TEST_CCH_DIR = path.join(TEST_DATA_DIR, '.cch');
export const TEST_BACKUPS_DIR = path.join(TEST_CCH_DIR, 'backups');
export const TEST_BASE_COMMANDS_PATH = path.join(TEST_CCH_DIR, 'base-commands.json');
export const TEST_PERMISSIONS_PATH = path.join(TEST_CCH_DIR, 'permissions.json');
export const TEST_PREFERENCES_PATH = path.join(TEST_CCH_DIR, 'preferences.json');

// CLI paths
export const CLI_PATH = path.join(__dirname, '../src/index.ts');
export const CLI_CMD = `bun run ${CLI_PATH}`;

// Original test data
export const ORIGINAL_CONFIG = {
  numStartups: 42,
  autoUpdaterStatus: "disabled",
  userID: "test-user-123",
  hasCompletedOnboarding: true,
  projects: {
    "/test/project1": {
      allowedTools: ["Bash(make:*)", "Bash(npm run build:*)", "Bash(make:*)", "Bash(git status)", "Bash(mcp__vssh__run_command:*)", "Bash(mcp__github__search_code:*)"],
      history: [],
      dontCrawlDirectory: false,
      enableArchitectTool: true
    },
    "/test/project2": {
      allowedTools: ["Bash(git add:*)", "Bash(git add:*)", "Bash(m:*)", "Bash(docker:*)", "Bash(mcp__vssh__run_command:*)", "Bash(mcp__slack__send_message:*)"],
      history: [],
      dontCrawlDirectory: false,
      enableArchitectTool: false
    },
    "/test/project3": {
      allowedTools: ["Bash(mcp__vssh__run_command:*)", "Bash(mcp__jira__create_ticket:*)"],
      history: [],
      dontCrawlDirectory: false,
      enableArchitectTool: true
    },
    "/test/project4": {
      allowedTools: ["Bash(npm:*)", "Bash(mcp__github__search_code:*)", "Bash(mcp__github__create_issue:*)"],
      history: [],
      dontCrawlDirectory: false,
      enableArchitectTool: true
    },
    "/test/project5": {
      allowedTools: ["Bash(yarn:*)", "Bash(mcp__slack__send_message:*)", "Bash(mcp__jira__create_ticket:*)"],
      history: [],
      dontCrawlDirectory: false,
      enableArchitectTool: false
    }
  }
};

export const ORIGINAL_PERMISSIONS = ["make:*", "npm run:*", "npm test:*", "git status", "git diff:*"];

/**
 * Run CLI command and return output
 */
export function runCommand(args: string): string {
  try {
    const output = execSync(`${CLI_CMD} ${args}`, { 
      encoding: 'utf8',
      env: { ...process.env, TEST_MODE: 'true' },
      cwd: TEST_DATA_DIR
    });
    return output;
  } catch (error: any) {
    return error.stdout || error.stderr || error.message;
  }
}

/**
 * Run CLI command asynchronously
 */
export async function runCommandAsync(args: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const output = execSync(`${CLI_CMD} ${args}`, { 
        encoding: 'utf8',
        env: { ...process.env, TEST_MODE: 'true' },
        cwd: TEST_DATA_DIR
      });
      resolve(output);
    } catch (error: any) {
      resolve(error.stdout || error.stderr || error.message);
    }
  });
}

/**
 * Read test configuration
 */
export function readTestConfig(): any {
  return JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
}

/**
 * Read base commands
 */
export function readBaseCommands(): string[] {
  if (!fs.existsSync(TEST_BASE_COMMANDS_PATH)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(TEST_BASE_COMMANDS_PATH, 'utf8'));
}

/**
 * Read permissions
 */
export function readPermissions(): string[] {
  if (!fs.existsSync(TEST_PERMISSIONS_PATH)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(TEST_PERMISSIONS_PATH, 'utf8'));
}

/**
 * Read preferences
 */
export function readPreferences(): any {
  if (!fs.existsSync(TEST_PREFERENCES_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(TEST_PREFERENCES_PATH, 'utf8'));
}

/**
 * Reset test data to original state
 */
export function resetTestData(): void {
  // Clean up old backup directory if it exists
  const oldBackupsDir = path.join(TEST_DATA_DIR, '.claude-backups');
  if (fs.existsSync(oldBackupsDir)) {
    fs.rmSync(oldBackupsDir, { recursive: true });
  }

  // Write original config
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(ORIGINAL_CONFIG, null, 2));
  
  // Ensure the .cch directory exists
  if (!fs.existsSync(TEST_CCH_DIR)) {
    fs.mkdirSync(TEST_CCH_DIR, { recursive: true });
  }
  
  // Write permissions
  fs.writeFileSync(TEST_PERMISSIONS_PATH, JSON.stringify(ORIGINAL_PERMISSIONS, null, 2));
  
  // Also create base-commands for backward compatibility
  fs.writeFileSync(TEST_BASE_COMMANDS_PATH, JSON.stringify(ORIGINAL_PERMISSIONS, null, 2));
}

/**
 * Clean up all test data
 */
export function cleanupTestData(): void {
  if (fs.existsSync(TEST_CCH_DIR)) {
    fs.rmSync(TEST_CCH_DIR, { recursive: true });
  }
}

/**
 * Create a temporary test directory
 */
export function createTempTestDir(): string {
  const tempDir = path.join(os.tmpdir(), `cch-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Setup test environment before each test
 */
export function setupTest(): void {
  resetTestData();
}

/**
 * Teardown test environment after each test
 */
export function teardownTest(): void {
  // Optional: clean up after each test
  // For now, we'll just reset data which happens in setupTest
}