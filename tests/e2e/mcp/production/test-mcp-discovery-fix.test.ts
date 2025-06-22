/**
 * Test MCP discovery tools after GlobalConfigReaderService singleton fix
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MCPTestClient } from '../../../utils/mcp-test-client';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('MCP Discovery Tools - Production Test', () => {
  let client: MCPTestClient;
  const mcpPath = path.join(__dirname, '../../../../src/mcp-server.ts');
  const testTimeout = 30000;
  let backupPath: string | null = null;

  beforeAll(async () => {
    // Initialize MCP client
    client = new MCPTestClient(mcpPath, {
      timeout: testTimeout
    });
    
    await client.connect();
    // Backup existing config if it exists
    const configPath = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(configPath)) {
      backupPath = configPath + '.backup-' + Date.now();
      fs.copyFileSync(configPath, backupPath);
    }

    // Create a test global config with MCP tools
    const testConfig = {
      toolChoice: 'auto',
      userPreferences: {},
      globalShortcuts: [],
      projects: {
        '/test/project1': {
          allowedTools: [
            'Bash(mcp__vssh__run_command:*)',
            'mcp__example__tool1',
            'Read'
          ]
        },
        '/test/project2': {
          allowedTools: [
            'Bash(mcp__vssh__run_command:*)',
            'Bash(mcp__docker__container_list:*)',
            'Write'
          ]
        },
        '/test/project3': {
          allowedTools: [
            'mcp__example__tool1',
            'mcp__example__tool2',
            'Bash(mcp__docker__container_list:*)'
          ]
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
    
    // Verify the config was written
    const writtenConfig = fs.readFileSync(configPath, 'utf8');
    console.log('Test config written to:', configPath);
    console.log('Config size:', writtenConfig.length, 'bytes');
    console.log('Config projects:', Object.keys(JSON.parse(writtenConfig).projects));
  }, testTimeout);

  afterAll(async () => {
    // Disconnect client
    client.disconnect();
    // Restore original config
    const configPath = path.join(os.homedir(), '.claude.json');
    if (backupPath && fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, configPath);
      fs.unlinkSync(backupPath);
    } else {
      // Remove test config if no backup
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
  });

  it('should list MCPs from global config', async () => {
    const result = await client.callTool('list-mcps', { includeDetails: true });
    
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    
    const text = result.content[0].text;
    console.log('list-mcps result:', text);
    
    // Should find MCPs
    expect(text).not.toContain('No MCPs found');
    expect(text).toContain('MCPs Found Across Your Projects');
    
    // Should find vssh (used in 2 projects)
    expect(text).toContain('vssh');
    expect(text).toContain('Used in 2 projects');
    
    // Should find docker (used in 2 projects)
    expect(text).toContain('docker');
    
    // Should find example (used in 2 projects)
    expect(text).toContain('example');
  }, testTimeout);

  it('should discover frequently used MCP tools', async () => {
    const result = await client.callTool('discover-mcp-tools', { 
      minProjectCount: 2,
      includeStats: true 
    });
    
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    
    const text = result.content[0].text;
    console.log('discover-mcp-tools result:', text);
    
    // Should find tools used in 2+ projects
    expect(text).not.toContain('No MCP tools found');
    expect(text).toContain('MCP Tools Used in 2+ Projects');
    
    // Should include statistics
    expect(text).toContain('Statistics');
    expect(text).toContain('Total MCPs:');
    expect(text).toContain('Total Tools:');
  }, testTimeout);

  it('should get MCP statistics', async () => {
    const result = await client.callTool('get-mcp-stats', { groupBy: 'mcp' });
    
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    
    const text = result.content[0].text;
    console.log('get-mcp-stats result:', text);
    
    // Should have statistics
    expect(text).toContain('MCP Usage Statistics');
    expect(text).toContain('Summary');
    expect(text).toContain('Total MCPs:');
    
    // Should not show 0 for all stats
    expect(text).not.toMatch(/Total MCPs: 0\s*\n.*Total Tools: 0\s*\n.*Total Usage: 0/);
    
    // Should have top MCPs section
    expect(text).toContain('Top MCPs by Usage');
  }, testTimeout);

  it('should handle sequential calls efficiently with caching', async () => {
    console.log('Testing sequential calls with caching...');
    
    // First call - should populate cache
    const start1 = Date.now();
    const result1 = await client.callTool('list-mcps', {});
    const time1 = Date.now() - start1;
    
    // Second call - should use cache
    const start2 = Date.now();
    const result2 = await client.callTool('list-mcps', {});
    const time2 = Date.now() - start2;
    
    console.log(`First call: ${time1}ms`);
    console.log(`Second call: ${time2}ms`);
    
    // Both should succeed
    expect(result1.content).toBeDefined();
    expect(result2.content).toBeDefined();
    
    // Results should be identical
    expect(result1.content[0].text).toBe(result2.content[0].text);
    
    // Note: We can't test timing directly since each call-mcp creates a new process
    // But we can verify both calls work correctly
  }, testTimeout);

  it('should handle parallel calls correctly', async () => {
    console.log('Testing parallel calls...');
    
    // Make 3 parallel calls
    const [result1, result2, result3] = await Promise.all([
      client.callTool('list-mcps', {}),
      client.callTool('discover-mcp-tools', { minProjectCount: 1 }),
      client.callTool('get-mcp-stats', {})
    ]);
    
    // All should succeed
    expect(result1.content).toBeDefined();
    expect(result2.content).toBeDefined();
    expect(result3.content).toBeDefined();
    
    // All should find MCPs (not empty)
    expect(result1.content[0].text).not.toContain('No MCPs found');
    expect(result2.content[0].text).not.toContain('No MCP tools found');
    expect(result3.content[0].text).not.toMatch(/Total MCPs: 0/);
  }, testTimeout);
});