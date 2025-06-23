import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { audit } from '../../../src/commands/audit';
import { Analyzer } from '../../../src/services/analyzer';
import { resetTestEnv, TEST_CONFIG_PATH } from '../../test-utils';
import fs from 'fs';
import path from 'path';

describe('Audit Command', () => {
  beforeEach(async () => {
    resetTestEnv();
  });

  afterEach(async () => {
    // Clean up test data
  });

  test('should detect dangerous permissions', async () => {
    // Create test config with dangerous permissions
    const testConfig = {
      version: 1,
      projects: {
        'test-project': {
          allowedCommands: ['npm:*', 'rm:*', 'sudo:*', 'eval:*'],
          allowedTools: []
        }
      }
    };

    fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));

    const result = await audit({ testMode: true });

    expect(result).toContain('SECURITY ISSUES:');
    expect(result).toContain('[HIGH] Dangerous permissions found:');
    expect(result).toContain('rm:*');
    expect(result).toContain('sudo:*');
    expect(result).toContain('eval:*');
  });

  test('should detect config bloat', async () => {
    // Create test config with large pastes
    const largePaste = 'x'.repeat(10000) + '\n'.repeat(150); // 150+ lines
    
    const testConfig = {
      version: 1,
      projects: {
        'bloated-project': {
          allowedCommands: ['npm:*'],
          allowedTools: [],
          history: [{
            display: "Here's a large paste: [Pasted text #1 +150 lines]",
            pastedContents: {
              "1": {
                id: 1,
                type: "text",
                content: largePaste
              }
            }
          }]
        }
      }
    };

    fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));

    const result = await audit({ testMode: true });

    expect(result).toContain('CONFIG BLOAT:');
    expect(result).toContain('[WARN] Large conversation history detected:');
    expect(result).toContain('bloated-project');
    expect(result).toContain('1 large pastes');
  });

  test('should provide recommendations', async () => {
    const testConfig = {
      version: 1,
      projects: {
        'risky-project': {
          allowedCommands: ['rm -rf:*', 'curl * | bash'],
          allowedTools: []
        }
      }
    };

    fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));

    const result = await audit({ testMode: true });

    expect(result).toContain('RECOMMENDATIONS:');
    expect(result).toContain('Remove dangerous permissions: cch clean-dangerous');
    expect(result).toContain('Backup before changes: cch backup');
  });

  test('should handle empty config gracefully', async () => {
    const testConfig = {
      version: 1,
      projects: {}
    };

    fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));

    const result = await audit({ testMode: true });

    expect(result).toContain('Total projects: 0');
    expect(result).not.toContain('SECURITY ISSUES:');
    expect(result).not.toContain('CONFIG BLOAT:');
  });
});