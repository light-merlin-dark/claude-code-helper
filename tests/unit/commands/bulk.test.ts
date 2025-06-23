import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { bulkAddPermission, bulkRemovePermission, bulkAddTool, bulkRemoveTool } from '../../../src/commands/bulk';
import { resetTestEnv, TEST_CONFIG_PATH } from '../../test-utils';
import fs from 'fs';

describe('Bulk Operations', () => {
  beforeEach(async () => {
    resetTestEnv();
  });

  afterEach(async () => {
    // Clean up test data
  });

  describe('bulkAddPermission', () => {
    test('should add permission to all projects with --all', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'project1': { allowedCommands: ['npm:*'] },
          'project2': { allowedCommands: ['git:*'] },
          'project3': { allowedCommands: [] }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      const result = await bulkAddPermission({
        permission: 'docker:*',
        all: true,
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(3);
      expect(result.itemsAdded).toBe(3);
    });

    test('should add permission to projects matching pattern', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'work/api': { allowedCommands: [] },
          'work/frontend': { allowedCommands: [] },
          'personal/blog': { allowedCommands: [] }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      const result = await bulkAddPermission({
        permission: 'npm:*',
        projects: 'work/*',
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(2);
      expect(result.itemsAdded).toBe(2);
    });

    test('should not add duplicate permissions', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'project1': { allowedCommands: ['npm:*'] },
          'project2': { allowedCommands: ['npm:*', 'git:*'] }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      const result = await bulkAddPermission({
        permission: 'npm:*',
        all: true,
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(0);
      expect(result.itemsAdded).toBe(0);
    });
  });

  describe('bulkRemovePermission', () => {
    test('should remove specific permission from all projects', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'project1': { allowedCommands: ['npm:*', 'git:*'] },
          'project2': { allowedCommands: ['npm:*'] },
          'project3': { allowedCommands: ['git:*'] }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      const result = await bulkRemovePermission({
        permission: 'npm:*',
        all: true,
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(2);
      expect(result.itemsRemoved).toBe(2);
    });

    test('should remove all dangerous permissions with --dangerous', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'project1': { allowedCommands: ['npm:*', 'rm:*', 'sudo:*'] },
          'project2': { allowedCommands: ['git:*', 'eval:*'] },
          'project3': { allowedCommands: ['npm:*'] }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      const result = await bulkRemovePermission({
        dangerous: true,
        all: true,
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(2);
      expect(result.itemsRemoved).toBe(3); // rm:*, sudo:*, eval:*
    });
  });

  describe('bulkAddTool', () => {
    test('should add MCP tool to matching projects', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'api-service': { mcpServers: {} },
          'api-gateway': { mcpServers: { existing: {} } },
          'frontend': { mcpServers: {} }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      const result = await bulkAddTool({
        tool: 'github',
        projects: '*api*',
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(2);
      expect(result.itemsAdded).toBe(2);
    });

    test('should handle MCP tool name formats', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'project1': { mcpServers: {} }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      // Test with mcp__ prefix
      const result = await bulkAddTool({
        tool: 'mcp__github',
        all: true,
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(1);
      expect(result.itemsAdded).toBe(1);
    });
  });

  describe('bulkRemoveTool', () => {
    test('should remove MCP tool from projects', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'project1': { mcpServers: { github: {}, slack: {} } },
          'project2': { mcpServers: { github: {} } },
          'project3': { mcpServers: { slack: {} } }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      const result = await bulkRemoveTool({
        tool: 'github',
        all: true,
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(2);
      expect(result.itemsRemoved).toBe(2);
    });
  });

  describe('pattern matching', () => {
    test('should support multiple patterns', async () => {
      const testConfig = {
        version: 1,
        projects: {
          'work/api': { allowedCommands: [] },
          'work/frontend': { allowedCommands: [] },
          'personal/blog': { allowedCommands: [] },
          'test-api': { allowedCommands: [] }
        }
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));
      
      const result = await bulkAddPermission({
        permission: 'npm:*',
        projects: 'work/*,*-api',
        testMode: true,
        dryRun: true
      });
      
      expect(result.projectsModified).toBe(3); // work/api, work/frontend, test-api
      expect(result.itemsAdded).toBe(3);
    });
  });
});