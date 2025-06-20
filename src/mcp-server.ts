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