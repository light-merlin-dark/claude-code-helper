/**
 * Performance Tests for All MCP Tools
 * Tests response times, memory usage, and throughput
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MCPTestClient } from '../../../utils/mcp-test-client';
import { TestConfigManager, getTestEnv } from '../setup-test-config';
import path from 'path';
import { writeFileSync } from 'fs';

describe('MCP Tools Performance Tests', () => {
  let client: MCPTestClient;
  let testConfig: TestConfigManager;
  const mcpPath = path.join(__dirname, '../../../../src/mcp-server.ts');

  // Performance thresholds (in milliseconds)
  const PERFORMANCE_THRESHOLDS = {
    doctor: 5000,      // Doctor should complete within 5 seconds
    'view-logs': 3000, // View logs should complete within 3 seconds
    'reload-mcp': 10000 // Reload MCP might take longer due to external calls
  };

  beforeEach(async () => {
    // Set up isolated test environment
    testConfig = new TestConfigManager('performance-test');
    const testDir = await testConfig.setup();
    
    // Create realistic test data
    const logFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
    const largeLogContent = generateLargeLogFile(5000); // 5000 log entries
    writeFileSync(logFile, largeLogContent);
    
    // Initialize MCP client with test environment
    client = new MCPTestClient(mcpPath, {
      timeout: 30000, // Longer timeout for performance tests
      env: getTestEnv(testDir)
    });
    
    await client.connect();
  });

  afterEach(async () => {
    client.disconnect();
    await testConfig.cleanup();
  });

  function generateLargeLogFile(entries: number): string {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const messages = [
      'MCP server started',
      'Configuration loaded successfully',
      'Tool executed: doctor',
      'Permission check passed',
      'Connection established with client',
      'Request processed successfully',
      'Error processing user request',
      'Warning: deprecated feature used',
      'Debug: internal state changed',
      'Info: user performed action',
      'System memory usage: 45% of 8GB',
      'Database connection established',
      'Cache hit ratio: 85%',
      'Network latency: 15ms',
      'File system operation completed'
    ];
    
    const logEntries = [];
    const now = new Date();
    
    for (let i = 0; i < entries; i++) {
      const timestamp = new Date(now.getTime() - (entries - i) * 1000); // 1 second apart
      const level = levels[Math.floor(Math.random() * levels.length)];
      const message = messages[Math.floor(Math.random() * messages.length)];
      
      logEntries.push(`${timestamp.toISOString()} [${level}] ${message} (entry ${i + 1})`);
    }
    
    return logEntries.join('\n');
  }

  describe('response time benchmarks', () => {
    it('should complete doctor tool within performance threshold', async () => {
      const iterations = 5;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const result = await client.callTool('doctor');
        const duration = performance.now() - startTime;
        
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('Diagnostics Report');
        
        times.push(duration);
      }
      
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Doctor tool - Average: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.doctor);
      expect(maxTime).toBeLessThan(PERFORMANCE_THRESHOLDS.doctor * 1.5); // Max can be 50% higher
    });

    it('should complete view-logs tool within performance threshold', async () => {
      const testCases = [
        { lines: 10 },
        { lines: 50 },
        { lines: 100 },
        { level: 'ERROR' },
        { search: 'MCP' },
        { lines: 25, level: 'INFO' }
      ];
      
      for (const testCase of testCases) {
        const startTime = performance.now();
        const result = await client.callTool('view-logs', testCase);
        const duration = performance.now() - startTime;
        
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('Claude Code Helper Logs');
        
        console.log(`View-logs ${JSON.stringify(testCase)}: ${duration.toFixed(2)}ms`);
        
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS['view-logs']);
      }
    });

    it('should complete reload-mcp tool within performance threshold', async () => {
      const testCases = [
        { name: 'test-cch', dryRun: true },
        { all: true, dryRun: true },
        { name: 'non-existent', dryRun: true }
      ];
      
      for (const testCase of testCases) {
        const startTime = performance.now();
        const result = await client.callTool('reload-mcp', testCase);
        const duration = performance.now() - startTime;
        
        expect(result).toBeDefined();
        expect(result.content[0].text).toMatch(/(DRY RUN|Reloading|not found)/);
        
        console.log(`Reload-mcp ${JSON.stringify(testCase)}: ${duration.toFixed(2)}ms`);
        
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS['reload-mcp']);
      }
    });

    it('should show consistent performance across multiple runs', async () => {
      const tool = 'view-logs';
      const args = { lines: 20 };
      const iterations = 10;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await client.callTool(tool, args);
        const duration = performance.now() - startTime;
        times.push(duration);
      }
      
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const stdDev = Math.sqrt(
        times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length
      );
      
      console.log(`${tool} consistency - Avg: ${avgTime.toFixed(2)}ms, StdDev: ${stdDev.toFixed(2)}ms`);
      
      // Standard deviation should be reasonable (less than 50% of average)
      expect(stdDev).toBeLessThan(avgTime * 0.5);
    });
  });

  describe('large log file handling', () => {
    it('should handle 10k log entries efficiently', async () => {
      // Create very large log file
      const veryLargeLogFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const veryLargeLogContent = generateLargeLogFile(10000);
      writeFileSync(veryLargeLogFile, veryLargeLogContent);
      
      const testCases = [
        { lines: 50 },
        { lines: 100 },
        { level: 'ERROR' },
        { search: 'system' },
        { lines: 200, level: 'INFO' }
      ];
      
      for (const testCase of testCases) {
        const startTime = performance.now();
        const result = await client.callTool('view-logs', testCase);
        const duration = performance.now() - startTime;
        
        expect(result).toBeDefined();
        expect(duration).toBeLessThan(5000); // Should handle large files within 5 seconds
        
        console.log(`Large file view-logs ${JSON.stringify(testCase)}: ${duration.toFixed(2)}ms`);
      }
    });

    it('should handle log files with very long lines', async () => {
      // Create log with extremely long lines
      const longLineLogFile = path.join(testConfig.getCCHDir(), 'logs', 'cch.log');
      const longMessage = 'A'.repeat(10000); // 10k character message
      const longLineLog = Array(100).fill(null).map((_, i) => 
        `2024-01-01T12:${i.toString().padStart(2, '0')}:00.000Z [INFO] ${longMessage} (line ${i + 1})`
      ).join('\n');
      
      writeFileSync(longLineLogFile, longLineLog);
      
      const startTime = performance.now();
      const result = await client.callTool('view-logs', { lines: 10 });
      const duration = performance.now() - startTime;
      
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(3000); // Should handle long lines efficiently
      
      console.log(`Long lines view-logs: ${duration.toFixed(2)}ms`);
    });

    it('should maintain performance with complex filters', async () => {
      const complexFilters = [
        { level: 'ERROR', search: 'system', lines: 100 },
        { level: 'DEBUG', search: 'connection', lines: 50 },
        { search: 'memory', lines: 200 },
        { level: 'WARN', search: 'deprecated', lines: 75 }
      ];
      
      for (const filter of complexFilters) {
        const startTime = performance.now();
        const result = await client.callTool('view-logs', filter);
        const duration = performance.now() - startTime;
        
        expect(result).toBeDefined();
        expect(duration).toBeLessThan(4000); // Complex filters should still be fast
        
        console.log(`Complex filter ${JSON.stringify(filter)}: ${duration.toFixed(2)}ms`);
      }
    });
  });

  describe('concurrent request handling', () => {
    it('should handle multiple concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const requests = Array(concurrentRequests).fill(null).map((_, i) => ({
        tool: ['doctor', 'view-logs', 'reload-mcp'][i % 3],
        args: [
          {},
          { lines: 10 + (i * 5) },
          { name: 'test-cch', dryRun: true }
        ][i % 3]
      }));
      
      const startTime = performance.now();
      
      const promises = requests.map(req => 
        client.callTool(req.tool, req.args)
      );
      
      const results = await Promise.all(promises);
      const totalDuration = performance.now() - startTime;
      
      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toBeInstanceOf(Array);
      });
      
      // Concurrent execution should be more efficient than sequential
      const avgTimePerRequest = totalDuration / concurrentRequests;
      console.log(`Concurrent execution - Total: ${totalDuration.toFixed(2)}ms, Avg per request: ${avgTimePerRequest.toFixed(2)}ms`);
      
      expect(totalDuration).toBeLessThan(20000); // 20 seconds for 10 concurrent requests
    });

    it('should maintain performance under sustained load', async () => {
      const loadTestDuration = 10000; // 10 seconds
      const requestInterval = 200; // Request every 200ms
      const requests: Promise<any>[] = [];
      
      const startTime = performance.now();
      let requestCount = 0;
      
      const loadTest = setInterval(() => {
        if (performance.now() - startTime > loadTestDuration) {
          clearInterval(loadTest);
          return;
        }
        
        requestCount++;
        const tools = ['doctor', 'view-logs'];
        const tool = tools[requestCount % tools.length];
        const args = tool === 'view-logs' ? { lines: 10 } : {};
        
        requests.push(client.callTool(tool, args));
      }, requestInterval);
      
      // Wait for load test to complete
      await new Promise(resolve => setTimeout(resolve, loadTestDuration + 1000));
      
      // Wait for all requests to complete
      const results = await Promise.all(requests);
      const totalTime = performance.now() - startTime;
      
      console.log(`Load test - ${results.length} requests in ${totalTime.toFixed(2)}ms`);
      
      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
      
      // Calculate throughput
      const throughput = (results.length / totalTime) * 1000; // requests per second
      console.log(`Throughput: ${throughput.toFixed(2)} requests/second`);
      
      expect(throughput).toBeGreaterThan(1); // Should handle at least 1 request per second
    });

    it('should handle burst traffic without degradation', async () => {
      // Simulate burst traffic patterns
      const burstSizes = [5, 10, 15, 20];
      const burstResults: number[] = [];
      
      for (const burstSize of burstSizes) {
        const burstRequests = Array(burstSize).fill(null).map(() => 
          client.callTool('view-logs', { lines: 5 })
        );
        
        const burstStartTime = performance.now();
        const results = await Promise.all(burstRequests);
        const burstDuration = performance.now() - burstStartTime;
        
        expect(results).toHaveLength(burstSize);
        results.forEach(result => {
          expect(result).toBeDefined();
        });
        
        const avgTimePerRequest = burstDuration / burstSize;
        burstResults.push(avgTimePerRequest);
        
        console.log(`Burst ${burstSize} requests: ${burstDuration.toFixed(2)}ms total, ${avgTimePerRequest.toFixed(2)}ms avg`);
        
        // Brief pause between bursts
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Performance should not degrade significantly with larger bursts
      const firstBurstAvg = burstResults[0];
      const lastBurstAvg = burstResults[burstResults.length - 1];
      
      expect(lastBurstAvg).toBeLessThan(firstBurstAvg * 2); // Should not be more than 2x slower
    });
  });

  describe('memory usage monitoring', () => {
    it('should maintain reasonable memory usage during operations', async () => {
      // This test monitors memory usage indirectly through performance
      const memoryIntensiveOperations = [
        client.callTool('doctor'),
        client.callTool('view-logs', { lines: 1000 }),
        client.callTool('view-logs', { search: 'test' }),
        client.callTool('reload-mcp', { all: true, dryRun: true })
      ];
      
      const startTime = performance.now();
      
      // Execute operations sequentially to monitor individual impact
      for (const operation of memoryIntensiveOperations) {
        const opStartTime = performance.now();
        const result = await operation;
        const opDuration = performance.now() - opStartTime;
        
        expect(result).toBeDefined();
        expect(opDuration).toBeLessThan(10000); // Each operation should complete reasonably fast
      }
      
      const totalDuration = performance.now() - startTime;
      console.log(`Memory intensive operations completed in ${totalDuration.toFixed(2)}ms`);
      
      expect(totalDuration).toBeLessThan(30000); // All operations within 30 seconds
    });

    it('should handle repeated operations without memory leaks', async () => {
      // Simulate repeated operations that could cause memory leaks
      const iterations = 20;
      const operationTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        // Mix of operations
        await client.callTool('view-logs', { lines: 20 });
        await client.callTool('doctor');
        
        const duration = performance.now() - startTime;
        operationTimes.push(duration);
        
        // Brief pause to allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Check if performance degrades over time (potential memory leak indicator)
      const firstHalf = operationTimes.slice(0, iterations / 2);
      const secondHalf = operationTimes.slice(iterations / 2);
      
      const firstHalfAvg = firstHalf.reduce((sum, time) => sum + time, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, time) => sum + time, 0) / secondHalf.length;
      
      console.log(`Memory leak test - First half avg: ${firstHalfAvg.toFixed(2)}ms, Second half avg: ${secondHalfAvg.toFixed(2)}ms`);
      
      // Performance shouldn't degrade significantly (within 50% tolerance)
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 1.5);
    });
  });

  describe('tool initialization performance', () => {
    it('should initialize MCP connection quickly', async () => {
      // Test connection establishment time
      const newClient = new MCPTestClient(mcpPath, {
        timeout: 10000,
        env: getTestEnv(testConfig.getTestDir())
      });
      
      const startTime = performance.now();
      await newClient.connect();
      const connectionTime = performance.now() - startTime;
      
      console.log(`MCP connection established in ${connectionTime.toFixed(2)}ms`);
      
      expect(connectionTime).toBeLessThan(5000); // Should connect within 5 seconds
      
      // Test first tool call after connection
      const firstCallStart = performance.now();
      const result = await newClient.listTools();
      const firstCallTime = performance.now() - firstCallStart;
      
      console.log(`First tool call completed in ${firstCallTime.toFixed(2)}ms`);
      
      expect(result).toBeDefined();
      expect(result.tools).toBeInstanceOf(Array);
      expect(firstCallTime).toBeLessThan(3000); // First call should be fast
      
      newClient.disconnect();
    });

    it('should handle rapid reconnections efficiently', async () => {
      const reconnectionCount = 5;
      const reconnectionTimes: number[] = [];
      
      for (let i = 0; i < reconnectionCount; i++) {
        const testClient = new MCPTestClient(mcpPath, {
          timeout: 10000,
          env: getTestEnv(testConfig.getTestDir())
        });
        
        const startTime = performance.now();
        await testClient.connect();
        const result = await testClient.callTool('view-logs', { lines: 5 });
        testClient.disconnect();
        const totalTime = performance.now() - startTime;
        
        expect(result).toBeDefined();
        reconnectionTimes.push(totalTime);
        
        console.log(`Reconnection ${i + 1}: ${totalTime.toFixed(2)}ms`);
      }
      
      const avgReconnectionTime = reconnectionTimes.reduce((sum, time) => sum + time, 0) / reconnectionTimes.length;
      console.log(`Average reconnection time: ${avgReconnectionTime.toFixed(2)}ms`);
      
      expect(avgReconnectionTime).toBeLessThan(8000); // Average should be reasonable
    });
  });
});