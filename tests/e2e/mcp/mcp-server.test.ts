/**
 * E2E Tests for Claude Code Helper MCP Server
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MCPTestClient } from '../../utils/mcp-test-client';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('MCP Server E2E Tests', () => {
  let client: MCPTestClient;
  const mcpPath = path.join(__dirname, '../../../src/mcp-server.ts');
  const testDataDir = path.join(os.tmpdir(), 'cch-mcp-test', Date.now().toString());

  beforeAll(async () => {
    // Create test data directory
    fs.mkdirSync(testDataDir, { recursive: true });
    
    // Set up test environment
    client = new MCPTestClient(mcpPath, {
      timeout: 10000,
      env: {
        CCH_DATA_DIR: testDataDir,
        CCH_LOG_LEVEL: 'debug'
      }
    });
    
    await client.connect();
  });

  afterAll(() => {
    client.disconnect();
    
    // Clean up test directory
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Tool Discovery', () => {
    it('should list all available tools', async () => {
      const result = await client.listTools();
      
      expect(result).toBeDefined();
      expect(result.tools).toBeInstanceOf(Array);
      
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('reload-mcp');
      expect(toolNames).toContain('doctor');
      expect(toolNames).toContain('view-logs');
    });

    it('should provide proper tool descriptions', async () => {
      const result = await client.listTools();
      const doctorTool = result.tools.find((t: any) => t.name === 'doctor');
      
      expect(doctorTool).toBeDefined();
      expect(doctorTool.description).toContain('diagnostics');
      expect(doctorTool.inputSchema).toBeDefined();
    });
  });

  describe('Doctor Tool', () => {
    it('should run diagnostics successfully', async () => {
      const result = await client.callTool('doctor');
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      
      const diagnostics = result.content[0].text;
      expect(diagnostics).toContain('Claude Code Helper Diagnostics Report');
      expect(diagnostics).toContain('System Information');
      expect(diagnostics).toContain('CCH Configuration');
      expect(diagnostics).toContain('✅'); // Should have at least some passing checks
    });

    it('should report system information', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      expect(diagnostics).toMatch(/Platform: \w+/);
      expect(diagnostics).toMatch(/Node Version: v\d+/);
      expect(diagnostics).toMatch(/CCH Version: \d+\.\d+\.\d+/);
    });

    it('should check configuration status', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      expect(diagnostics).toContain('CCH Data Directory');
      expect(diagnostics).toContain(testDataDir); // Should use our test directory
    });
  });

  describe('View Logs Tool', () => {
    it('should retrieve logs with default parameters', async () => {
      const result = await client.callTool('view-logs');
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      
      const logs = result.content[0].text;
      expect(logs).toContain('Claude Code Helper Logs');
      expect(logs).toContain('Log File:');
    });

    it('should filter logs by level', async () => {
      // First, generate some logs by calling other tools
      await client.callTool('doctor');
      
      // Then filter for INFO level
      const result = await client.callTool('view-logs', {
        lines: 20,
        level: 'INFO'
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Filtered by level: INFO');
    });

    it('should search logs by text', async () => {
      const result = await client.callTool('view-logs', {
        search: 'MCP',
        lines: 10
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Searched for: "MCP"');
    });

    it('should handle invalid parameters gracefully', async () => {
      const result = await client.callTool('view-logs', {
        lines: -1, // Invalid
        level: 'INVALID' // Invalid
      });
      
      // Should still return something, not error
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
    });
  });

  describe('Reload MCP Tool', () => {
    it('should handle reload command', async () => {
      const result = await client.callTool('reload-mcp', {
        all: true
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      
      // Note: This might fail if Claude CLI is not installed
      // but it should at least return a proper response
      const output = result.content[0].text;
      expect(typeof output).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown tool gracefully', async () => {
      try {
        await client.callTool('unknown-tool');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('Unknown tool');
      }
    });

    it('should handle tool errors properly', async () => {
      // Try to view logs with an invalid date
      const result = await client.callTool('view-logs', {
        date: 'not-a-date'
      });
      
      // Should still work, just might not find logs
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent tool calls', async () => {
      const promises = [
        client.callTool('doctor'),
        client.callTool('view-logs', { lines: 5 }),
        client.listTools()
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(results[0].content[0].text).toContain('Diagnostics Report');
      expect(results[1].content[0].text).toContain('Claude Code Helper Logs');
      expect(results[2].tools).toBeInstanceOf(Array);
    });
  });
});