/**
 * Test MCP server environment to debug issues
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MCPTestClient } from '../../../utils/mcp-test-client';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';

describe('MCP Server Environment Test', () => {
  let client: MCPTestClient;
  const mcpPath = path.join(__dirname, '../../../../src/mcp-server.ts');
  const testTimeout = 30000;

  beforeAll(async () => {
    // Initialize MCP client
    client = new MCPTestClient(mcpPath, {
      timeout: testTimeout,
      env: {
        ...process.env,
        CCH_LOG_LEVEL: 'debug',  // Enable debug logging
        DEBUG: '*'  // Enable all debug logs
      }
    });
    
    await client.connect();
  }, testTimeout);

  afterAll(async () => {
    client.disconnect();
  });

  it('should check if jq is available in system', async () => {
    try {
      const jqPath = execSync('which jq', { encoding: 'utf8' }).trim();
      console.log('jq found at:', jqPath);
      
      const jqVersion = execSync('jq --version', { encoding: 'utf8' }).trim();
      console.log('jq version:', jqVersion);
      
      expect(jqPath).toBeTruthy();
    } catch (error) {
      console.error('jq not found in PATH:', error);
      throw new Error('jq is not available in the system PATH');
    }
  });

  it('should verify ~/.claude.json exists', async () => {
    const configPath = path.join(os.homedir(), '.claude.json');
    const exists = fs.existsSync(configPath);
    
    console.log('Config path:', configPath);
    console.log('Config exists:', exists);
    
    if (exists) {
      const stats = fs.statSync(configPath);
      console.log('Config size:', stats.size, 'bytes');
      console.log('Config modified:', stats.mtime);
      
      // Read first 200 chars to verify it's valid JSON
      const content = fs.readFileSync(configPath, 'utf8');
      console.log('Config preview:', content.substring(0, 200) + '...');
      
      // Check if it has projects
      try {
        const parsed = JSON.parse(content);
        const projectCount = Object.keys(parsed.projects || {}).length;
        console.log('Project count:', projectCount);
      } catch (e) {
        console.error('Failed to parse config:', e);
      }
    }
    
    expect(exists).toBe(true);
  });

  it('should call list-mcps and capture debug logs', async () => {
    console.log('\n=== Calling list-mcps with debug logging ===\n');
    
    const result = await client.callTool('list-mcps', { includeDetails: true });
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // The result will help us see what's happening
    expect(result.content).toBeDefined();
  }, testTimeout);

  it('should test doctor tool to see environment info', async () => {
    console.log('\n=== Running doctor diagnostics ===\n');
    
    const result = await client.callTool('doctor');
    
    if (result.content && result.content[0]) {
      console.log(result.content[0].text);
    }
    
    expect(result.content).toBeDefined();
  }, testTimeout);
});