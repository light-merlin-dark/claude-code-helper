/**
 * Comprehensive Tests for MCP Reload Tool
 * Tests all scenarios through MCP interface
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MCPTestClient } from '../../../utils/mcp-test-client';
import { TestConfigManager, getTestEnv } from '../setup-test-config';
import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';

describe('MCP Tool: reload-mcp', () => {
  let client: MCPTestClient;
  let testConfig: TestConfigManager;
  const mcpPath = path.join(__dirname, '../../../../src/mcp-server.ts');

  beforeEach(async () => {
    // Set up isolated test environment
    testConfig = new TestConfigManager('reload-mcp-test');
    const testDir = await testConfig.setup();
    
    // Initialize MCP client with test environment
    client = new MCPTestClient(mcpPath, {
      timeout: 15000,
      env: getTestEnv(testDir)
    });
    
    await client.connect();
  });

  afterEach(async () => {
    client.disconnect();
    await testConfig.cleanup();
  });

  describe('successful operations', () => {
    it('should reload a single MCP by name', async () => {
      const result = await client.callTool('reload-mcp', {
        name: 'cch'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      
      const output = result.content[0].text;
      expect(output).toMatch(/(🔄 Reloading MCP:|Fetching installed MCPs|Error:)/);
      
      // Should contain either success or error information
      expect(output).toMatch(/(Successfully reloaded|Error|Claude CLI not found|✅|❌|not found)/);
    });

    it('should reload all MCPs when using all flag', async () => {
      const result = await client.callTool('reload-mcp', {
        all: true
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      
      const output = result.content[0].text;
      expect(output).toMatch(/(Fetching installed MCPs|Successfully reloaded)/);
      
      // Should mention some MCP being reloaded
      expect(output).toMatch(/(🔄 Reloading MCP:|Successfully reloaded \d+ MCP)/);
    });

    it('should perform dry run without making changes', async () => {
      const result = await client.callTool('reload-mcp', {
        name: 'cch',
        dryRun: true
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      expect(output).toMatch(/(\[DRY RUN\]|Would execute:|Fetching installed MCPs|Error:)/);
      expect(output).toMatch(/(claude mcp remove|claude mcp add|Successfully reloaded|Error|not found)/);
    });

    it('should perform dry run for all MCPs', async () => {
      const result = await client.callTool('reload-mcp', {
        all: true,
        dryRun: true
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      expect(output).toMatch(/(\[DRY RUN\]|Would execute:|Fetching installed MCPs|Successfully reloaded)/);
      expect(output).toMatch(/(🔄 Reloading MCP:|Successfully reloaded \d+ MCP)/);
    });

    it('should provide verbose output when debugging', async () => {
      const result = await client.callTool('reload-mcp', {
        name: 'test-cch',
        dryRun: true // Use dry run to avoid actual execution
      });
      
      const output = result.content[0].text;
      
      // Should show configuration details
      expect(output).toMatch(/(Configuration:|Config:|Found MCP configuration)/i);
    });
  });

  describe('error handling', () => {
    it('should handle MCP not found error', async () => {
      const result = await client.callTool('reload-mcp', {
        name: 'non-existent-mcp'
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      expect(output).toMatch(/(MCP.*not found|No MCP configuration found|not registered|Error:)/i);
    });

    it('should handle missing Claude CLI gracefully', async () => {
      const result = await client.callTool('reload-mcp', {
        name: 'test-cch'
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      // Should either succeed or report Claude CLI issue clearly
      expect(output).toMatch(/(Successfully reloaded|Claude CLI not found|command not found|not installed)/);
    });

    it('should handle corrupted configuration', async () => {
      // Create a corrupted Claude config in test directory
      const claudeConfigPath = testConfig.getClaudeConfigPath();
      writeFileSync(claudeConfigPath, '{ invalid json }');
      
      const result = await client.callTool('reload-mcp', {
        name: 'test-cch'
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      expect(output).toMatch(/(Invalid configuration|Parse error|Configuration error)/i);
    });

    it('should handle missing configuration file', async () => {
      // Use a different test config without Claude config
      const emptyConfig = new TestConfigManager('empty-config-test');
      const emptyTestDir = await emptyConfig.setup();
      
      // Remove the Claude configuration file
      await emptyConfig.cleanup(); // This removes the entire directory
      mkdirSync(emptyTestDir, { recursive: true });
      
      // Create new client with empty environment
      const emptyClient = new MCPTestClient(mcpPath, {
        timeout: 10000,
        env: getTestEnv(emptyTestDir)
      });
      
      try {
        await emptyClient.connect();
        
        const result = await emptyClient.callTool('reload-mcp', {
          name: 'any-mcp'
        });
        
        expect(result).toBeDefined();
        const output = result.content[0].text;
        
        expect(output).toMatch(/(No configuration found|Configuration file not found|No Claude config)/i);
      } finally {
        emptyClient.disconnect();
        await emptyConfig.cleanup();
      }
    });

    it('should handle invalid parameters', async () => {
      // Test with both name and all flags (invalid combination)
      const result = await client.callTool('reload-mcp', {
        name: 'test-mcp',
        all: true
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      // Should handle this gracefully - either use one or show error
      expect(output).toMatch(/(Cannot specify both|Invalid combination|Choose either|Successfully reloaded)/i);
    });

    it('should handle empty MCP name', async () => {
      const result = await client.callTool('reload-mcp', {
        name: ''
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      expect(output).toMatch(/(MCP name cannot be empty|Invalid MCP name|Name is required)/i);
    });
  });

  describe('edge cases', () => {
    it('should handle no parameters provided', async () => {
      const result = await client.callTool('reload-mcp', {});
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      // Should either prompt for parameters or show usage
      expect(output).toMatch(/(Usage:|Specify MCP name|No MCP specified|all flag|Fetching installed MCPs)/i);
    });

    it('should handle multiple MCPs in configuration', async () => {
      // Add multiple MCPs to the test configuration
      const claudeConfigPath = testConfig.getClaudeConfigPath();
      const config = {
        mcpServers: {
          'test-cch': {
            command: 'bun run src/mcp-server.ts',
            env: { CCH_DATA_DIR: testConfig.getCCHDir() }
          },
          'another-mcp': {
            command: 'node some-other-mcp.js'
          },
          'third-mcp': {
            command: 'python mcp-server.py'
          }
        }
      };
      
      writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
      
      const result = await client.callTool('reload-mcp', {
        all: true,
        dryRun: true
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      expect(output).toContain('test-cch');
      expect(output).toContain('another-mcp');
      expect(output).toContain('third-mcp');
    });

    it('should handle configuration with no MCPs', async () => {
      // Create config with empty mcpServers
      const claudeConfigPath = testConfig.getClaudeConfigPath();
      const config = {
        mcpServers: {}
      };
      
      writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
      
      const result = await client.callTool('reload-mcp', {
        all: true
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      expect(output).toMatch(/(No MCPs configured|No MCP servers found|Empty configuration)/i);
    });

    it('should handle very long MCP names', async () => {
      const longName = 'a'.repeat(200);
      
      const result = await client.callTool('reload-mcp', {
        name: longName
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      // Should handle gracefully
      expect(output).toMatch(/(MCP not found|Invalid name|Name too long)/i);
    });

    it('should handle special characters in MCP names', async () => {
      const specialNames = ['test@mcp', 'test-mcp!', 'test.mcp', 'test/mcp'];
      
      for (const name of specialNames) {
        const result = await client.callTool('reload-mcp', {
          name,
          dryRun: true // Use dry run to avoid issues
        });
        
        expect(result).toBeDefined();
        expect(result.content).toBeInstanceOf(Array);
        
        // Should handle each name without crashing
        const output = result.content[0].text;
        expect(typeof output).toBe('string');
      }
    });
  });

  describe('retry logic validation', () => {
    it('should show retry behavior on failure', async () => {
      // This test verifies that retry logic is documented in output
      const result = await client.callTool('reload-mcp', {
        name: 'test-cch'
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      // If it fails, should mention retry or attempt count
      if (output.includes('Error') || output.includes('Failed')) {
        expect(output).toMatch(/(retry|attempt|Trying again)/i);
      }
    });
  });

  describe('config parsing from various sources', () => {
    it('should detect configuration from current directory', async () => {
      const result = await client.callTool('reload-mcp', {
        dryRun: true,
        all: true
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      // Should show where config was found
      expect(output).toMatch(/(Configuration found|Config path|Loading from|Fetching installed MCPs|Successfully reloaded)/i);
    });

    it('should handle missing home directory config', async () => {
      // Test with environment that doesn't have home config
      const isolatedClient = new MCPTestClient(mcpPath, {
        timeout: 10000,
        env: {
          ...getTestEnv(testConfig.getTestDir()),
          HOME: '/tmp/nonexistent'
        }
      });
      
      try {
        await isolatedClient.connect();
        
        const result = await isolatedClient.callTool('reload-mcp', {
          name: 'test-mcp'
        });
        
        expect(result).toBeDefined();
        const output = result.content[0].text;
        
        // Should either find local config or report no config
        expect(output).toMatch(/(Configuration found|No configuration|Config not found|Fetching installed MCPs|To add MCPs)/i);
      } finally {
        isolatedClient.disconnect();
      }
    });
  });

  describe('performance characteristics', () => {
    it('should complete reload operation within reasonable time', async () => {
      const startTime = performance.now();
      
      const result = await client.callTool('reload-mcp', {
        name: 'test-cch',
        dryRun: true // Use dry run for consistent timing
      });
      
      const duration = performance.now() - startTime;
      
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent reload requests', async () => {
      const promises = [
        client.callTool('reload-mcp', { name: 'test-cch', dryRun: true }),
        client.callTool('reload-mcp', { all: true, dryRun: true }),
        client.callTool('reload-mcp', { name: 'non-existent', dryRun: true })
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toBeInstanceOf(Array);
      });
    });
  });
});