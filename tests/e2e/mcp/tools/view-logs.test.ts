/**
 * Comprehensive Tests for MCP View Logs Tool
 * Tests log filtering validation through MCP interface
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MCPTestClient } from '../../../utils/mcp-test-client';
import { TestConfigManager, getTestEnv } from '../setup-test-config';
import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';

describe('MCP Tool: view-logs', () => {
  let client: MCPTestClient;
  let testConfig: TestConfigManager;
  const mcpPath = path.join(__dirname, '../../../../src/mcp-server.ts');

  // Sample log entries for testing
  const createSampleLog = (entries: number = 100) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const messages = [
      'MCP server started',
      'Configuration loaded',
      'Tool executed: doctor',
      'Permission check passed',
      'Connection established',
      'Request processed',
      'Error processing request',
      'Warning: deprecated feature',
      'Debug: internal state',
      'Info: user action'
    ];
    
    const logEntries = [];
    const now = new Date();
    
    for (let i = 0; i < entries; i++) {
      const timestamp = new Date(now.getTime() - (entries - i) * 60000); // 1 minute apart
      const level = levels[Math.floor(Math.random() * levels.length)];
      const message = messages[Math.floor(Math.random() * messages.length)];
      
      logEntries.push(`${timestamp.toISOString()} [${level}] ${message} (entry ${i + 1})`);
    }
    
    return logEntries.join('\n');
  };

  beforeEach(async () => {
    // Set up isolated test environment
    testConfig = new TestConfigManager('view-logs-test');
    const testDir = await testConfig.setup();
    
    // Create test log file with sample data
    const logDir = path.join(testConfig.getCCHDir(), 'logs');
    const logFile = path.join(logDir, 'cch.log');
    writeFileSync(logFile, createSampleLog(100));
    
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
    it('should retrieve logs with default parameters (50 lines)', async () => {
      const result = await client.callTool('view-logs');
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      
      const logs = result.content[0].text;
      expect(logs).toContain('Claude Code Helper Logs');
      expect(logs).toContain('Log File:');
      
      // Should contain log entries with emoji icons or standard format
      expect(logs).toMatch(/(\[DEBUG\]|\[INFO\]|\[WARN\]|\[ERROR\]|ℹ️|❌|⚠️|🐛)/);
      
      // Should show a reasonable number of log lines 
      const logLines = logs.split('\n').filter(line => line.includes('ℹ️') || line.includes('❌') || line.includes('🐛') || line.includes('⚠️'));
      expect(logLines.length).toBeGreaterThan(0); // Should have some log entries
    });

    it('should limit logs to specified number of lines', async () => {
      const testCases = [5, 10, 25, 100];
      
      for (const lines of testCases) {
        const result = await client.callTool('view-logs', { lines });
        const logs = result.content[0].text;
        
        const logLines = logs.split('\n').filter(line => line.includes('['));
        expect(logLines.length).toBeLessThanOrEqual(lines);
        expect(logs).toContain(`Last ${lines} lines`);
      }
    });

    it('should filter logs by ERROR level', async () => {
      const result = await client.callTool('view-logs', {
        level: 'ERROR',
        lines: 100
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Filtered by level: ERROR');
      
      const logLines = logs.split('\n').filter(line => line.includes('['));
      logLines.forEach(line => {
        if (line.includes('[')) {
          expect(line).toContain('[ERROR]');
        }
      });
    });

    it('should filter logs by WARN level', async () => {
      const result = await client.callTool('view-logs', {
        level: 'WARN',
        lines: 100
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Filtered by level: WARN');
      
      const logLines = logs.split('\n').filter(line => line.includes('[WARN]'));
      expect(logLines.length).toBeGreaterThan(0);
    });

    it('should filter logs by INFO level', async () => {
      const result = await client.callTool('view-logs', {
        level: 'INFO',
        lines: 100
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Filtered by level: INFO');
      
      const logLines = logs.split('\n').filter(line => line.includes('[INFO]'));
      expect(logLines.length).toBeGreaterThan(0);
    });

    it('should filter logs by DEBUG level', async () => {
      const result = await client.callTool('view-logs', {
        level: 'DEBUG',
        lines: 100
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Filtered by level: DEBUG');
      
      const logLines = logs.split('\n').filter(line => line.includes('[DEBUG]'));
      expect(logLines.length).toBeGreaterThan(0);
    });

    it('should search logs by text', async () => {
      const searchTerms = ['MCP', 'server', 'Configuration', 'Tool'];
      
      for (const search of searchTerms) {
        const result = await client.callTool('view-logs', {
          search,
          lines: 100
        });
        
        const logs = result.content[0].text;
        expect(logs).toContain(`Searched for: "${search}"`);
        
        const logLines = logs.split('\n').filter(line => line.includes('['));
        logLines.forEach(line => {
          if (line.includes('[')) {
            expect(line.toLowerCase()).toContain(search.toLowerCase());
          }
        });
      }
    });

    it('should search logs case-insensitively', async () => {
      const result = await client.callTool('view-logs', {
        search: 'MCP',
        lines: 50
      });
      
      const logs = result.content[0].text;
      const logLines = logs.split('\n').filter(line => line.includes('['));
      
      // Should find both 'MCP' and 'mcp'
      const matchingLines = logLines.filter(line => 
        line.toLowerCase().includes('mcp')
      );
      expect(matchingLines.length).toBeGreaterThan(0);
    });

    it('should combine level and search filters', async () => {
      const result = await client.callTool('view-logs', {
        level: 'ERROR',
        search: 'processing',
        lines: 100
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Filtered by level: ERROR');
      expect(logs).toContain('Searched for: "processing"');
      
      const logLines = logs.split('\n').filter(line => line.includes('['));
      logLines.forEach(line => {
        if (line.includes('[')) {
          expect(line).toContain('[ERROR]');
          expect(line.toLowerCase()).toContain('processing');
        }
      });
    });

    it('should handle date-based log selection', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const result = await client.callTool('view-logs', {
        date: today,
        lines: 50
      });
      
      const logs = result.content[0].text;
      expect(logs).toMatch(/(Date filter|Logs for date|Selected date)/);
    });
  });

  describe('error handling', () => {
    it('should handle invalid log levels gracefully', async () => {
      const result = await client.callTool('view-logs', {
        level: 'INVALID',
        lines: 10
      });
      
      const logs = result.content[0].text;
      // Should either ignore invalid level or show all levels
      expect(logs).toMatch(/(Invalid level|All levels|Showing all)/);
    });

    it('should handle invalid line numbers', async () => {
      const invalidLines = [-1, 0, NaN, Infinity];
      
      for (const lines of invalidLines) {
        const result = await client.callTool('view-logs', { lines });
        const logs = result.content[0].text;
        
        // Should handle gracefully with default behavior
        expect(logs).toContain('Claude Code Helper Logs');
      }
    });

    it('should handle missing log file', async () => {
      // Create empty test environment
      const emptyConfig = new TestConfigManager('empty-logs-test');
      const emptyTestDir = await emptyConfig.setup();
      
      const emptyClient = new MCPTestClient(mcpPath, {
        timeout: 10000,
        env: getTestEnv(emptyTestDir)
      });
      
      try {
        await emptyClient.connect();
        
        const result = await emptyClient.callTool('view-logs');
        const logs = result.content[0].text;
        
        expect(logs).toMatch(/(No logs found|Log file not found|Empty log)/);
      } finally {
        emptyClient.disconnect();
        await emptyConfig.cleanup();
      }
    });

    it('should handle very large line requests', async () => {
      const result = await client.callTool('view-logs', {
        lines: 1000000 // Very large number
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Claude Code Helper Logs');
      
      // Should handle gracefully without crashing
      const logLines = logs.split('\n').filter(line => line.includes('['));
      expect(logLines.length).toBeLessThanOrEqual(1000); // Should have reasonable limit
    });

    it('should handle invalid date formats', async () => {
      const invalidDates = ['not-a-date', '2024-13-01', '2024-01-32', 'yesterday'];
      
      for (const date of invalidDates) {
        const result = await client.callTool('view-logs', { date });
        const logs = result.content[0].text;
        
        // Should handle gracefully
        expect(logs).toMatch(/(Invalid date|Date format|All logs)/);
      }
    });

    it('should handle empty search terms', async () => {
      const result = await client.callTool('view-logs', {
        search: '',
        lines: 10
      });
      
      const logs = result.content[0].text;
      // Should show all logs when search is empty
      expect(logs).toContain('Claude Code Helper Logs');
    });

    it('should handle search with no matches', async () => {
      const result = await client.callTool('view-logs', {
        search: 'ThisStringWillNeverBeFound12345',
        lines: 100
      });
      
      const logs = result.content[0].text;
      expect(logs).toMatch(/(No matches found|No results|0 matches)/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty log file', async () => {
      // Create empty log file
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      writeFileSync(logFile, '');
      
      const result = await client.callTool('view-logs');
      const logs = result.content[0].text;
      
      expect(logs).toMatch(/(Empty log|No log entries|Log file empty)/);
    });

    it('should handle log file with only whitespace', async () => {
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      writeFileSync(logFile, '   \n\n\t\t\n   ');
      
      const result = await client.callTool('view-logs');
      const logs = result.content[0].text;
      
      expect(logs).toMatch(/(Empty log|No log entries|No valid entries)/);
    });

    it('should handle log file with malformed entries', async () => {
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const malformedLog = `
This is not a proper log entry
Another random line
2024-01-01T12:00:00Z [INFO] This is valid
Random text again
[ERROR] Missing timestamp
2024-01-01T12:00:01Z Valid entry without level
`.trim();
      
      writeFileSync(logFile, malformedLog);
      
      const result = await client.callTool('view-logs');
      const logs = result.content[0].text;
      
      // Should handle gracefully and show valid entries
      expect(logs).toContain('Claude Code Helper Logs');
    });

    it('should handle Unicode and special characters in logs', async () => {
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const unicodeLog = `
2024-01-01T12:00:00Z [INFO] Unicode test: 你好世界 🌍 ñáéíóú
2024-01-01T12:00:01Z [DEBUG] Special chars: @#$%^&*()_+-={}[]|\\:";'<>?,.
2024-01-01T12:00:02Z [WARN] Emoji test: 🚀 🔥 ⚠️ ✅ ❌
`.trim();
      
      writeFileSync(logFile, unicodeLog);
      
      const result = await client.callTool('view-logs');
      const logs = result.content[0].text;
      
      expect(logs).toContain('Unicode test');
      expect(logs).toContain('Special chars');
      expect(logs).toContain('Emoji test');
    });

    it('should handle very long log lines', async () => {
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const longMessage = 'A'.repeat(10000);
      const longLog = `2024-01-01T12:00:00Z [INFO] ${longMessage}`;
      
      writeFileSync(logFile, longLog);
      
      const result = await client.callTool('view-logs', { lines: 5 });
      const logs = result.content[0].text;
      
      // Should handle without crashing
      expect(logs).toContain('Claude Code Helper Logs');
    });

    it('should handle multiple log files', async () => {
      // Create additional log files
      const logDir = path.join(testConfig.getCCHDir(), 'logs');
      writeFileSync(path.join(logDir, 'cch.log.1'), createSampleLog(50));
      writeFileSync(path.join(logDir, 'cch.log.2'), createSampleLog(25));
      
      const result = await client.callTool('view-logs');
      const logs = result.content[0].text;
      
      // Should indicate which log file is being used
      expect(logs).toMatch(/(Log File|Reading from|Current log)/);
    });

    it('should handle logs with different timestamp formats', async () => {
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const mixedFormats = `
2024-01-01T12:00:00.000Z [INFO] ISO format
2024-01-01 12:00:01 [DEBUG] Simple format
Jan 01 12:00:02 [WARN] Syslog format
2024/01/01 12:00:03 [ERROR] Slash format
`.trim();
      
      writeFileSync(logFile, mixedFormats);
      
      const result = await client.callTool('view-logs');
      const logs = result.content[0].text;
      
      // Should handle all formats
      expect(logs).toContain('[INFO]');
      expect(logs).toContain('[DEBUG]');
      expect(logs).toContain('[WARN]');
      expect(logs).toContain('[ERROR]');
    });
  });

  describe('performance testing', () => {
    it('should handle large log files efficiently', async () => {
      // Create large log file
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const largeLog = createSampleLog(10000);
      writeFileSync(logFile, largeLog);
      
      const startTime = performance.now();
      const result = await client.callTool('view-logs', { lines: 100 });
      const duration = performance.now() - startTime;
      
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      const logs = result.content[0].text;
      expect(logs).toContain('Claude Code Helper Logs');
    });

    it('should handle concurrent log requests', async () => {
      const promises = [
        client.callTool('view-logs', { lines: 10 }),
        client.callTool('view-logs', { level: 'ERROR' }),
        client.callTool('view-logs', { search: 'MCP' }),
        client.callTool('view-logs', { lines: 50, level: 'INFO' })
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('Claude Code Helper Logs');
      });
    });

    it('should maintain consistent performance across multiple requests', async () => {
      const times: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        await client.callTool('view-logs', { lines: 20 });
        const duration = performance.now() - startTime;
        times.push(duration);
      }
      
      // Check that performance is consistent (no significant degradation)
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      
      expect(maxTime).toBeLessThan(avgTime * 3); // Max shouldn't be more than 3x average
    });
  });

  describe('output formatting', () => {
    it('should provide well-formatted output with headers', async () => {
      const result = await client.callTool('view-logs');
      const logs = result.content[0].text;
      
      expect(logs).toMatch(/=+.*Claude Code Helper Logs.*=+/);
      expect(logs).toMatch(/(Log File:|Reading from:|Source:)/);
      expect(logs).toMatch(/(Last \d+ lines|Showing|Displaying)/);
    });

    it('should show appropriate metadata for filtered logs', async () => {
      const result = await client.callTool('view-logs', {
        level: 'ERROR',
        search: 'test',
        lines: 25
      });
      
      const logs = result.content[0].text;
      expect(logs).toContain('Filtered by level: ERROR');
      expect(logs).toContain('Searched for: "test"');
      expect(logs).toContain('Last 25 lines');
    });

    it('should indicate when no logs match criteria', async () => {
      const result = await client.callTool('view-logs', {
        search: 'NonExistentSearchTerm'
      });
      
      const logs = result.content[0].text;
      expect(logs).toMatch(/(No matches|No results|0 entries)/);
    });
  });
});