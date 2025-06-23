import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { runCCH, resetTestEnv, createTestConfig, TEST_CONFIG_PATH } from '../test-utils';
import fs from 'fs';

describe('Comprehensive CCH Workflow', () => {
  beforeEach(async () => {
    resetTestEnv();
  });

  afterEach(async () => {
    // Clean up
  });

  test('complete audit and fix workflow', async () => {
    // Create a problematic config
    const testConfig = {
      version: 1,
      projects: {
        'work/api': {
          allowedCommands: ['npm:*', 'rm:*', 'sudo:*'],
          allowedTools: [],
          history: [{
            display: "Large paste here [Pasted text #1 +200 lines]",
            pastedContents: {
              "1": {
                id: 1,
                type: "text",
                content: 'x'.repeat(10000) + '\n'.repeat(200)
              }
            }
          }]
        },
        'work/frontend': {
          allowedCommands: ['npm:*', 'eval:*'],
          allowedTools: [],
          history: [{
            display: "Another large paste [Pasted text #1 +150 lines]",
            pastedContents: {
              "1": {
                id: 1,
                type: "text",
                content: 'y'.repeat(8000) + '\n'.repeat(150)
              }
            }
          }]
        },
        'personal/blog': {
          allowedCommands: ['npm:*', 'git:*'],
          allowedTools: []
        }
      }
    };
    
    fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
    
    // Run audit
    const auditOutput = runCCH('--audit');
    
    // Check audit detected issues
    expect(auditOutput).toContain('SECURITY ISSUES:');
    expect(auditOutput).toContain('[HIGH] Dangerous permissions found:');
    expect(auditOutput).toContain('rm:*');
    expect(auditOutput).toContain('sudo:*');
    expect(auditOutput).toContain('eval:*');
    
    expect(auditOutput).toContain('CONFIG BLOAT:');
    expect(auditOutput).toContain('[WARN] Large conversation history detected:');
    expect(auditOutput).toContain('work/api');
    expect(auditOutput).toContain('work/frontend');
    
    expect(auditOutput).toContain('RECOMMENDATIONS:');
    expect(auditOutput).toContain('Remove dangerous permissions: cch clean-dangerous');
    expect(auditOutput).toContain('Clean bloated history');
    
    // Clean dangerous permissions with dry run
    const dryRunOutput = runCCH('--clean-dangerous --dry-run');
    expect(dryRunOutput).toContain('[DRY RUN] Would remove 3 dangerous permissions from 2 projects');
    
    // Actually clean dangerous permissions
    const cleanOutput = runCCH('--clean-dangerous -f');
    expect(cleanOutput).toContain('Removed 3 dangerous permissions from 2 projects');
    
    // Clean history for specific projects
    const cleanHistoryOutput = runCCH('--clean-history --projects "work/*" -f');
    expect(cleanHistoryOutput).toContain('Cleaned 2 pastes from 2 projects');
    
    // Verify the fixes
    const verifyOutput = runCCH('--audit');
    expect(verifyOutput).not.toContain('SECURITY ISSUES:');
    expect(verifyOutput).not.toContain('CONFIG BLOAT:');
  });

  test('bulk operations workflow', async () => {
    createTestConfig({
      'api-service': { allowedCommands: [], mcpServers: {} },
      'api-gateway': { allowedCommands: ['git:*'], mcpServers: {} },
      'web-api': { allowedCommands: [], mcpServers: {} },
      'frontend': { allowedCommands: ['npm:*'], mcpServers: {} },
      'backend': { allowedCommands: [], mcpServers: {} }
    });
    
    // Add permission to API projects
    const addPermOutput = runCCH('--add-perm "docker:*" --projects "*api*" -f');
    expect(addPermOutput).toContain('Added "docker:*" to 3 projects');
    
    // Add MCP tool to all projects
    const addToolOutput = runCCH('--add-tool github --all -f');
    expect(addToolOutput).toContain('Added MCP tool "github" to 5 projects');
    
    // Remove permission from specific pattern
    const removePermOutput = runCCH('--remove-perm "git:*" --projects "*-gateway"');
    expect(removePermOutput).toContain('Removed 1 permissions from 1 projects');
    
    // Verify with audit
    const auditOutput = runCCH('--audit');
    expect(auditOutput).toContain('Total projects: 5');
    expect(auditOutput).toContain('MCP tools installed: 1'); // github
    expect(auditOutput).toContain('Total permissions: 6'); // 3 docker:*, 2 npm:*
  });

  test('pattern matching scenarios', async () => {
    createTestConfig({
      'work/project1': { allowedCommands: [] },
      'work/project2': { allowedCommands: [] },
      'work/apis/service1': { allowedCommands: [] },
      'work/apis/service2': { allowedCommands: [] },
      'personal/project': { allowedCommands: [] },
      'test-api': { allowedCommands: [] },
      'api-test': { allowedCommands: [] }
    });
    
    // Test various patterns
    const patterns = [
      { pattern: 'work/*', expected: 2 },        // Direct children of work/
      { pattern: 'work/**', expected: 4 },       // All under work/ (including nested)
      { pattern: '*api*', expected: 2 },         // Contains 'api'
      { pattern: '*-api', expected: 1 },         // Ends with '-api'
      { pattern: 'api-*', expected: 1 },         // Starts with 'api-'
      { pattern: 'work/*,personal/*', expected: 3 } // Multiple patterns
    ];
    
    for (const { pattern, expected } of patterns) {
      const output = runCCH(`--add-perm "test:*" --projects "${pattern}" --dry-run`);
      const match = output.match(/to (\d+) projects/);
      if (match) {
        const count = parseInt(match[1]);
        expect(count).toBe(expected);
      } else {
        throw new Error(`Pattern ${pattern} did not match expected output`);
      }
    }
  });

  test('error handling and recovery', async () => {
    // Test with missing config
    fs.unlinkSync(TEST_CONFIG_PATH); // Remove the config file
    const noConfigOutput = runCCH('--audit');
    expect(noConfigOutput).toContain('not found');
    
    // Test with invalid permission number
    createTestConfig();
    const invalidRemoveOutput = runCCH('-rm abc');
    expect(invalidRemoveOutput).toContain('Invalid permission number');
    expect(invalidRemoveOutput).toContain('"abc" is not a valid number');
    
    // Test bulk operation without target
    const noTargetOutput = runCCH('--add-perm "npm:*"');
    expect(noTargetOutput).toContain('Please specify project patterns or use --all');
    
    // Test with corrupted config
    fs.writeFileSync(TEST_CONFIG_PATH, '{ invalid json');
    const corruptedOutput = runCCH('--audit');
    expect(corruptedOutput).toContain('Invalid JSON');
  });
});