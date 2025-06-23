/**
 * Bootstrap - Initialize all services during application startup
 */

import { registry, ServiceNames } from './registry';
import { LoggerService } from './services/logger';
import { ConfigService } from './services/config';
import { StateService } from './services/state';
import { SafetyService } from './services/safety';
import { PermissionManagerService } from './services/permission-manager';
import { ProjectScannerService } from './services/project-scanner';
import { McpManagerService } from './services/mcp-manager';
import { PromptService } from './services/prompt';
import { GlobalConfigReaderService } from './services/global-config-reader';
import { RuntimeContext } from './shared/core';

export async function bootstrap(testMode: boolean = false): Promise<RuntimeContext> {
  // Clear any existing services (important for tests)
  registry.clear();

  // 1. Load configuration first (no dependencies)
  const config = new ConfigService(testMode);
  await config.load();
  registry.register(ServiceNames.CONFIG, config);

  // 2. Initialize logger with config
  const logger = new LoggerService(config);
  registry.register(ServiceNames.LOGGER, logger);

  // 3. Register other services as factories for lazy loading
  
  // State service (depends on logger and config)
  registry.registerFactory(ServiceNames.STATE, () => new StateService(
    registry.get(ServiceNames.LOGGER),
    registry.get(ServiceNames.CONFIG)
  ));

  // Safety service (depends on config and logger)
  registry.registerFactory(ServiceNames.SAFETY, () => new SafetyService(
    registry.get(ServiceNames.CONFIG),
    registry.get(ServiceNames.LOGGER)
  ));

  // Permission manager (depends on config, logger, safety)
  registry.registerFactory(ServiceNames.PERMISSION_MANAGER, () => new PermissionManagerService(
    registry.get(ServiceNames.CONFIG),
    registry.get(ServiceNames.LOGGER),
    registry.get(ServiceNames.SAFETY)
  ));

  // Project scanner (depends on config, logger)
  registry.registerFactory(ServiceNames.PROJECT_SCANNER, () => new ProjectScannerService(
    registry.get(ServiceNames.CONFIG),
    registry.get(ServiceNames.LOGGER)
  ));

  // Global config reader (depends on logger) - singleton for caching
  registry.registerFactory(ServiceNames.GLOBAL_CONFIG_READER, () => new GlobalConfigReaderService(
    registry.get(ServiceNames.LOGGER),
    testMode
  ));

  // MCP manager (depends on config, logger, project scanner, global config reader)
  registry.registerFactory(ServiceNames.MCP_MANAGER, () => new McpManagerService(
    registry.get(ServiceNames.CONFIG),
    registry.get(ServiceNames.LOGGER),
    registry.get(ServiceNames.PROJECT_SCANNER),
    registry.get(ServiceNames.GLOBAL_CONFIG_READER)
  ));

  // Prompt service (no dependencies, but non-singleton for testing)
  registry.registerFactory(ServiceNames.PROMPT, () => new PromptService(), false);

  // Log successful bootstrap
  logger.info('Services initialized', {
    services: registry.getServiceNames(),
    testMode
  });

  // Create and return runtime context
  const context: RuntimeContext = {
    verbose: config.get('verbose', false),
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
    testMode,
    registry,
    signal: new AbortController().signal
  };

  return context;
}

/**
 * Create a test context with mocked services
 */
export function createTestContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  // Create a fresh registry for tests
  const testRegistry = registry.createScope();

  // Mock services
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    success: () => {},
    audit: () => {}
  };

  const mockConfig = {
    get: () => null,
    set: () => {},
    load: () => Promise.resolve()
  };

  testRegistry.register(ServiceNames.LOGGER, mockLogger);
  testRegistry.register(ServiceNames.CONFIG, mockConfig);

  return {
    verbose: false,
    cwd: '/test',
    env: {},
    testMode: true,
    registry: testRegistry,
    signal: new AbortController().signal,
    ...overrides
  };
}