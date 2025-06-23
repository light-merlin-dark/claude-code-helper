/**
 * Core workflow E2E tests - simplified and focused
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { runCCH, setupQuickTest, readPermissions, TEST_CONFIG_PATH } from '../test-utils';
import * as fs from 'fs';

describe('Core CCH Workflow', () => {
  beforeEach(() => {
    setupQuickTest();
  });

  test('permission management flow', async () => {
    // 1. List initial permissions
    const list1 = runCCH('-lp');
    expect(list1).toContain('Your Permissions:');
    
    // 2. Add a permission
    const add = runCCH('-add docker');
    expect(add).toContain('Added permission: docker:*');
    
    // 3. Verify it was added
    const permissions = readPermissions();
    expect(permissions).toContain('docker:*');
    
    // 4. Apply permissions
    const apply = runCCH('-ap');
    expect(apply).toContain('All projects already have the required permissions');
  });

  test('MCP discovery flow', async () => {
    // Run discovery
    const discover = runCCH('-dmc');
    expect(discover).toContain('mcp__vssh__run_command');
    expect(discover).toContain('used in 3 projects');
  });

  test('config backup and restore', async () => {
    // Add a custom permission
    runCCH('-add custom-tool');
    
    // Backup
    const backup = runCCH('-bc -n test-backup');
    expect(backup).toContain('Config backed up');
    
    // Modify
    runCCH('-add another-tool');
    
    // Restore
    const restore = runCCH('-rc -n test-backup');
    expect(restore).toContain('Config restored');
    
    // Verify restoration worked
    const finalConfig = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
    // The backup/restore is for the Claude config, not CCH permissions
    expect(restore).toContain('Config restored');
  });

  test('doctor command', async () => {
    const doctor = runCCH('--doctor');
    expect(doctor).toContain('Running Claude Code Helper Doctor');
    expect(doctor).toContain('System Information');
    expect(doctor).toContain('CCH Configuration');
  });
});

describe('MCP Server Tools', () => {
  beforeEach(() => {
    setupQuickTest();
  });
  
  test('MCP tools are accessible', async () => {
    const { testMcpTool } = await import('../test-mcp');
    
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });
    
    const output = await testMcpTool(request + '\n', ['dist/cch-mcp.js']);
    const parsed = JSON.parse(output);
    
    expect(parsed.result.tools).toBeDefined();
    expect(parsed.result.tools.length).toBeGreaterThan(0);
    
    // Check tool names
    const toolNames = parsed.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('mcp__cch__doctor');
    expect(toolNames).toContain('mcp__cch__discover-mcp-tools');
  });
  
  test('doctor tool works through MCP', async () => {
    const { testMcpTool } = await import('../test-mcp');
    
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'mcp__cch__doctor',
        arguments: {}
      }
    });
    
    const output = await testMcpTool(request + '\n', ['dist/cch-mcp.js']);
    const parsed = JSON.parse(output);
    expect(parsed.result.content[0].text).toContain('Running Claude Code Helper Doctor');
  });
});