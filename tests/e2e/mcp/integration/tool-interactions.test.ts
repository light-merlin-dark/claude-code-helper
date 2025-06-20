/**
 * Integration Tests for MCP Tool Interactions
 * Tests workflows that involve multiple tools and their interactions
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MCPTestClient } from '../../../utils/mcp-test-client';
import { TestConfigManager, getTestEnv } from '../setup-test-config';
import path from 'path';
import { writeFileSync } from 'fs';

describe('MCP Tool Integration Tests', () => {
  let client: MCPTestClient;
  let testConfig: TestConfigManager;
  const mcpPath = path.join(__dirname, '../../../../src/mcp-server.ts');

  beforeEach(async () => {
    // Set up isolated test environment
    testConfig = new TestConfigManager('integration-test');
    const testDir = await testConfig.setup();
    
    // Create test log content for realistic scenarios
    const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
    const testLogContent = `
2024-01-01T12:00:00.000Z [INFO] CCH started successfully
2024-01-01T12:00:01.000Z [DEBUG] Configuration loaded from ${testConfig.getCCHDir()}
2024-01-01T12:00:02.000Z [INFO] MCP server initialized
2024-01-01T12:00:03.000Z [WARN] Test warning for integration testing
2024-01-01T12:00:04.000Z [ERROR] Test error for integration testing
2024-01-01T12:00:05.000Z [INFO] Tool execution: doctor
2024-01-01T12:00:06.000Z [DEBUG] System diagnostics completed
2024-01-01T12:00:07.000Z [INFO] Tool execution: view-logs
2024-01-01T12:00:08.000Z [INFO] MCP reload requested
2024-01-01T12:00:09.000Z [ERROR] Failed to reload MCP: test-error
2024-01-01T12:00:10.000Z [INFO] Integration test log entry
`.trim();
    
    writeFileSync(logFile, testLogContent);
    
    // Initialize MCP client with test environment
    client = new MCPTestClient(mcpPath, {
      timeout: 20000,
      env: getTestEnv(testDir)
    });
    
    await client.connect();
  });

  afterEach(async () => {
    client.disconnect();
    await testConfig.cleanup();
  });

  describe('doctor → view-logs workflow', () => {
    it('should run doctor then examine logs for any reported issues', async () => {
      // Step 1: Run doctor to get system status
      const doctorResult = await client.callTool('doctor');
      
      expect(doctorResult).toBeDefined();
      const diagnostics = doctorResult.content[0].text;
      
      // Step 2: Check if doctor reported any errors
      const hasErrors = diagnostics.includes('❌') || diagnostics.includes('ERROR');
      
      // Step 3: If errors found, examine logs for details
      if (hasErrors) {
        const logsResult = await client.callTool('view-logs', {
          level: 'ERROR',
          lines: 20
        });
        
        expect(logsResult).toBeDefined();
        const logs = logsResult.content[0].text;
        
        expect(logs).toContain('Filtered by level: ERROR');
        
        // Should find related error entries
        if (logs.includes('[ERROR]')) {
          expect(logs).toMatch(/test-error|integration|failed/i);
        }
      }
      
      // Step 4: Also check for warnings
      const warningLogsResult = await client.callTool('view-logs', {
        level: 'WARN',
        lines: 10
      });
      
      expect(warningLogsResult).toBeDefined();
      const warningLogs = warningLogsResult.content[0].text;
      expect(warningLogs).toContain('Filtered by level: WARN');
    });

    it('should analyze doctor output and search logs for specific issues', async () => {
      // Step 1: Run comprehensive diagnostics
      const doctorResult = await client.callTool('doctor');
      const diagnostics = doctorResult.content[0].text;
      
      // Step 2: Extract potential issue keywords from doctor output
      const issueKeywords = ['error', 'fail', 'miss', 'corrupt', 'invalid'];
      const foundKeywords = issueKeywords.filter(keyword => 
        diagnostics.toLowerCase().includes(keyword)
      );
      
      // Step 3: Search logs for each found issue
      for (const keyword of foundKeywords) {
        const searchResult = await client.callTool('view-logs', {
          search: keyword,
          lines: 15
        });
        
        expect(searchResult).toBeDefined();
        const logs = searchResult.content[0].text;
        expect(logs).toContain(`Searched for: "${keyword}"`);
      }
    });

    it('should create diagnostic report with log correlation', async () => {
      // Step 1: Get system diagnostics
      const doctorResult = await client.callTool('doctor');
      
      // Step 2: Get recent logs
      const recentLogsResult = await client.callTool('view-logs', {
        lines: 30
      });
      
      // Step 3: Get error logs specifically
      const errorLogsResult = await client.callTool('view-logs', {
        level: 'ERROR',
        lines: 10
      });
      
      // All results should be available for correlation
      expect(doctorResult).toBeDefined();
      expect(recentLogsResult).toBeDefined();
      expect(errorLogsResult).toBeDefined();
      
      const diagnostics = doctorResult.content[0].text;
      const recentLogs = recentLogsResult.content[0].text;
      const errorLogs = errorLogsResult.content[0].text;
      
      // Should be able to correlate information
      expect(diagnostics).toContain('Diagnostics Report');
      expect(recentLogs).toContain('Claude Code Helper Logs');
      expect(errorLogs).toContain('Filtered by level: ERROR');
    });
  });

  describe('reload-mcp → doctor verification workflow', () => {
    it('should reload MCP then verify system health', async () => {
      // Step 1: Attempt MCP reload (dry run for safety)
      const reloadResult = await client.callTool('reload-mcp', {
        name: 'test-cch',
        dryRun: true
      });
      
      expect(reloadResult).toBeDefined();
      const reloadOutput = reloadResult.content[0].text;
      expect(reloadOutput).toContain('[DRY RUN]');
      
      // Step 2: Run diagnostics to verify system state
      const doctorResult = await client.callTool('doctor');
      
      expect(doctorResult).toBeDefined();
      const diagnostics = doctorResult.content[0].text;
      
      // Should show system status after reload attempt
      expect(diagnostics).toContain('MCP Registration');
      expect(diagnostics).toContain('System Information');
    });

    it('should handle reload failures and provide diagnostic guidance', async () => {
      // Step 1: Try to reload non-existent MCP
      const reloadResult = await client.callTool('reload-mcp', {
        name: 'non-existent-mcp'
      });
      
      expect(reloadResult).toBeDefined();
      const reloadOutput = reloadResult.content[0].text;
      
      // Step 2: Run doctor to check overall system health
      const doctorResult = await client.callTool('doctor');
      const diagnostics = doctorResult.content[0].text;
      
      // Step 3: Check logs for reload errors
      const logsResult = await client.callTool('view-logs', {
        search: 'reload',
        lines: 20
      });
      
      const logs = logsResult.content[0].text;
      
      // All tools should handle the workflow gracefully
      expect(reloadOutput).toMatch(/(not found|error|failed)/i);
      expect(diagnostics).toContain('Diagnostics Report');
      expect(logs).toContain('Searched for: "reload"');
    });

    it('should reload all MCPs and verify comprehensive system status', async () => {
      // Step 1: Reload all MCPs (dry run)
      const reloadResult = await client.callTool('reload-mcp', {
        all: true,
        dryRun: true
      });
      
      const reloadOutput = reloadResult.content[0].text;
      expect(reloadOutput).toContain('[DRY RUN]');
      expect(reloadOutput).toContain('Would reload all MCPs');
      
      // Step 2: Run comprehensive diagnostics
      const doctorResult = await client.callTool('doctor');
      const diagnostics = doctorResult.content[0].text;
      
      // Step 3: Check system logs for any issues
      const systemLogsResult = await client.callTool('view-logs', {
        search: 'system',
        lines: 25
      });
      
      // All operations should complete successfully
      expect(diagnostics).toContain('CCH Configuration');
      expect(systemLogsResult.content[0].text).toContain('Searched for: "system"');
    });
  });

  describe('concurrent tool execution', () => {
    it('should handle multiple tools running simultaneously', async () => {
      // Execute multiple tools concurrently
      const promises = [
        client.callTool('doctor'),
        client.callTool('view-logs', { lines: 10 }),
        client.callTool('reload-mcp', { name: 'test-cch', dryRun: true }),
        client.listTools()
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(4);
      
      // Verify each result
      expect(results[0].content[0].text).toContain('Diagnostics Report');
      expect(results[1].content[0].text).toContain('Claude Code Helper Logs');
      expect(results[2].content[0].text).toContain('[DRY RUN]');
      expect(results[3].tools).toBeInstanceOf(Array);
    });

    it('should maintain state consistency across concurrent operations', async () => {
      // Run same tool multiple times concurrently
      const promises = Array(5).fill(null).map(() => 
        client.callTool('doctor')
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      
      // All results should be consistent
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('System Information');
      });
      
      // Extract key information from each result
      const platforms = results.map(r => 
        r.content[0].text.match(/Platform: (\w+)/)?.[1]
      );
      
      // Platform should be consistent across all runs
      const uniquePlatforms = [...new Set(platforms)];
      expect(uniquePlatforms).toHaveLength(1);
    });

    it('should handle mixed concurrent operations without interference', async () => {
      // Mix of different tool operations
      const operations = [
        client.callTool('view-logs', { level: 'ERROR' }),
        client.callTool('doctor'),
        client.callTool('view-logs', { search: 'MCP' }),
        client.callTool('reload-mcp', { all: true, dryRun: true }),
        client.callTool('view-logs', { lines: 5 })
      ];
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(5);
      
      // Verify each result maintains its specific requirements
      expect(results[0].content[0].text).toContain('ERROR');
      expect(results[1].content[0].text).toContain('Diagnostics');
      expect(results[2].content[0].text).toContain('MCP');
      expect(results[3].content[0].text).toContain('DRY RUN');
      expect(results[4].content[0].text).toContain('Claude Code Helper Logs');
    });
  });

  describe('state persistence between calls', () => {
    it('should maintain log state across multiple tool calls', async () => {
      // Step 1: Generate some activity with doctor
      await client.callTool('doctor');
      
      // Step 2: Check logs for doctor activity
      const logsAfterDoctor = await client.callTool('view-logs', {
        search: 'doctor',
        lines: 20
      });
      
      // Step 3: Generate more activity
      await client.callTool('reload-mcp', { name: 'test-cch', dryRun: true });
      
      // Step 4: Check logs again
      const logsAfterReload = await client.callTool('view-logs', {
        search: 'reload',
        lines: 20
      });
      
      // Both log searches should find relevant entries
      const doctorLogs = logsAfterDoctor.content[0].text;
      const reloadLogs = logsAfterReload.content[0].text;
      
      expect(doctorLogs).toContain('Searched for: "doctor"');
      expect(reloadLogs).toContain('Searched for: "reload"');
    });

    it('should track MCP usage across multiple operations', async () => {
      // Perform multiple operations that should be logged
      const operations = [
        client.callTool('doctor'),
        client.callTool('view-logs', { lines: 5 }),
        client.callTool('reload-mcp', { name: 'test-cch', dryRun: true })
      ];
      
      for (const operation of operations) {
        await operation;
        
        // Small delay to ensure logging
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Check if usage is being tracked
      const finalDoctorResult = await client.callTool('doctor');
      const diagnostics = finalDoctorResult.content[0].text;
      
      // Should show evidence of MCP activity
      expect(diagnostics).toContain('MCP');
    });
  });

  describe('configuration changes during runtime', () => {
    it('should handle configuration updates between tool calls', async () => {
      // Step 1: Run initial diagnostics
      const initialDoctor = await client.callTool('doctor');
      const initialDiagnostics = initialDoctor.content[0].text;
      
      // Step 2: Modify configuration
      const configPath = path.join(testConfig.getCCHDir(), 'config.json');
      const updatedConfig = {
        version: '2.0.1', // Changed version
        dataDir: testConfig.getCCHDir(),
        logging: {
          level: 'info', // Changed log level
          format: 'json'
        }
      };
      
      writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
      
      // Step 3: Run diagnostics again (may need new client for config reload)
      const updatedDoctor = await client.callTool('doctor');
      const updatedDiagnostics = updatedDoctor.content[0].text;
      
      // Both should complete successfully
      expect(initialDiagnostics).toContain('CCH Configuration');
      expect(updatedDiagnostics).toContain('CCH Configuration');
    });

    it('should detect configuration corruption and provide guidance', async () => {
      // Step 1: Initial system check
      const initialCheck = await client.callTool('doctor');
      
      // Step 2: Corrupt configuration
      const configPath = path.join(testConfig.getCCHDir(), 'config.json');
      writeFileSync(configPath, '{ invalid json content }');
      
      // Step 3: Run diagnostics on corrupted config
      const corruptedCheck = await client.callTool('doctor');
      const diagnostics = corruptedCheck.content[0].text;
      
      // Step 4: Check logs for configuration errors
      const errorLogs = await client.callTool('view-logs', {
        level: 'ERROR',
        lines: 10
      });
      
      // Should handle gracefully and provide guidance
      expect(diagnostics).toMatch(/(Parse error|Invalid|Corrupted)/);
      expect(errorLogs.content[0].text).toContain('ERROR');
    });
  });

  describe('real-world workflow simulation', () => {
    it('should simulate new user onboarding workflow', async () => {
      // Simulate a new user checking system status
      
      // Step 1: Check overall system health
      const systemCheck = await client.callTool('doctor');
      expect(systemCheck).toBeDefined();
      
      // Step 2: Look at recent activity logs
      const recentActivity = await client.callTool('view-logs', {
        lines: 20
      });
      expect(recentActivity).toBeDefined();
      
      // Step 3: Check for any errors that need attention
      const errorCheck = await client.callTool('view-logs', {
        level: 'ERROR',
        lines: 10
      });
      expect(errorCheck).toBeDefined();
      
      // Step 4: Verify MCP configuration
      const mcpCheck = await client.callTool('reload-mcp', {
        all: true,
        dryRun: true
      });
      expect(mcpCheck).toBeDefined();
      
      // All steps should complete without issues
      expect(systemCheck.content[0].text).toContain('Diagnostics Report');
      expect(recentActivity.content[0].text).toContain('Claude Code Helper Logs');
      expect(errorCheck.content[0].text).toContain('Filtered by level: ERROR');
      expect(mcpCheck.content[0].text).toContain('[DRY RUN]');
    });

    it('should simulate troubleshooting workflow', async () => {
      // Simulate troubleshooting a reported issue
      
      // Step 1: Run comprehensive diagnostics
      const diagnostics = await client.callTool('doctor');
      const diagText = diagnostics.content[0].text;
      
      // Step 2: Look for specific error patterns
      const hasErrors = diagText.includes('❌') || diagText.includes('ERROR');
      
      if (hasErrors) {
        // Step 3: Examine recent error logs
        const errorLogs = await client.callTool('view-logs', {
          level: 'ERROR',
          lines: 25
        });
        
        // Step 4: Search for specific error terms
        const searchResult = await client.callTool('view-logs', {
          search: 'failed',
          lines: 15
        });
        
        expect(errorLogs).toBeDefined();
        expect(searchResult).toBeDefined();
      }
      
      // Step 5: Try MCP reload as potential fix
      const reloadAttempt = await client.callTool('reload-mcp', {
        all: true,
        dryRun: true
      });
      
      // Step 6: Verify system state after attempted fix
      const postFixCheck = await client.callTool('doctor');
      
      expect(reloadAttempt).toBeDefined();
      expect(postFixCheck).toBeDefined();
    });
  });

  describe('performance under load', () => {
    it('should maintain responsiveness during high activity', async () => {
      // Generate high activity with multiple rapid tool calls
      const rapidCalls = [];
      
      for (let i = 0; i < 10; i++) {
        rapidCalls.push(
          client.callTool('view-logs', { lines: 5 }),
          client.callTool('doctor'),
          client.callTool('reload-mcp', { name: 'test-cch', dryRun: true })
        );
      }
      
      const startTime = performance.now();
      const results = await Promise.all(rapidCalls);
      const duration = performance.now() - startTime;
      
      // Should handle load without excessive delays
      expect(duration).toBeLessThan(30000); // 30 seconds for 30 operations
      expect(results).toHaveLength(30);
      
      // All operations should complete successfully
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toBeInstanceOf(Array);
      });
    });
  });
});