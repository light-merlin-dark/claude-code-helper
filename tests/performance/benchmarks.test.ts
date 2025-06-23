import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { 
  setupTestConfig, 
  cleanupTestConfig, 
  TEST_CONFIGS,
  createCustomTestConfig 
} from '../test-data-utils';
import { audit } from '../../src/commands/audit';
import { 
  bulkAddPermission, 
  bulkRemovePermission,
  bulkAddTool 
} from '../../src/commands/bulk';
import { cleanHistory } from '../../src/commands/clean';

/**
 * Performance Benchmarks
 * 
 * These tests ensure CCH operations remain fast even with large configurations.
 * They establish performance baselines and catch regressions.
 */

describe('Performance Benchmarks', () => {
  let testWorkspace: string;

  afterEach(async () => {
    if (testWorkspace) {
      await cleanupTestConfig(testWorkspace);
    }
  });

  describe('Audit Performance', () => {
    test('should analyze large bloated configuration within time limit', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.BLOATED, 'perf-audit-bloated');
      
      const startTime = Date.now();
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });
      const duration = Date.now() - startTime;

      expect(result).toMatch(/Config Bloat:/);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
      
      console.log(`📊 Audit (bloated config): ${duration}ms`);
    });

    test('should analyze multi-project configuration efficiently', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'perf-audit-multi');
      
      const startTime = Date.now();
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });
      const duration = Date.now() - startTime;

      expect(result).toMatch(/Total projects: 10/);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      
      console.log(`📊 Audit (10 projects): ${duration}ms`);
    });

    test('should handle complex configuration with nested data', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.COMPLEX, 'perf-audit-complex');
      
      const startTime = Date.now();
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });
      const duration = Date.now() - startTime;

      expect(result).toMatch(/Project Tree:/);
      expect(duration).toBeLessThan(2500); // Should complete within 2.5 seconds
      
      console.log(`📊 Audit (complex config): ${duration}ms`);
    });

    test('should scale linearly with project count', async () => {
      // Test with different sized configurations
      const sizes = [5, 10, 20];
      const times: number[] = [];

      for (const size of sizes) {
        const config = generateLargeConfig(size);
        testWorkspace = await createCustomTestConfig(`perf-scale-${size}`, config);
        
        const startTime = Date.now();
        await audit({
          configPath: `${testWorkspace}/.claude.json`,
          testMode: true
        });
        const duration = Date.now() - startTime;
        
        times.push(duration);
        await cleanupTestConfig(testWorkspace);
        
        console.log(`📊 Audit (${size} projects): ${duration}ms`);
      }

      // Verify roughly linear scaling (not exponential)
      const scalingFactor = times[2] / times[0]; // 20 projects vs 5 projects
      expect(scalingFactor).toBeLessThan(8); // Should be less than 8x slower for 4x projects
    });
  });

  describe('Bulk Operations Performance', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'perf-bulk');
    });

    test('should add permission to all projects quickly', async () => {
      const startTime = Date.now();
      const result = await bulkAddPermission({
        permission: 'perf-test:*',
        all: true,
        testMode: true,
        dryRun: false
      });
      const duration = Date.now() - startTime;

      expect(result.projectsModified).toBe(10);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      
      console.log(`📊 Bulk add permission (10 projects): ${duration}ms`);
    });

    test('should remove dangerous permissions efficiently', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.DANGEROUS, 'perf-bulk-dangerous');
      
      const startTime = Date.now();
      const result = await bulkRemovePermission({
        dangerous: true,
        all: true,
        testMode: true,
        dryRun: false
      });
      const duration = Date.now() - startTime;

      expect(result.itemsRemoved).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1500); // Should complete within 1.5 seconds
      
      console.log(`📊 Bulk remove dangerous permissions: ${duration}ms`);
    });

    test('should handle pattern matching efficiently', async () => {
      const startTime = Date.now();
      const result = await bulkAddTool({
        tool: 'perf-tool',
        projects: ['work/*', '*-api'],
        testMode: true,
        dryRun: false
      });
      const duration = Date.now() - startTime;

      expect(result.projectsModified).toBe(6); // 3 work + 3 API projects
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      console.log(`📊 Bulk add tool with patterns: ${duration}ms`);
    });

    test('should batch multiple operations efficiently', async () => {
      const operations = [
        () => bulkAddPermission({
          permission: 'batch-1:*',
          all: true,
          testMode: true,
          dryRun: false
        }),
        () => bulkAddPermission({
          permission: 'batch-2:*',
          all: true,
          testMode: true,
          dryRun: false
        }),
        () => bulkAddTool({
          tool: 'batch-tool',
          all: true,
          testMode: true,
          dryRun: false
        })
      ];

      const startTime = Date.now();
      
      // Run operations sequentially
      for (const op of operations) {
        await op();
      }
      
      const sequentialTime = Date.now() - startTime;

      // Run operations in parallel
      const parallelStart = Date.now();
      await Promise.all(operations.map(op => op()));
      const parallelTime = Date.now() - parallelStart;

      console.log(`📊 Sequential operations: ${sequentialTime}ms`);
      console.log(`📊 Parallel operations: ${parallelTime}ms`);
      
      // Parallel should be faster (though not guaranteed due to file locking)
      expect(parallelTime).toBeLessThan(sequentialTime * 1.5);
    });
  });

  describe('History Cleaning Performance', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.BLOATED, 'perf-clean');
    });

    test('should clean large conversation history efficiently', async () => {
      const startTime = Date.now();
      const result = await cleanHistory({
        testMode: true,
        dryRun: false
      });
      const duration = Date.now() - startTime;

      expect(result.pastesRemoved).toBeGreaterThan(0);
      expect(result.sizeReduction).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      
      console.log(`📊 Clean history (${result.pastesRemoved} pastes): ${duration}ms`);
      console.log(`📊 Size reduction: ${(result.sizeReduction / 1024 / 1024).toFixed(1)} MB`);
    });

    test('should handle large pastes without memory issues', async () => {
      // Create config with very large pastes
      const config = {
        version: 1,
        projects: {
          "memory-test": {
            workspacePath: "/test/memory",
            bashCommands: ["npm:*"],
            mcpServers: {},
            history: [
              {
                role: "user",
                content: "Large paste test",
                pastedContents: {
                  "huge-paste": {
                    filename: "huge.txt",
                    content: "x".repeat(1000000) // 1MB of data
                  }
                }
              }
            ]
          }
        }
      };

      testWorkspace = await createCustomTestConfig('perf-memory', config);
      
      const startTime = Date.now();
      const result = await cleanHistory({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true,
        dryRun: false
      });
      const duration = Date.now() - startTime;

      expect(result.sizeReduction).toBeGreaterThan(900000); // Should remove ~1MB
      expect(duration).toBeLessThan(3000); // Should handle large data quickly
      
      console.log(`📊 Clean huge paste (1MB): ${duration}ms`);
    });
  });

  describe('Memory Usage and Resource Management', () => {
    test('should not leak memory during repeated operations', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'perf-memory');
      
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await audit({
          configPath: `${testWorkspace}/.claude.json`,
          testMode: true
        });
        const duration = Date.now() - startTime;
        times.push(duration);
      }

      // Times should remain relatively consistent (no memory leaks)
      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      console.log(`📊 Memory test - Avg: ${avgTime.toFixed(0)}ms, Min: ${minTime}ms, Max: ${maxTime}ms`);
      
      // Max time should not be more than 3x average (indicating memory issues)
      expect(maxTime).toBeLessThan(avgTime * 3);
    });

    test('should handle concurrent operations without conflicts', async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'perf-concurrent');
      
      const concurrentOps = [
        audit({ configPath: `${testWorkspace}/.claude.json`, testMode: true }),
        bulkAddPermission({
          permission: 'concurrent-1:*',
          projects: 'work/*',
          testMode: true,
          dryRun: true
        }),
        bulkAddPermission({
          permission: 'concurrent-2:*',
          projects: '*-api',
          testMode: true,
          dryRun: true
        })
      ];

      const startTime = Date.now();
      const results = await Promise.all(concurrentOps);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(3);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      console.log(`📊 Concurrent operations: ${duration}ms`);
      
      // All operations should succeed
      for (const result of results) {
        expect(result).toBeTruthy();
      }
    });
  });

  describe('Performance Regression Detection', () => {
    test('should maintain baseline performance metrics', async () => {
      // These are baseline performance expectations
      const baselines = {
        audit: { maxTime: 3000, description: 'Audit bloated config' },
        bulkAdd: { maxTime: 2000, description: 'Bulk add to 10 projects' },
        cleanHistory: { maxTime: 2000, description: 'Clean conversation history' },
        concurrent: { maxTime: 5000, description: 'Concurrent operations' }
      };

      // Run quick performance tests
      testWorkspace = await setupTestConfig(TEST_CONFIGS.BLOATED, 'perf-regression');
      
      const results: Record<string, number> = {};
      
      // Audit test
      let start = Date.now();
      await audit({ configPath: `${testWorkspace}/.claude.json`, testMode: true });
      results.audit = Date.now() - start;
      
      // Bulk operation test
      start = Date.now();
      await bulkAddPermission({
        permission: 'baseline-test:*',
        all: true,
        testMode: true,
        dryRun: true
      });
      results.bulkAdd = Date.now() - start;
      
      // Clean history test
      start = Date.now();
      await cleanHistory({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true,
        dryRun: true
      });
      results.cleanHistory = Date.now() - start;

      console.log('\n📊 Performance Baseline Results:');
      for (const [operation, time] of Object.entries(results)) {
        const baseline = baselines[operation as keyof typeof baselines];
        const status = time <= baseline.maxTime ? '✓' : '❌';
        console.log(`${status} ${baseline.description}: ${time}ms (max: ${baseline.maxTime}ms)`);
        
        expect(time).toBeLessThan(baseline.maxTime);
      }
    });
  });
});

/**
 * Generate a configuration with specified number of projects for scaling tests
 */
function generateLargeConfig(projectCount: number) {
  const projects: Record<string, any> = {};
  
  for (let i = 0; i < projectCount; i++) {
    projects[`project-${i}`] = {
      workspacePath: `/test/project-${i}`,
      bashCommands: [
        "npm:*",
        "git status",
        "docker:*",
        `project-${i}:*`
      ],
      mcpServers: {
        "github": {
          type: "stdio",
          command: "github-mcp"
        },
        ...(i % 3 === 0 ? { "aia": { type: "stdio", command: "aia-mcp" } } : {})
      },
      history: [
        {
          role: "user",
          content: `Project ${i} setup`,
          pastedContents: {
            [`paste-${i}`]: {
              filename: `config-${i}.json`,
              content: JSON.stringify({ projectId: i, config: "test" }, null, 2)
            }
          }
        }
      ]
    };
  }
  
  return {
    version: 1,
    projects
  };
}