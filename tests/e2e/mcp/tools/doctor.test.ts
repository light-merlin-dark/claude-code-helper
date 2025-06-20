/**
 * Comprehensive Tests for MCP Doctor Tool
 * Tests full diagnostic testing through MCP interface
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MCPTestClient } from '../../../utils/mcp-test-client';
import { TestConfigManager, getTestEnv } from '../setup-test-config';
import path from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

describe('MCP Tool: doctor', () => {
  let client: MCPTestClient;
  let testConfig: TestConfigManager;
  const mcpPath = path.join(__dirname, '../../../../src/mcp-server.ts');

  beforeEach(async () => {
    // Set up isolated test environment
    testConfig = new TestConfigManager('doctor-test');
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
    it('should run diagnostics successfully', async () => {
      const result = await client.callTool('doctor');
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      
      const diagnostics = result.content[0].text;
      expect(diagnostics).toContain('Claude Code Helper Diagnostics Report');
      expect(diagnostics).toContain('System Information');
      expect(diagnostics).toContain('CCH Configuration');
      expect(diagnostics).toMatch(/✅|❌|⚠️/); // Should have status indicators
    });

    it('should report accurate system information', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Platform information
      expect(diagnostics).toMatch(/Platform: \w+/);
      expect(diagnostics).toMatch(/OS Version: .+/);
      expect(diagnostics).toMatch(/Architecture: \w+/);
      
      // Node.js information
      expect(diagnostics).toMatch(/Node Version: v\d+\.\d+\.\d+/);
      expect(diagnostics).toMatch(/Bun Version: \d+\.\d+\.\d+/);
      
      // CCH version information
      expect(diagnostics).toMatch(/CCH Version: \d+\.\d+\.\d+/);
    });

    it('should detect CCH configuration correctly', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Configuration detection
      expect(diagnostics).toContain('CCH Configuration');
      expect(diagnostics).toContain('CCH Data Directory');
      expect(diagnostics).toContain(testConfig.getCCHDir());
      
      // Configuration file status
      expect(diagnostics).toMatch(/(Config File.*✅|Configuration.*found)/);
      expect(diagnostics).toMatch(/(Preferences.*✅|Preferences.*found)/);
      expect(diagnostics).toMatch(/(Permissions.*✅|Permissions.*found)/);
    });

    it('should analyze log files correctly', async () => {
      // Create some test log content
      const logDir = path.join(testConfig.getCCHDir(), 'logs');
      const logFile = path.join(logDir, 'cch.log');
      const testLogContent = `
2024-01-01T12:00:00.000Z [INFO] CCH started
2024-01-01T12:00:01.000Z [DEBUG] Configuration loaded
2024-01-01T12:00:02.000Z [ERROR] Test error message
2024-01-01T12:00:03.000Z [WARN] Test warning message
`.trim();
      
      writeFileSync(logFile, testLogContent);
      
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Log analysis
      expect(diagnostics).toContain('Log Analysis');
      expect(diagnostics).toMatch(/Log File.*found/);
      expect(diagnostics).toMatch(/Total log entries: \d+/);
      expect(diagnostics).toMatch(/ERROR.*\d+/);
      expect(diagnostics).toMatch(/WARN.*\d+/);
      expect(diagnostics).toMatch(/Recent errors|Recent warnings/);
    });

    it('should check MCP registration status', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // MCP status checking
      expect(diagnostics).toContain('MCP Registration');
      expect(diagnostics).toMatch(/(Claude CLI.*found|Claude CLI.*not found)/);
      expect(diagnostics).toMatch(/(MCP Server.*registered|MCP.*configuration)/);
    });

    it('should provide performance metrics', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Performance information
      expect(diagnostics).toMatch(/(Memory Usage|System Memory)/);
      expect(diagnostics).toMatch(/(CPU|Processor)/);
      expect(diagnostics).toMatch(/(Disk Space|Storage)/);
    });

    it('should show configuration validation', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Configuration validation
      expect(diagnostics).toContain('Configuration Validation');
      expect(diagnostics).toMatch(/(Valid|Invalid).*configuration/);
      expect(diagnostics).toMatch(/(Safety.*enabled|Safety.*disabled)/);
      expect(diagnostics).toMatch(/(Logging.*configured|Log level)/);
    });
  });

  describe('error handling', () => {
    it('should handle missing configuration files gracefully', async () => {
      // Remove configuration files
      rmSync(path.join(testConfig.getCCHDir(), 'config.json'), { force: true });
      rmSync(path.join(testConfig.getCCHDir(), 'preferences.json'), { force: true });
      
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      expect(diagnostics).toContain('❌'); // Should show error indicators
      expect(diagnostics).toMatch(/(Config.*not found|Configuration.*missing)/);
      expect(diagnostics).toMatch(/(Preferences.*not found|Preferences.*missing)/);
    });

    it('should handle corrupted configuration files', async () => {
      // Create corrupted config files
      writeFileSync(path.join(testConfig.getCCHDir(), 'config.json'), '{ invalid json }');
      writeFileSync(path.join(testConfig.getCCHDir(), 'preferences.json'), 'not json at all');
      
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      expect(diagnostics).toContain('❌'); // Should show error indicators
      expect(diagnostics).toMatch(/(Parse error|Invalid JSON|Corrupted)/);
    });

    it('should handle missing log directory', async () => {
      // Remove log directory
      rmSync(path.join(testConfig.getCCHDir(), 'logs'), { recursive: true, force: true });
      
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      expect(diagnostics).toMatch(/(Log directory.*not found|No logs found)/);
    });

    it('should handle permission issues', async () => {
      // This test simulates permission issues by testing error reporting
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Should at least try to report on permissions
      expect(diagnostics).toMatch(/(Permission|Access|Readable|Writable)/);
    });

    it('should handle network connectivity issues', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Should check for external dependencies
      expect(diagnostics).toMatch(/(Network|Connectivity|External)/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty log files', async () => {
      // Create empty log file
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      writeFileSync(logFile, '');
      
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      expect(diagnostics).toMatch(/(Empty log|No log entries|Log file empty)/);
    });

    it('should handle very large log files', async () => {
      // Create large log file
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const largeLogContent = Array(10000).fill('2024-01-01T12:00:00.000Z [INFO] Test message').join('\n');
      writeFileSync(logFile, largeLogContent);
      
      const startTime = performance.now();
      const result = await client.callTool('doctor');
      const duration = performance.now() - startTime;
      
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(10000); // Should handle large files efficiently
      
      const diagnostics = result.content[0].text;
      expect(diagnostics).toMatch(/Total log entries: \d+/);
    });

    it('should handle unusual log formats', async () => {
      // Create log with unusual format
      const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const unusualLogContent = `
This is not a standard log format
Some random text here
2024-01-01 [INFO] Mixed format
Invalid timestamp line
`.trim();
      
      writeFileSync(logFile, unusualLogContent);
      
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Should handle gracefully without crashing
      expect(diagnostics).toContain('Log Analysis');
    });

    it('should handle missing system information', async () => {
      // Test with limited environment
      const limitedClient = new MCPTestClient(mcpPath, {
        timeout: 10000,
        env: {
          CCH_DATA_DIR: testConfig.getCCHDir(),
          PATH: '' // Limited PATH
        }
      });
      
      try {
        await limitedClient.connect();
        
        const result = await limitedClient.callTool('doctor');
        const diagnostics = result.content[0].text;
        
        // Should still provide basic system info
        expect(diagnostics).toContain('System Information');
      } finally {
        limitedClient.disconnect();
      }
    });

    it('should handle multiple CCH installations', async () => {
      // Simulate multiple CCH configurations
      const additionalCCHDir = path.join(testConfig.getTestDir(), '.cch2');
      mkdirSync(additionalCCHDir, { recursive: true });
      writeFileSync(path.join(additionalCCHDir, 'config.json'), '{"version": "1.0.0"}');
      
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Should detect the current CCH installation
      expect(diagnostics).toContain(testConfig.getCCHDir());
    });
  });

  describe('performance testing', () => {
    it('should complete diagnostic scan within reasonable time', async () => {
      const startTime = performance.now();
      
      const result = await client.callTool('doctor');
      
      const duration = performance.now() - startTime;
      
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should handle multiple concurrent diagnostic requests', async () => {
      const promises = Array(5).fill(null).map(() => client.callTool('doctor'));
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('Diagnostics Report');
      });
    });

    it('should provide consistent results across multiple runs', async () => {
      const result1 = await client.callTool('doctor');
      const result2 = await client.callTool('doctor');
      
      const diagnostics1 = result1.content[0].text;
      const diagnostics2 = result2.content[0].text;
      
      // Core information should be consistent
      const extractVersion = (text: string) => text.match(/CCH Version: ([\d.]+)/)?.[1];
      const extractPlatform = (text: string) => text.match(/Platform: (\w+)/)?.[1];
      
      expect(extractVersion(diagnostics1)).toBe(extractVersion(diagnostics2));
      expect(extractPlatform(diagnostics1)).toBe(extractPlatform(diagnostics2));
    });
  });

  describe('output formatting', () => {
    it('should provide well-formatted output with clear sections', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      // Should have clear section headers
      expect(diagnostics).toMatch(/=+.*Diagnostics Report.*=+/);
      expect(diagnostics).toMatch(/(System Information|CCH Configuration|Log Analysis)/);
      
      // Should use consistent formatting
      expect(diagnostics).toMatch(/✅|❌|⚠️/); // Status indicators
      expect(diagnostics).toMatch(/[┌┐└┘│─]/); // Box drawing characters
    });

    it('should include summary section', async () => {
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      expect(diagnostics).toMatch(/(Summary|Overall Status|Health Check)/);
      expect(diagnostics).toMatch(/(✅.*healthy|❌.*issues|⚠️.*warnings)/);
    });

    it('should provide actionable recommendations', async () => {
      // Create some fixable issues
      rmSync(path.join(testConfig.getCCHDir(), 'permissions.json'), { force: true });
      
      const result = await client.callTool('doctor');
      const diagnostics = result.content[0].text;
      
      expect(diagnostics).toMatch(/(Recommendations|Suggestions|To fix)/);
      expect(diagnostics).toMatch(/(Run.*command|Create.*file|Configure)/);
    });
  });
});