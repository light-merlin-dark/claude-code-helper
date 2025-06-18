/**
 * Integration tests for bootstrap and service initialization
 */

import { describe, expect, test, afterEach } from 'bun:test';
import { bootstrap } from '../../src/bootstrap';
import { ServiceNames } from '../../src/registry';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Bootstrap Integration', () => {
  let testDir: string;

  afterEach(() => {
    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should initialize all services', async () => {
    // Create a test directory
    testDir = path.join(os.tmpdir(), `cch-bootstrap-test-${Date.now()}`);
    process.env.CCH_TEST_DIR = testDir;

    const context = await bootstrap(true);
    
    expect(context).toBeDefined();
    expect(context.registry).toBeDefined();
    expect(context.testMode).toBe(true);
    
    // Check that all services are registered
    expect(context.registry.has(ServiceNames.CONFIG)).toBe(true);
    expect(context.registry.has(ServiceNames.LOGGER)).toBe(true);
    expect(context.registry.has(ServiceNames.STATE)).toBe(true);
    expect(context.registry.has(ServiceNames.SAFETY)).toBe(true);
    expect(context.registry.has(ServiceNames.PERMISSION_MANAGER)).toBe(true);
    expect(context.registry.has(ServiceNames.PROJECT_SCANNER)).toBe(true);
    expect(context.registry.has(ServiceNames.MCP_MANAGER)).toBe(true);
    expect(context.registry.has(ServiceNames.PROMPT)).toBe(true);

    delete process.env.CCH_TEST_DIR;
  });

  test('should create services on demand', async () => {
    testDir = path.join(os.tmpdir(), `cch-bootstrap-test-${Date.now()}`);
    process.env.CCH_TEST_DIR = testDir;

    const context = await bootstrap(true);
    
    // Get state service (should be created on first access)
    const state = context.registry.get(ServiceNames.STATE);
    expect(state).toBeDefined();
    expect(state.constructor.name).toBe('StateService');

    // Get it again (should return same instance)
    const state2 = context.registry.get(ServiceNames.STATE);
    expect(state2).toBe(state);

    delete process.env.CCH_TEST_DIR;
  });

  test('should pass dependencies correctly', async () => {
    testDir = path.join(os.tmpdir(), `cch-bootstrap-test-${Date.now()}`);
    process.env.CCH_TEST_DIR = testDir;

    const context = await bootstrap(true);
    
    // Permission manager should have access to config, logger, and safety
    const permissionManager = context.registry.get(ServiceNames.PERMISSION_MANAGER);
    expect(permissionManager).toBeDefined();
    
    // MCP manager should have access to config, logger, and project scanner
    const mcpManager = context.registry.get(ServiceNames.MCP_MANAGER);
    expect(mcpManager).toBeDefined();

    delete process.env.CCH_TEST_DIR;
  });
});