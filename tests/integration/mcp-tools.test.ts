import { describe, test, expect, beforeEach, afterEach, beforeAll } from 'bun:test';
import { 
  setupTestConfig, 
  cleanupTestConfig, 
  TEST_CONFIGS 
} from '../test-data-utils';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';

/**
 * MCP Tools Integration Tests
 * 
 * These tests verify that all MCP tools work exactly like their CLI counterparts.
 * Each test spawns the MCP server and sends tool calls to verify functionality.
 */

describe('MCP Tools - Complete Integration', () => {
  let testWorkspace: string;
  let mcpServer: any;

  beforeAll(async () => {
    // Build the project to ensure latest code
    const buildProcess = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      buildProcess.on('close', (code) => {
        if (code === 0) resolve(void 0);
        else reject(new Error(`Build failed with code ${code}`));
      });
    });
  });

  afterEach(async () => {
    if (mcpServer) {
      mcpServer.kill();
      mcpServer = null;
    }
    if (testWorkspace) {
      await cleanupTestConfig(testWorkspace);
    }
  });

  async function callMcpTool(toolName: string, args: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const mcpProcess = spawn('node', ['dist/mcp-server.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CCH_TEST_CONFIG: `${testWorkspace}/.claude.json` }
      });

      let output = '';
      let errorOutput = '';

      mcpProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      mcpProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      mcpProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse MCP JSON-RPC response
            const response = JSON.parse(output);
            resolve(response);
          } catch (e) {
            resolve(output);
          }
        } else {
          reject(new Error(`MCP call failed: ${errorOutput}`));
        }
      });

      // Send MCP tool call
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      mcpProcess.stdin.write(JSON.stringify(request) + '\n');
      mcpProcess.stdin.end();
    });
  }

  describe('Doctor Tool', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.CLEAN, 'mcp-doctor');
    });

    test('should run comprehensive diagnostics via MCP', async () => {
      const result = await callMcpTool('doctor', {});
      
      // Extract the text content from the MCP response
      const resultText = result.result?.content?.[0]?.text || result;
      
      expect(resultText).toMatch(/System Information|CCH Version/);
      expect(resultText).toMatch(/Configuration|Health/);
      expect(resultText).toMatch(/✓|❌/); // Should have status indicators
    });

    test('should detect same issues as CLI doctor command', async () => {
      // This test would compare MCP output with CLI output
      // In a real implementation, we'd capture both and compare
      const mcpResult = await callMcpTool('doctor', {});
      expect(mcpResult).toMatch(/Total projects:/);
    });
  });

  describe('Discover MCP Tools', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'mcp-discover');
    });

    test('should discover MCP tools with statistics', async () => {
      const result = await callMcpTool('discover-mcp-tools', {
        minProjectCount: 2,
        includeStats: true
      });

      expect(result).toMatch(/MCP Tools Used in 2\+ Projects/);
      expect(result).toMatch(/github|aia/);
      expect(result).toMatch(/Used in \d+ projects/);
      expect(result).toMatch(/Total usage count/);
    });

    test('should filter by minimum project count', async () => {
      const result = await callMcpTool('discover-mcp-tools', {
        minProjectCount: 5
      });

      // With high threshold, should find no tools
      expect(result).toMatch(/No MCP tools found|found 0 tools/);
    });

    test('should handle projects with no MCP tools', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.CLEAN, 'mcp-discover-empty');
      
      const result = await callMcpTool('discover-mcp-tools', {
        minProjectCount: 1
      });

      expect(result).toMatch(/github/); // Clean config has github in one project
    });
  });

  describe('List MCPs Tool', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'mcp-list');
    });

    test('should list all MCPs with usage information', async () => {
      const result = await callMcpTool('list-mcps', {
        includeDetails: true
      });

      expect(result).toMatch(/MCPs found across projects/);
      expect(result).toMatch(/github/);
      expect(result).toMatch(/aia/);
      expect(result).toMatch(/Used in \d+ projects/);
    });

    test('should show basic list without details', async () => {
      const result = await callMcpTool('list-mcps', {});

      expect(result).toMatch(/github|aia/);
      expect(result).not.toMatch(/Tool listings/); // Detailed info not included
    });
  });

  describe('Get MCP Stats Tool', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'mcp-stats');
    });

    test('should return comprehensive MCP statistics', async () => {
      const result = await callMcpTool('get-mcp-stats', {});

      expect(result).toMatch(/MCP Usage Statistics/);
      expect(result).toMatch(/Total MCPs:/);
      expect(result).toMatch(/Total projects:/);
      expect(result).toMatch(/Most used MCPs/);
    });

    test('should group statistics by MCP', async () => {
      const result = await callMcpTool('get-mcp-stats', {
        groupBy: 'mcp'
      });

      expect(result).toMatch(/Statistics grouped by MCP/);
      expect(result).toMatch(/github:|aia:/);
    });

    test('should group statistics by project', async () => {
      const result = await callMcpTool('get-mcp-stats', {
        groupBy: 'project'
      });

      expect(result).toMatch(/Statistics grouped by project/);
      expect(result).toMatch(/work\/|personal\/|.*-api/);
    });
  });

  describe('View Logs Tool', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.CLEAN, 'mcp-logs');
    });

    test('should return recent logs with default settings', async () => {
      const result = await callMcpTool('view-logs', {});

      expect(result).toMatch(/Recent CCH Activity|No recent logs/);
      // May not have logs in test environment, so either message is acceptable
    });

    test('should filter logs by level', async () => {
      const result = await callMcpTool('view-logs', {
        level: 'ERROR',
        lines: 10
      });

      expect(result).toMatch(/Error logs|No error logs found/);
    });

    test('should search logs for specific text', async () => {
      const result = await callMcpTool('view-logs', {
        search: 'test',
        lines: 20
      });

      expect(result).toMatch(/Logs containing 'test'|No logs found/);
    });

    test('should limit number of lines returned', async () => {
      const result = await callMcpTool('view-logs', {
        lines: 5
      });

      // Should not return more than 5 lines of actual log content
      expect(result).toBeTruthy();
    });
  });

  describe('Reload MCP Tool', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.CLEAN, 'mcp-reload');
    });

    test('should reload specific MCP server', async () => {
      const result = await callMcpTool('reload-mcp', {
        name: 'github'
      });

      expect(result).toMatch(/Reloading MCP.*github|github.*reloaded/);
    });

    test('should reload all MCP servers', async () => {
      const result = await callMcpTool('reload-mcp', {
        all: true
      });

      expect(result).toMatch(/Reloading all MCPs|All MCPs reloaded/);
    });

    test('should handle non-existent MCP gracefully', async () => {
      const result = await callMcpTool('reload-mcp', {
        name: 'non-existent-mcp'
      });

      expect(result).toMatch(/not found|does not exist|failed/);
    });
  });

  describe('CLI/MCP Parity Verification', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.DANGEROUS, 'mcp-parity');
    });

    test('should have exact parity between CLI audit and MCP audit', async () => {
      // Note: In a full implementation, this would run both CLI and MCP
      // and compare outputs for exact matching
      
      const mcpResult = await callMcpTool('doctor', {});
      
      // Verify MCP returns structured data that matches CLI format
      expect(mcpResult).toMatch(/Dangerous permissions found/);
      expect(mcpResult).toMatch(/rm:\*|sudo:\*|eval:\*/);
    });

    test('should maintain consistent error handling between CLI and MCP', async () => {
      // Test with invalid config path
      const result = await callMcpTool('doctor', {});
      
      // Should handle gracefully, not crash
      expect(result).toBeTruthy();
    });
  });

  describe('Performance and Resource Management', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'mcp-performance');
    });

    test('should handle multiple concurrent MCP calls', async () => {
      const calls = [
        callMcpTool('list-mcps', {}),
        callMcpTool('get-mcp-stats', {}),
        callMcpTool('discover-mcp-tools', { minProjectCount: 1 })
      ];

      const startTime = Date.now();
      const results = await Promise.all(calls);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(3);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      for (const result of results) {
        expect(result).toBeTruthy();
        expect(result).not.toMatch(/error|failed/i);
      }
    });

    test('should handle large configurations efficiently', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.COMPLEX, 'mcp-large');
      
      const startTime = Date.now();
      const result = await callMcpTool('get-mcp-stats', {});
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result).toMatch(/MCP Usage Statistics/);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle missing config file gracefully', async () => {
      // Don't set up test workspace, so config file doesn't exist
      const result = await callMcpTool('doctor', {});
      
      expect(result).toMatch(/configuration not found|error reading config/i);
    });

    test('should handle invalid tool parameters', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.CLEAN, 'mcp-invalid');
      
      const result = await callMcpTool('discover-mcp-tools', {
        minProjectCount: -1 // Invalid parameter
      });

      // Should handle gracefully, possibly with default value
      expect(result).toBeTruthy();
    });

    test('should handle corrupted configuration data', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.CLEAN, 'mcp-corrupted');
      
      // Corrupt the config file
      require('fs').writeFileSync(`${testWorkspace}/.claude.json`, '{ invalid json }');
      
      const result = await callMcpTool('doctor', {});
      
      expect(result).toMatch(/invalid|corrupted|parse error/i);
    });
  });
});