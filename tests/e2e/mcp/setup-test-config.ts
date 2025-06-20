/**
 * Test configuration setup for MCP E2E tests
 */

import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export class TestConfigManager {
  private testDir: string;
  
  constructor(prefix: string = 'cch-test') {
    this.testDir = join(tmpdir(), `${prefix}-${Date.now()}`);
  }

  async setup(): Promise<string> {
    // Create test directories
    mkdirSync(this.testDir, { recursive: true });
    mkdirSync(join(this.testDir, '.cch'), { recursive: true });
    mkdirSync(join(this.testDir, '.cch', 'logs'), { recursive: true });
    mkdirSync(join(this.testDir, '.cch', 'backups'), { recursive: true });
    
    // Create test CCH configuration
    const cchConfig = {
      version: '2.0.0',
      dataDir: join(this.testDir, '.cch'),
      logging: {
        level: 'debug',
        format: 'pretty'
      },
      safety: {
        enabled: true
      },
      mcp: {
        timeout: 5000,
        maxConcurrent: 3
      },
      permissions: {
        autoApply: false,
        warnOnDangerous: true
      }
    };
    
    writeFileSync(
      join(this.testDir, '.cch', 'config.json'),
      JSON.stringify(cchConfig, null, 2)
    );
    
    // Create test preferences
    const preferences = {
      permissions: {
        autoApply: false,
        showChangeSummary: true,
        backupBeforeApply: true,
        verboseLogging: false,
        suppressDangerWarnings: false
      },
      display: {
        useColors: true,
        compactMode: false
      }
    };
    
    writeFileSync(
      join(this.testDir, '.cch', 'preferences.json'),
      JSON.stringify(preferences, null, 2)
    );
    
    // Create test permissions
    const permissions = {
      allowedCommands: [
        'ls',
        'echo',
        'pwd',
        'date'
      ]
    };
    
    writeFileSync(
      join(this.testDir, '.cch', 'permissions.json'),
      JSON.stringify(permissions, null, 2)
    );
    
    // Create test state
    const state = {
      mcpUsage: {},
      lastRun: new Date().toISOString()
    };
    
    writeFileSync(
      join(this.testDir, '.cch', 'state.json'),
      JSON.stringify(state, null, 2)
    );
    
    // Create a test Claude config (NOT in production location)
    const testClaudeConfig = {
      numStartups: 1,
      hasCompletedOnboarding: true,
      projects: {
        [this.testDir]: {
          allowedTools: [
            'Bash(ls)',
            'Bash(echo)',
            'Bash(pwd)'
          ]
        }
      },
      mcpServers: {
        'test-cch': {
          command: 'bun run src/mcp-server.ts',
          env: {
            CCH_DATA_DIR: join(this.testDir, '.cch')
          }
        }
      }
    };
    
    writeFileSync(
      join(this.testDir, '.claude.json'),
      JSON.stringify(testClaudeConfig, null, 2)
    );
    
    return this.testDir;
  }

  async cleanup(): Promise<void> {
    try {
      rmSync(this.testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
      console.warn('Failed to cleanup test directory:', error);
    }
  }

  getTestDir(): string {
    return this.testDir;
  }

  getCCHDir(): string {
    return join(this.testDir, '.cch');
  }

  getClaudeConfigPath(): string {
    return join(this.testDir, '.claude.json');
  }
}

// Global test config instance for shared tests
let globalTestConfig: TestConfigManager | null = null;

export async function setupGlobalTestConfig(): Promise<TestConfigManager> {
  if (!globalTestConfig) {
    globalTestConfig = new TestConfigManager('cch-global-test');
    await globalTestConfig.setup();
  }
  return globalTestConfig;
}

export async function cleanupGlobalTestConfig(): Promise<void> {
  if (globalTestConfig) {
    await globalTestConfig.cleanup();
    globalTestConfig = null;
  }
}

// Environment variable helpers
export function getTestEnv(testDir: string): Record<string, string> {
  return {
    CCH_DATA_DIR: join(testDir, '.cch'),
    CCH_LOG_LEVEL: 'debug',
    CCH_SAFETY_ENABLED: 'true',
    NODE_ENV: 'test'
  };
}