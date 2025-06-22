/**
 * Production test for MCP tools with global config
 * This test runs read-only operations against the real ~/.claude.json
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Skip tests if no global config exists
const globalConfigPath = path.join(os.homedir(), '.claude.json');
const hasGlobalConfig = fs.existsSync(globalConfigPath);

describe('Global Config Read Tests', () => {
  beforeAll(() => {
    if (!hasGlobalConfig) {
      console.log('⚠️  No global Claude config found at ~/.claude.json');
      console.log('These tests require an actual Claude installation with projects.');
    }
  });

  it('should verify global config exists and is readable', async () => {
    if (!hasGlobalConfig) {
      console.log('Skipped - no global config');
      return;
    }

    const stats = await fs.promises.stat(globalConfigPath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
    
    // Check it's valid JSON
    const content = await fs.promises.readFile(globalConfigPath, 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('should read projects from global config using jq', async () => {
    if (!hasGlobalConfig) {
      console.log('Skipped - no global config');
      return;
    }

    const { stdout } = await execAsync(
      `jq '.projects | length' "${globalConfigPath}"`
    );
    
    const projectCount = parseInt(stdout.trim());
    expect(projectCount).toBeGreaterThanOrEqual(0);
    console.log(`Found ${projectCount} projects in global config`);
  });

  it('should extract MCP tools from global config', async () => {
    if (!hasGlobalConfig) {
      console.log('Skipped - no global config');
      return;
    }

    // Extract all MCP tools
    const { stdout } = await execAsync(
      `jq -r '.projects | to_entries[] | .value.allowedTools[]? | select(startswith("mcp__"))' "${globalConfigPath}" | sort -u | head -20`
    );
    
    const mcpTools = stdout.trim().split('\n').filter(line => line);
    console.log(`Found ${mcpTools.length} unique MCP tools (showing first 20)`);
    
    if (mcpTools.length > 0) {
      // Verify tool format
      for (const tool of mcpTools.slice(0, 5)) {
        expect(tool).toMatch(/^mcp__[^_]+__.+$/);
      }
    }
  });

  it('should count MCPs by usage', async () => {
    if (!hasGlobalConfig) {
      console.log('Skipped - no global config');
      return;
    }

    // Get MCP usage count
    const { stdout } = await execAsync(
      `jq -r '.projects | to_entries[] | .value.allowedTools[]? | select(startswith("mcp__")) | split("__")[1]' "${globalConfigPath}" | sort | uniq -c | sort -nr | head -10`
    );
    
    const lines = stdout.trim().split('\n').filter(line => line);
    console.log('Top MCPs by usage:');
    
    for (const line of lines) {
      const match = line.trim().match(/(\d+)\s+(.+)/);
      if (match) {
        const [, count, mcpName] = match;
        console.log(`  ${mcpName}: ${count} projects`);
      }
    }
    
    expect(lines.length).toBeGreaterThanOrEqual(0);
  });

  it('should read projects with GlobalConfigReaderService', async () => {
    if (!hasGlobalConfig) {
      console.log('Skipped - no global config');
      return;
    }

    // Import services
    const { LoggerService } = await import('../../../../src/services/logger');
    const { ConfigService } = await import('../../../../src/services/config');
    const { GlobalConfigReaderService } = await import('../../../../src/services/global-config-reader');
    
    const logger = new LoggerService(new ConfigService());
    const reader = new GlobalConfigReaderService(logger);
    
    expect(await reader.exists()).toBe(true);
    
    const projects = await reader.getAllProjects();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
    
    // Check first project structure
    const firstProject = projects[0];
    expect(firstProject.path).toBeTruthy();
    expect(Array.isArray(firstProject.allowedTools)).toBe(true);
    
    console.log(`Loaded ${projects.length} projects from global config`);
  });

  it('should analyze MCP usage with GlobalConfigReaderService', async () => {
    if (!hasGlobalConfig) {
      console.log('Skipped - no global config');
      return;
    }

    const { LoggerService } = await import('../../../../src/services/logger');
    const { ConfigService } = await import('../../../../src/services/config');
    const { GlobalConfigReaderService } = await import('../../../../src/services/global-config-reader');
    
    const logger = new LoggerService(new ConfigService());
    const reader = new GlobalConfigReaderService(logger);
    
    const mcpUsage = await reader.getMcpUsage();
    expect(mcpUsage instanceof Map).toBe(true);
    
    let totalMcps = 0;
    let totalProjects = 0;
    
    for (const [mcpName, usage] of mcpUsage) {
      expect(mcpName).toBeTruthy();
      expect(usage.tools instanceof Set).toBe(true);
      expect(usage.projects instanceof Set).toBe(true);
      
      totalMcps++;
      totalProjects += usage.projects.size;
    }
    
    console.log(`Found ${totalMcps} MCPs across ${totalProjects} total project references`);
  });

  it('should get global config statistics', async () => {
    if (!hasGlobalConfig) {
      console.log('Skipped - no global config');
      return;
    }

    const { LoggerService } = await import('../../../../src/services/logger');
    const { ConfigService } = await import('../../../../src/services/config');
    const { GlobalConfigReaderService } = await import('../../../../src/services/global-config-reader');
    
    const logger = new LoggerService(new ConfigService());
    const reader = new GlobalConfigReaderService(logger);
    
    const stats = await reader.getStats();
    
    expect(stats.totalProjects).toBeGreaterThanOrEqual(0);
    expect(stats.projectsWithMcps).toBeGreaterThanOrEqual(0);
    expect(stats.totalMcps).toBeGreaterThanOrEqual(0);
    expect(stats.totalMcpTools).toBeGreaterThanOrEqual(0);
    expect(stats.configSize).toBeGreaterThan(0);
    
    console.log('Global config statistics:', stats);
  });

  it('should read large config efficiently', async () => {
    if (!hasGlobalConfig) {
      console.log('Skipped - no global config');
      return;
    }

    const { LoggerService } = await import('../../../../src/services/logger');
    const { ConfigService } = await import('../../../../src/services/config');
    const { GlobalConfigReaderService } = await import('../../../../src/services/global-config-reader');
    
    const logger = new LoggerService(new ConfigService());
    const reader = new GlobalConfigReaderService(logger);
    
    // Time the operation
    const start = Date.now();
    const projects = await reader.getAllProjects();
    const duration = Date.now() - start;
    
    console.log(`Loaded ${projects.length} projects in ${duration}ms`);
    expect(duration).toBeLessThan(1000);
    
    // Test cache performance
    const cacheStart = Date.now();
    const cachedProjects = await reader.getAllProjects();
    const cacheDuration = Date.now() - cacheStart;
    
    console.log(`Cached load took ${cacheDuration}ms`);
    expect(cacheDuration).toBeLessThan(10);
    expect(cachedProjects.length).toBe(projects.length);
  });
});