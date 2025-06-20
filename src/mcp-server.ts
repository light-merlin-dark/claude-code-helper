#!/usr/bin/env node
/**
 * MCP Server for Claude Code Helper
 * 
 * This provides MCP (Model Context Protocol) integration, allowing AI agents
 * to use CCH functionality through the MCP interface.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ConfigService } from './services/config';
import { LoggerService } from './services/logger';
import { PromptService } from './services/prompt';
import { McpReloadCommand } from './commands/mcp/reload';
import { registry, ServiceNames } from './registry';
import { bootstrap } from './bootstrap';
import { runSystemDiagnostics } from './tools/doctor';
import { getFilteredLogs } from './tools/logs';
import { McpManagerService } from './services/mcp-manager';
import { ProjectScannerService } from './services/project-scanner';

// Initialize services
let initialized = false;
async function initializeServices() {
  if (!initialized) {
    await bootstrap();
    initialized = true;
  }
}

// Tool schemas
const reloadMcpSchema = z.object({
  name: z.string().optional().describe('Name of the MCP to reload'),
  all: z.boolean().optional().describe('Reload all MCPs'),
});

const viewLogsSchema = z.object({
  lines: z.number().optional().describe('Number of lines to return (default 50)'),
  level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG']).optional().describe('Filter by log level'),
  search: z.string().optional().describe('Search text in logs'),
  date: z.string().optional().describe('Date in YYYY-MM-DD format (default today)'),
});

const doctorSchema = z.object({});

const discoverMcpToolsSchema = z.object({
  minProjectCount: z.number().optional().describe('Minimum number of projects (default 3)'),
  includeStats: z.boolean().optional().describe('Include detailed statistics'),
});

const listMcpsSchema = z.object({
  includeDetails: z.boolean().optional().describe('Include detailed MCP information'),
});

const getMcpStatsSchema = z.object({
  groupBy: z.enum(['mcp', 'tool', 'project']).optional().describe('How to group statistics'),
});

// Define available tools
const TOOLS: Tool[] = [
  {
    name: 'reload-mcp',
    description: 'Reload MCP configuration from Claude CLI',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the MCP to reload',
        },
        all: {
          type: 'boolean',
          description: 'Reload all MCPs',
        },
      },
    },
  },
  {
    name: 'doctor',
    description: 'Run comprehensive diagnostics and health checks for Claude Code Helper',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'view-logs',
    description: 'View Claude Code Helper logs with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        lines: {
          type: 'number',
          description: 'Number of lines to return (default 50)',
        },
        level: {
          type: 'string',
          enum: ['ERROR', 'WARN', 'INFO', 'DEBUG'],
          description: 'Filter by log level',
        },
        search: {
          type: 'string',
          description: 'Search text in logs',
        },
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format (default today)',
        },
      },
    },
  },
  {
    name: 'discover-mcp-tools',
    description: 'Discover and analyze MCP tools used across projects with frequency and project details',
    inputSchema: {
      type: 'object',
      properties: {
        minProjectCount: {
          type: 'number',
          description: 'Minimum number of projects (default 3)',
        },
        includeStats: {
          type: 'boolean',
          description: 'Include detailed statistics',
        },
      },
    },
  },
  {
    name: 'list-mcps',
    description: 'List all MCPs found across projects with usage information and project associations',
    inputSchema: {
      type: 'object',
      properties: {
        includeDetails: {
          type: 'boolean',
          description: 'Include detailed MCP information',
        },
      },
    },
  },
  {
    name: 'get-mcp-stats',
    description: 'Get comprehensive statistics about MCP usage across all projects',
    inputSchema: {
      type: 'object',
      properties: {
        groupBy: {
          type: 'string',
          enum: ['mcp', 'tool', 'project'],
          description: 'How to group statistics',
        },
      },
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: 'claude-code-helper',
    version: '2.0.7',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Ensure services are initialized
  await initializeServices();

  try {
    switch (name) {
      case 'reload-mcp': {
        const params = reloadMcpSchema.parse(args);
        
        // Get services from registry
        const config = registry.get<ConfigService>(ServiceNames.CONFIG);
        const logger = registry.get<LoggerService>(ServiceNames.LOGGER);
        const prompt = registry.get<PromptService>(ServiceNames.PROMPT);
        
        // Create and execute command
        const command = new McpReloadCommand(config, logger, prompt);
        
        // Capture output
        const output: string[] = [];
        const originalInfo = logger.info.bind(logger);
        const originalSuccess = logger.success.bind(logger);
        const originalError = logger.error.bind(logger);
        
        logger.info = (msg: string) => {
          output.push(msg);
          originalInfo(msg);
        };
        logger.success = (msg: string) => {
          output.push(`✓ ${msg}`);
          originalSuccess(msg);
        };
        logger.error = (msg: string, error?: any) => {
          output.push(`✗ ${msg}`);
          originalError(msg, error);
        };
        
        try {
          await command.execute(params);
          
          return {
            content: [
              {
                type: 'text',
                text: output.join('\n') || 'MCP reload completed successfully',
              },
            ],
          };
        } finally {
          // Restore original logger methods
          logger.info = originalInfo;
          logger.success = originalSuccess;
          logger.error = originalError;
        }
      }
      
      case 'doctor': {
        const diagnostics = await runSystemDiagnostics();
        return {
          content: [
            {
              type: 'text',
              text: diagnostics,
            },
          ],
        };
      }
      
      case 'view-logs': {
        const params = viewLogsSchema.parse(args);
        const logs = await getFilteredLogs(params);
        return {
          content: [
            {
              type: 'text',
              text: logs,
            },
          ],
        };
      }
      
      case 'discover-mcp-tools': {
        const params = discoverMcpToolsSchema.parse(args);
        
        // Get services from registry
        const config = registry.get<ConfigService>(ServiceNames.CONFIG);
        const logger = registry.get<LoggerService>(ServiceNames.LOGGER);
        const projectScanner = registry.get<ProjectScannerService>(ServiceNames.PROJECT_SCANNER);
        
        const mcpManager = new McpManagerService(config, logger, projectScanner);
        const minProjectCount = params.minProjectCount || 3;
        const tools = await mcpManager.discoverFrequentTools(minProjectCount);
        
        if (tools.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No MCP tools found that are used in ${minProjectCount}+ projects`
            }]
          };
        }
        
        let output = `🔍 **MCP Tools Used in ${minProjectCount}+ Projects**\n\n`;
        
        tools.forEach((tool, idx) => {
          const projectList = tool.projects.slice(0, 3).map(p => p.split('/').pop()).join(', ');
          const moreProjects = tool.projects.length > 3 ? ` (+${tool.projects.length - 3} more)` : '';
          
          output += `**${idx + 1}. ${tool.fullName}**\n`;
          output += `   • MCP: ${tool.mcpName}\n`;
          output += `   • Tool: ${tool.toolName}\n`;
          output += `   • Used in ${tool.projects.length} projects: ${projectList}${moreProjects}\n`;
          output += `   • Total usage count: ${tool.usageCount}\n\n`;
        });
        
        if (params.includeStats) {
          const stats = await mcpManager.getMcpStats();
          output += `\n📊 **Statistics**\n`;
          output += `   • Total MCPs: ${stats.summary.totalMcps}\n`;
          output += `   • Total Tools: ${stats.summary.totalTools}\n`;
          output += `   • Total Usage: ${stats.summary.totalUsage}\n`;
        }
        
        return {
          content: [{
            type: 'text',
            text: output
          }]
        };
      }
      
      case 'list-mcps': {
        const params = listMcpsSchema.parse(args);
        
        // Get services from registry
        const config = registry.get<ConfigService>(ServiceNames.CONFIG);
        const logger = registry.get<LoggerService>(ServiceNames.LOGGER);
        const projectScanner = registry.get<ProjectScannerService>(ServiceNames.PROJECT_SCANNER);
        
        const mcpManager = new McpManagerService(config, logger, projectScanner);
        const mcps = await mcpManager.listMcps();
        
        if (mcps.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No MCPs found across your projects'
            }]
          };
        }
        
        let output = `📦 **MCPs Found Across Your Projects**\n\n`;
        
        mcps.sort((a, b) => b.usageCount - a.usageCount).forEach((mcp, idx) => {
          const projectList = mcp.projects.slice(0, 3).map(p => p.split('/').pop()).join(', ');
          const moreProjects = mcp.projects.length > 3 ? ` (+${mcp.projects.length - 3} more)` : '';
          
          output += `**${idx + 1}. ${mcp.name}**\n`;
          output += `   • Used in ${mcp.projects.length} projects: ${projectList}${moreProjects}\n`;
          output += `   • Total usage count: ${mcp.usageCount}\n`;
          
          if (params.includeDetails && mcp.tools.length > 0) {
            output += `   • Tools: ${mcp.tools.join(', ')}\n`;
          }
          
          output += `\n`;
        });
        
        return {
          content: [{
            type: 'text',
            text: output
          }]
        };
      }
      
      case 'get-mcp-stats': {
        const params = getMcpStatsSchema.parse(args);
        
        // Get services from registry
        const config = registry.get<ConfigService>(ServiceNames.CONFIG);
        const logger = registry.get<LoggerService>(ServiceNames.LOGGER);
        const projectScanner = registry.get<ProjectScannerService>(ServiceNames.PROJECT_SCANNER);
        
        const mcpManager = new McpManagerService(config, logger, projectScanner);
        const stats = await mcpManager.getMcpStats({ groupBy: params.groupBy });
        
        let output = `📊 **MCP Usage Statistics**\n\n`;
        
        output += `**Summary**\n`;
        output += `• Total MCPs: ${stats.summary.totalMcps}\n`;
        output += `• Total Tools: ${stats.summary.totalTools}\n`;
        output += `• Total Usage: ${stats.summary.totalUsage}\n\n`;
        
        if (stats.topMcps.length > 0) {
          output += `**Top MCPs by Usage**\n`;
          stats.topMcps.forEach((mcp: any, idx: number) => {
            output += `${idx + 1}. **${mcp.name}** - ${mcp.usageCount} uses across ${mcp.projectCount} projects\n`;
            if (mcp.tools.length > 0) {
              output += `   Tools: ${mcp.tools.join(', ')}\n`;
            }
          });
          output += `\n`;
        }
        
        if (stats.topTools.length > 0) {
          output += `**Top Tools by Usage**\n`;
          stats.topTools.forEach((tool: any, idx: number) => {
            output += `${idx + 1}. **${tool.toolName}** (${tool.mcpName}) - ${tool.usageCount} uses across ${tool.projectCount} projects\n`;
          });
        }
        
        return {
          content: [{
            type: 'text',
            text: output
          }]
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr to avoid interfering with stdio protocol
  console.error('Claude Code Helper MCP server started');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});