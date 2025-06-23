import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { 
  bulkAddPermission, 
  bulkRemovePermission,
  bulkAddTool,
  bulkRemoveTool 
} from '../../src/commands/bulk';
import { 
  setupTestConfig, 
  cleanupTestConfig, 
  TEST_CONFIGS,
  readTestConfig 
} from '../test-data-utils';
import { readFileSync } from 'fs';
import path from 'path';

describe('Bulk Operations - Comprehensive Integration', () => {
  let testWorkspace: string;

  afterEach(async () => {
    if (testWorkspace) {
      await cleanupTestConfig(testWorkspace);
    }
  });

  describe('Bulk Permission Management', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'bulk-perms');
    });

    test('should add permission to all projects when using --all', async () => {
      const result = await bulkAddPermission({
        permission: 'pytest:*',
        all: true,
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(10); // All projects in multi-project config
      expect(result.itemsAdded).toBe(10);
      
      // Verify the permission was actually added
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      const firstProject = Object.values(config.projects)[0] as any;
      expect(firstProject.bashCommands).toContain('pytest:*');
    });

    test('should add permission to projects matching pattern', async () => {
      const result = await bulkAddPermission({
        permission: 'docker-compose:*',
        projects: 'work/*',
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(3); // work/api-server, work/frontend, work/mobile-app
      expect(result.itemsAdded).toBe(3);
      
      // Verify only work projects were modified
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      expect(config.projects['work/api-server'].bashCommands).toContain('docker-compose:*');
      expect(config.projects['work/frontend'].bashCommands).toContain('docker-compose:*');
      expect(config.projects['personal/blog'].bashCommands).not.toContain('docker-compose:*');
    });

    test('should add permission to API projects using *-api pattern', async () => {
      const result = await bulkAddPermission({
        permission: 'kubectl:*',
        projects: '*-api',
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(3); // users-api, orders-api, payments-api
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      expect(config.projects['users-api'].bashCommands).toContain('kubectl:*');
      expect(config.projects['orders-api'].bashCommands).toContain('kubectl:*');
      expect(config.projects['payments-api'].bashCommands).toContain('kubectl:*');
      expect(config.projects['work/api-server'].bashCommands).not.toContain('kubectl:*');
    });

    test('should remove specific permission from matching projects', async () => {
      const result = await bulkRemovePermission({
        permission: 'npm:*',
        projects: 'work/*',
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBeGreaterThan(0);
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      expect(config.projects['work/api-server'].bashCommands).not.toContain('npm:*');
      expect(config.projects['work/frontend'].bashCommands).not.toContain('npm:*');
    });

    test('should handle multiple project patterns', async () => {
      const result = await bulkAddPermission({
        permission: 'terraform:*',
        projects: ['work/*', '*-api'],
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(6); // 3 work projects + 3 API projects
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      expect(config.projects['work/api-server'].bashCommands).toContain('terraform:*');
      expect(config.projects['users-api'].bashCommands).toContain('terraform:*');
      expect(config.projects['personal/blog'].bashCommands).not.toContain('terraform:*');
    });

    test('should create backup before modifications', async () => {
      const result = await bulkAddPermission({
        permission: 'test-perm:*',
        all: true,
        testMode: true,
        dryRun: false
      });

      expect(result.backupPath).toBeTruthy();
      expect(result.backupPath).toMatch(/\.cch\/backups\/.*\.gz$/);
    });

    test('should handle dry run mode without making changes', async () => {
      const originalConfig = readFileSync(`${testWorkspace}/.claude.json`, 'utf8');
      
      const result = await bulkAddPermission({
        permission: 'dryrun-test:*',
        all: true,
        testMode: true,
        dryRun: true
      });

      const configAfter = readFileSync(`${testWorkspace}/.claude.json`, 'utf8');
      
      expect(result.projectsModified).toBe(10);
      expect(originalConfig).toBe(configAfter); // No actual changes
    });
  });

  describe('Dangerous Permission Removal', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.DANGEROUS, 'bulk-dangerous');
    });

    test('should remove all dangerous permissions', async () => {
      const result = await bulkRemovePermission({
        dangerous: true,
        all: true,
        testMode: true,
        dryRun: false
      });

      expect(result.itemsRemoved).toBe(4); // rm:*, sudo:*, eval:*, curl * | bash
      expect(result.projectsModified).toBe(3); // 3 projects have dangerous perms
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      
      // Verify dangerous permissions are removed
      expect(config.projects['temp-scripts'].bashCommands).not.toContain('rm:*');
      expect(config.projects['system-admin'].bashCommands).not.toContain('sudo:*');
      expect(config.projects['dev-tools'].bashCommands).not.toContain('eval:*');
      expect(config.projects['dev-tools'].bashCommands).not.toContain('curl * | bash');
      
      // Verify safe permissions remain
      expect(config.projects['temp-scripts'].bashCommands).toContain('npm:*');
      expect(config.projects['safe-project'].bashCommands).toContain('npm:*');
    });

    test('should only target dangerous permissions in specific project pattern', async () => {
      const result = await bulkRemovePermission({
        dangerous: true,
        projects: 'dev-*',
        testMode: true,
        dryRun: false
      });

      expect(result.itemsRemoved).toBe(2); // eval:*, curl * | bash from dev-tools
      expect(result.projectsModified).toBe(1); // Only dev-tools matches pattern
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      
      // dev-tools dangerous perms removed
      expect(config.projects['dev-tools'].bashCommands).not.toContain('eval:*');
      expect(config.projects['dev-tools'].bashCommands).not.toContain('curl * | bash');
      
      // Other projects' dangerous perms remain (not matching pattern)
      expect(config.projects['temp-scripts'].bashCommands).toContain('rm:*');
      expect(config.projects['system-admin'].bashCommands).toContain('sudo:*');
    });
  });

  describe('Bulk MCP Tool Management', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'bulk-mcps');
    });

    test('should add MCP tool to all projects', async () => {
      const result = await bulkAddTool({
        tool: 'aia',
        all: true,
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(10);
      expect(result.itemsAdded).toBe(7); // 3 projects already have aia, so 7 additions
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      
      // All projects should now have aia
      for (const project of Object.values(config.projects)) {
        expect((project as any).mcpServers).toHaveProperty('aia');
      }
    });

    test('should remove MCP tool from matching projects', async () => {
      const result = await bulkRemoveTool({
        tool: 'github',
        projects: 'work/*',
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(2); // work/api-server and work/frontend have github
      expect(result.itemsRemoved).toBe(2);
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      
      // Work projects should not have github anymore
      expect(config.projects['work/api-server'].mcpServers).not.toHaveProperty('github');
      expect(config.projects['work/frontend'].mcpServers).not.toHaveProperty('github');
    });

    test('should handle non-existent tools gracefully', async () => {
      const result = await bulkAddTool({
        tool: 'non-existent-tool',
        all: true,
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(10); // All projects get the new tool
      expect(result.itemsAdded).toBe(10);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.COMPLEX, 'bulk-edge');
    });

    test('should handle projects with special characters in names', async () => {
      const result = await bulkAddPermission({
        permission: 'special-test:*',
        projects: '*special*',
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(1); // project-with-special-chars!@#
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      expect(config.projects['project-with-special-chars!@#'].bashCommands).toContain('special-test:*');
    });

    test('should handle empty projects gracefully', async () => {
      const result = await bulkAddPermission({
        permission: 'empty-test:*',
        projects: 'empty-*',
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(1); // empty-project
      
      const config = JSON.parse(readFileSync(`${testWorkspace}/.claude.json`, 'utf8'));
      expect(config.projects['empty-project'].bashCommands).toContain('empty-test:*');
    });

    test('should handle no matching projects', async () => {
      const result = await bulkAddPermission({
        permission: 'no-match:*',
        projects: 'non-existent-*',
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(0);
      expect(result.itemsAdded).toBe(0);
    });

    test('should validate project patterns', async () => {
      // Invalid patterns should still work with literal matching
      const result = await bulkAddPermission({
        permission: 'pattern-test:*',
        projects: 'nested/deep/*',
        testMode: true,
        dryRun: false
      });

      expect(result.projectsModified).toBe(1); // nested/deep/project
    });
  });

  describe('Performance and Scalability', () => {
    beforeEach(async () => {
      testWorkspace = await setupTestConfig(TEST_CONFIGS.MULTI_PROJECT, 'bulk-perf');
    });

    test('should handle bulk operations efficiently', async () => {
      const startTime = Date.now();
      
      const result = await bulkAddPermission({
        permission: 'perf-test:*',
        all: true,
        testMode: true,
        dryRun: false
      });
      
      const duration = Date.now() - startTime;
      
      expect(result.projectsModified).toBe(10);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });

    test('should batch multiple operations efficiently', async () => {
      const operations = [
        bulkAddPermission({
          permission: 'batch-1:*',
          all: true,
          testMode: true,
          dryRun: false
        }),
        bulkAddPermission({
          permission: 'batch-2:*',
          all: true,
          testMode: true,
          dryRun: false
        }),
        bulkAddTool({
          tool: 'batch-tool',
          all: true,
          testMode: true,
          dryRun: false
        })
      ];

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(3);
      expect(duration).toBeLessThan(5000); // All operations within 5 seconds
      
      for (const result of results) {
        expect(result.projectsModified).toBe(10);
      }
    });
  });
});