import path from 'path';
import chalk from 'chalk';
import { logger } from '../../utils/logger';
import { promptUser } from '../../utils/prompt';
import { ServiceRegistry, ServiceNames } from '../../registry';
import { McpManagerService } from '../../services/mcp-manager';
import { GlobalConfigReaderService } from '../../services/global-config-reader';
import { LoggerService } from '../../services/logger';
import { ConfigService } from '../../services/config';
import { ProjectScannerService } from '../../services/project-scanner';

interface DiscoverOptions {
  minProjects?: number;
  stats?: boolean;
}

/**
 * Discover and suggest commonly used MCP tools across projects
 */
export async function discoverMcpTools(testMode: boolean = false, options: DiscoverOptions = {}): Promise<void> {
  const minProjects = options.minProjects || 3;
  
  // Initialize services
  const registry = new ServiceRegistry();
  
  // Register config service
  if (!registry.has(ServiceNames.CONFIG)) {
    const config = new ConfigService();
    registry.register(ServiceNames.CONFIG, config);
  }
  
  // Register logger service
  if (!registry.has(ServiceNames.LOGGER)) {
    const config = registry.get<ConfigService>(ServiceNames.CONFIG);
    const logger = new LoggerService(config);
    registry.register(ServiceNames.LOGGER, logger);
  }
  
  // Register global config reader
  if (!registry.has(ServiceNames.GLOBAL_CONFIG_READER)) {
    const loggerService = registry.get<LoggerService>(ServiceNames.LOGGER);
    const globalConfigReader = new GlobalConfigReaderService(loggerService, testMode);
    registry.register(ServiceNames.GLOBAL_CONFIG_READER, globalConfigReader);
  }
  
  // Register project scanner
  if (!registry.has(ServiceNames.PROJECT_SCANNER)) {
    const config = registry.get<ConfigService>(ServiceNames.CONFIG);
    const loggerService = registry.get<LoggerService>(ServiceNames.LOGGER);
    const projectScanner = new ProjectScannerService(config, loggerService);
    registry.register(ServiceNames.PROJECT_SCANNER, projectScanner);
  }
  
  // Register MCP manager
  if (!registry.has(ServiceNames.MCP_MANAGER)) {
    const config = registry.get<ConfigService>(ServiceNames.CONFIG);
    const loggerService = registry.get<LoggerService>(ServiceNames.LOGGER);
    const projectScanner = registry.get<ProjectScannerService>(ServiceNames.PROJECT_SCANNER);
    const globalConfigReader = registry.get<GlobalConfigReaderService>(ServiceNames.GLOBAL_CONFIG_READER);
    const mcpManager = new McpManagerService(config, loggerService, projectScanner, globalConfigReader);
    registry.register(ServiceNames.MCP_MANAGER, mcpManager);
  }
  
  const mcpManager = registry.get<McpManagerService>(ServiceNames.MCP_MANAGER);
  
  // Get frequently used tools
  const tools = await mcpManager.discoverFrequentTools(minProjects);
  
  if (tools.length === 0) {
    // Get total project count for better messaging
    const allTools = await mcpManager.listMcpTools();
    const projectSet = new Set<string>();
    allTools.forEach(tool => tool.projects.forEach(p => projectSet.add(p)));
    const totalProjects = projectSet.size;
    
    logger.info(`Analyzed ${totalProjects} project(s)`);
    logger.success(`No frequently used MCP tools found that are used in ${minProjects}+ projects`);
    return;
  }

  // Get total project count
  const allTools = await mcpManager.listMcpTools();
  const projectSet = new Set<string>();
  allTools.forEach(tool => tool.projects.forEach(p => projectSet.add(p)));
  const totalProjects = projectSet.size;

  // Display suggestions
  console.log(chalk.cyan(`\nLooking for commonly used MCP tools across ${totalProjects} projects...\n`));
  console.log(chalk.green(`Found ${tools.length} MCP tool(s) you use frequently:\n`));

  tools.forEach((tool, idx) => {
    const projectList = tool.projects.slice(0, 3).map(p => path.basename(p)).join(', ');
    const moreProjects = tool.projects.length > 3 ? ` (+${tool.projects.length - 3} more)` : '';
    console.log(`  ${chalk.yellow(`${idx + 1}.`)} ${chalk.white(tool.fullName)} ${chalk.gray(`(used in ${tool.projects.length} projects)`)} ${chalk.gray(`${projectList}${moreProjects}`)}`);
  });
  
  // If stats option is enabled, show statistics at the end
  if (options.stats) {
    const stats = await mcpManager.getMcpStats();
    console.log('\n' + chalk.cyan('Statistics:'));
    console.log(`  ${chalk.gray('•')} Total MCPs: ${stats.summary.totalMcps}`);
    console.log(`  ${chalk.gray('•')} Total Tools: ${stats.summary.totalTools}`);
    console.log(`  ${chalk.gray('•')} Total Usage: ${stats.summary.totalUsage}`);
  }

  console.log('\n' + chalk.cyan('Select MCP tools to apply:'));
  console.log(`  ${chalk.gray('[a]')} Apply all`);
  console.log(`  ${chalk.gray('[1-' + tools.length + ']')} Select specific (comma-separated)`);
  console.log(`  ${chalk.gray('[n]')} Skip\n`);

  const answer = await promptUser('Your choice: ');

  if (answer === 'n' || answer === 'skip' || answer === '') {
    logger.info('Skipped applying MCP tools');
    return;
  }

  // TODO: Implement MCP tool application logic
  logger.info('MCP tool application not yet implemented');
}