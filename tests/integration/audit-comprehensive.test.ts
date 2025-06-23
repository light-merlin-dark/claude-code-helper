import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { audit } from '../../src/commands/audit';
import { 
  setupTestConfig, 
  cleanupTestConfig, 
  TEST_CONFIGS,
  readTestConfig 
} from '../test-data-utils';

describe('Audit Command - Comprehensive Integration', () => {
  let testWorkspace: string;

  afterEach(async () => {
    if (testWorkspace) {
      await cleanupTestConfig(testWorkspace);
    }
  });

  describe('Clean Configuration Analysis', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.CLEAN, 'audit-clean');
    });

    test('should report healthy configuration with no issues', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/Total projects: 2/);
      expect(result).toMatch(/Security Issues:.*None detected/);
      expect(result).toMatch(/Config Bloat:.*None detected/);
      expect(result).not.toMatch(/\[HIGH\]/);
      expect(result).not.toMatch(/\[WARN\]/);
    });

    test('should show project tree structure', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/Project Tree:/);
      expect(result).toMatch(/clean-project/);
      expect(result).toMatch(/simple-api/);
      expect(result).toMatch(/├─/); // Tree formatting
    });
  });

  describe('Bloated Configuration Analysis', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.BLOATED, 'audit-bloated');
    });

    test('should detect large pastes and calculate potential savings', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/Config Bloat:/);
      expect(result).toMatch(/\[WARN\] Large conversation history detected/);
      expect(result).toMatch(/db-metrics/);
      expect(result).toMatch(/frontend-app/);
      expect(result).toMatch(/Potential reduction:/);
      expect(result).toMatch(/MB/);
    });

    test('should identify multiple large pastes in single project', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      // db-metrics has 4 large pastes
      expect(result).toMatch(/4 large pastes|large pastes.*4/);
      expect(result).toMatch(/schema\.sql|migration\.sql|metrics\.ts|analytics\.ts/);
    });

    test('should calculate accurate file size metrics', async () => {
      const testConfig = readTestConfig(TEST_CONFIGS.BLOATED);
      const configSizeBytes = JSON.stringify(testConfig).length;
      const expectedSizeKB = Math.round(configSizeBytes / 1024);

      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(new RegExp(`Total config size:.*${expectedSizeKB}.*KB`));
    });
  });

  describe('Dangerous Configuration Analysis', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.DANGEROUS, 'audit-dangerous');
    });

    test('should detect all dangerous permission patterns', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/\[HIGH\] Dangerous permissions found/);
      expect(result).toMatch(/rm:\*/);
      expect(result).toMatch(/sudo:\*/);
      expect(result).toMatch(/eval:\*/);
      expect(result).toMatch(/curl \* \| bash/);
    });

    test('should map dangerous permissions to correct projects', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/temp-scripts.*rm:\*/);
      expect(result).toMatch(/system-admin.*sudo:\*/);
      expect(result).toMatch(/dev-tools.*eval:\*/);
      expect(result).toMatch(/dev-tools.*curl \* \| bash/);
    });

    test('should not flag safe permissions as dangerous', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      // Should not flag these as dangerous
      expect(result).not.toMatch(/npm:\*.*dangerous/);
      expect(result).not.toMatch(/git status.*dangerous/);
      expect(result).not.toMatch(/pytest:\*.*dangerous/);
    });
  });

  describe('Multi-Project Configuration Analysis', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'audit-multi');
    });

    test('should handle large number of projects efficiently', async () => {
      const startTime = Date.now();
      
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });
      
      const duration = Date.now() - startTime;
      
      expect(result).toMatch(/Total projects: 10/);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should organize projects by pattern in tree view', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/work\/api-server/);
      expect(result).toMatch(/work\/frontend/);
      expect(result).toMatch(/personal\/blog/);
      expect(result).toMatch(/users-api/);
      expect(result).toMatch(/orders-api/);
    });

    test('should analyze MCP distribution across projects', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/MCP tools installed: 2/); // github and aia
      expect(result).toMatch(/github.*3.*projects/); // Used in 3 projects
      expect(result).toMatch(/aia.*3.*projects/); // Used in 3 API projects
    });
  });

  describe('Complex Configuration Edge Cases', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.COMPLEX, 'audit-complex');
    });

    test('should handle nested project paths', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/nested\/deep\/project/);
      expect(result).toMatch(/project-with-special-chars/);
    });

    test('should handle projects with no permissions or MCPs', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/empty-project/);
      expect(result).not.toMatch(/empty-project.*error/);
    });

    test('should handle very long project names gracefully', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      expect(result).toMatch(/project-with-long-name-that-exceeds-normal-expectations/);
      expect(result).toMatch(/very-long-mcp-server-name-for-testing/);
    });

    test('should handle complex nested JSON in history', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true
      });

      // Should detect the large complex paste
      expect(result).toMatch(/Config Bloat:/);
      expect(result).toMatch(/complex-file\.json/);
    });
  });

  describe('Interactive Fix Mode', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.DANGEROUS, 'audit-fix');
    });

    test('should offer fix options for dangerous permissions', async () => {
      const result = await audit({
        configPath: `${testWorkspace}/.claude.json`,
        testMode: true,
        fix: true
      });

      expect(result).toMatch(/Available fixes:/);
      expect(result).toMatch(/Remove dangerous permissions/);
      expect(result).toMatch(/Create backup before fixing/);
    });
  });
});