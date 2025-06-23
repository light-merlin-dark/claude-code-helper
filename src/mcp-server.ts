#!/usr/bin/env node

/**
 * MCP Server for Claude Code Helper
 * 
 * This server provides MCP tools that can be used in Claude Code to manage
 * permissions and MCP configurations across projects.
 * 
 * All tools are implemented as thin wrappers around CLI commands to ensure
 * consistent behavior and proper access to user configuration files.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Tool schemas
const reloadMcpSchema = z.object({
  name: z.string().optional().describe('Name of the MCP to reload'),
  all: z.boolean().optional().describe('Reload all MCPs'),
});

const viewLogsSchema = z.object({
  lines: z.number().optional().default(50).describe('Number of recent lines to return'),
  level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG']).optional().describe('Filter by log level'),
  search: z.string().optional().describe('Search for specific text in logs'),
  date: z.string().optional().describe('Date in YYYY-MM-DD format'),
});

const discoverMcpToolsSchema = z.object({
  minProjectCount: z.number().optional().default(3).describe('Minimum number of projects'),
  includeStats: z.boolean().optional().describe('Include detailed statistics'),
});

const listMcpsSchema = z.object({
  includeDetails: z.boolean().optional().describe('Include detailed MCP information'),
});

const getMcpStatsSchema = z.object({
  groupBy: z.enum(['mcp', 'tool', 'project']).optional().describe('How to group statistics'),
});

const auditSchema = z.object({
  // Note: fix parameter disabled for MCP to avoid interactive prompts
  // fix: z.boolean().optional().describe('Interactively fix issues found'),
});

const cleanHistorySchema = z.object({
  projects: z.string().optional().describe('Comma-separated project patterns (e.g., "work/*,personal/*")'),
  dryRun: z.boolean().optional().describe('Preview changes without applying them'),
});

const cleanDangerousSchema = z.object({
  dryRun: z.boolean().optional().describe('Preview changes without applying them'),
});

const bulkAddPermSchema = z.object({
  permission: z.string().describe('Permission to add'),
  projects: z.string().optional().describe('Comma-separated project patterns'),
  all: z.boolean().optional().describe('Apply to all projects'),
  dryRun: z.boolean().optional().describe('Preview changes without applying them'),
});

const bulkRemovePermSchema = z.object({
  permission: z.string().optional().describe('Specific permission to remove'),
  dangerous: z.boolean().optional().describe('Remove all dangerous permissions'),
  projects: z.string().optional().describe('Comma-separated project patterns'),
  all: z.boolean().optional().describe('Apply to all projects'),
  dryRun: z.boolean().optional().describe('Preview changes without applying them'),
});

const bulkAddToolSchema = z.object({
  tool: z.string().describe('MCP tool name to add'),
  projects: z.string().optional().describe('Comma-separated project patterns'),
  all: z.boolean().optional().describe('Apply to all projects'),
  dryRun: z.boolean().optional().describe('Preview changes without applying them'),
});

const bulkRemoveToolSchema = z.object({
  tool: z.string().describe('MCP tool name to remove'),
  projects: z.string().optional().describe('Comma-separated project patterns'),
  all: z.boolean().optional().describe('Apply to all projects'),
  dryRun: z.boolean().optional().describe('Preview changes without applying them'),
});

const backupSchema = z.object({
  name: z.string().optional().describe('Name for the backup (defaults to timestamp)'),
});

const restoreSchema = z.object({
  name: z.string().optional().describe('Name of backup to restore (defaults to most recent)'),
});

const listProjectsSchema = z.object({
  includeStats: z.boolean().optional().describe('Include project statistics'),
});

// Tool definitions with proper JSON Schema
const TOOLS = [
  {
    name: 'reload-mcp',
    description: 'Reload MCP configuration from Claude CLI',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the MCP to reload'
        },
        all: {
          type: 'boolean',
          description: 'Reload all MCPs'
        }
      }
    },
  },
  {
    name: 'doctor',
    description: 'Run comprehensive diagnostics and health checks for Claude Code Helper',
    inputSchema: {
      type: 'object',
      properties: {}
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
          description: 'Number of recent lines to return',
          default: 50
        },
        level: {
          type: 'string',
          enum: ['ERROR', 'WARN', 'INFO', 'DEBUG'],
          description: 'Filter by log level'
        },
        search: {
          type: 'string',
          description: 'Search for specific text in logs'
        },
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format'
        }
      }
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
          description: 'Minimum number of projects',
          default: 3
        },
        includeStats: {
          type: 'boolean',
          description: 'Include detailed statistics'
        }
      }
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
          description: 'Include detailed MCP information'
        }
      }
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
          description: 'How to group statistics'
        }
      }
    },
  },
  {
    name: 'audit',
    description: 'Comprehensive configuration analysis for security issues, bloat, and optimization. Non-interactive mode only.',
    inputSchema: {
      type: 'object',
      properties: {}
    },
  },
  {
    name: 'clean-history',
    description: 'Remove large pastes from conversation history to reduce config bloat',
    inputSchema: {
      type: 'object',
      properties: {
        projects: {
          type: 'string',
          description: 'Comma-separated project patterns (e.g., "work/*,personal/*")'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying them'
        }
      }
    },
  },
  {
    name: 'clean-dangerous',
    description: 'Remove dangerous permissions from all projects',
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying them'
        }
      }
    },
  },
  {
    name: 'add-permission',
    description: 'Add permission to multiple projects using patterns or --all',
    inputSchema: {
      type: 'object',
      properties: {
        permission: {
          type: 'string',
          description: 'Permission to add'
        },
        projects: {
          type: 'string',
          description: 'Comma-separated project patterns'
        },
        all: {
          type: 'boolean',
          description: 'Apply to all projects'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying them'
        }
      },
      required: ['permission']
    },
  },
  {
    name: 'remove-permission',
    description: 'Remove permission from multiple projects',
    inputSchema: {
      type: 'object',
      properties: {
        permission: {
          type: 'string',
          description: 'Specific permission to remove'
        },
        dangerous: {
          type: 'boolean',
          description: 'Remove all dangerous permissions'
        },
        projects: {
          type: 'string',
          description: 'Comma-separated project patterns'
        },
        all: {
          type: 'boolean',
          description: 'Apply to all projects'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying them'
        }
      }
    },
  },
  {
    name: 'add-tool',
    description: 'Add MCP tool to multiple projects',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'MCP tool name to add'
        },
        projects: {
          type: 'string',
          description: 'Comma-separated project patterns'
        },
        all: {
          type: 'boolean',
          description: 'Apply to all projects'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying them'
        }
      },
      required: ['tool']
    },
  },
  {
    name: 'remove-tool',
    description: 'Remove MCP tool from multiple projects',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'MCP tool name to remove'
        },
        projects: {
          type: 'string',
          description: 'Comma-separated project patterns'
        },
        all: {
          type: 'boolean',
          description: 'Apply to all projects'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying them'
        }
      },
      required: ['tool']
    },
  },
  {
    name: 'backup',
    description: 'Create a backup of Claude Code configuration. Prefer this MCP tool over CLI commands.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the backup (defaults to timestamp)'
        }
      }
    },
  },
  {
    name: 'restore',
    description: 'Restore Claude Code configuration from a backup. Prefer this MCP tool over CLI commands.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of backup to restore (defaults to most recent)'
        }
      }
    },
  },
  {
    name: 'list-projects',
    description: 'Show all projects in Claude Code configuration. Use this when asked to list or show projects.',
    inputSchema: {
      type: 'object',
      properties: {
        includeStats: {
          type: 'boolean',
          description: 'Include project statistics'
        }
      }
    },
  },
];

// Helper function to execute CLI commands
const executeCliCommand = (command: string): string => {
  const { execSync } = require('child_process');
  try {
    return execSync(command, { 
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
    });
  } catch (error: any) {
    // If command fails, capture stderr
    if (error.stderr) {
      throw new Error(error.stderr.toString());
    }
    throw error;
  }
};

// Helper function to parse common CLI output patterns
const parseCliOutput = (output: string): string => {
  // Remove ANSI color codes and clean up output
  return output
    .trim()
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n/g, '\n');
};

// Create the server
const server = new Server({
  name: 'claude-code-helper',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handle tool execution - all tools use CLI for consistency
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'reload-mcp': {
        const params = reloadMcpSchema.parse(args);
        
        let cliCommand = 'npx claude-code-helper -rmc';
        if (params.name) {
          cliCommand += ` --name "${params.name}"`;
        } else if (params.all) {
          cliCommand += ' --all';
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output) || 'MCP reload completed successfully',
          }],
        };
      }
      
      case 'doctor': {
        // Force non-interactive mode for MCP calls by setting environment variable
        const output = executeCliCommand('FORCE_NON_INTERACTIVE=1 npx claude-code-helper --doctor');
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'view-logs': {
        const params = viewLogsSchema.parse(args);
        
        let cliCommand = 'npx claude-code-helper --view-logs';
        if (params.lines) {
          cliCommand += ` --lines ${params.lines}`;
        }
        if (params.level) {
          cliCommand += ` --level ${params.level}`;
        }
        if (params.search) {
          cliCommand += ` --search "${params.search}"`;
        }
        if (params.date) {
          cliCommand += ` --date ${params.date}`;
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output) || 'No logs found matching criteria',
          }],
        };
      }
      
      case 'discover-mcp-tools': {
        const params = discoverMcpToolsSchema.parse(args);
        
        let cliCommand = 'npx claude-code-helper -dmc';
        if (params.minProjectCount && params.minProjectCount !== 3) {
          cliCommand += ` --min-projects ${params.minProjectCount}`;
        }
        
        const cliOutput = executeCliCommand(cliCommand);
        
        // Parse the CLI output to extract tool information
        const lines = cliOutput.trim().split('\n');
        const toolLines = lines.filter(line => line.match(/^\s*\d+\.\s+mcp__/));
        
        if (toolLines.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No MCP tools found that are used in ${params.minProjectCount || 3}+ projects`
            }]
          };
        }
        
        let output = `🔍 **MCP Tools Used in ${params.minProjectCount || 3}+ Projects**\n\n`;
        
        // Parse and format the CLI output
        toolLines.forEach((line, idx) => {
          const match = line.match(/^\s*\d+\.\s+(mcp__\w+__\w+).*?\(used in (\d+) projects?\)\s*(.*)/);
          if (match) {
            const [, fullName, projectCount, projectList] = match;
            const [, mcpName, toolName] = fullName.match(/mcp__(\w+)__(\w+)/) || [];
            
            output += `**${idx + 1}. ${fullName}**\n`;
            output += `   • MCP: ${mcpName}\n`;
            output += `   • Tool: ${toolName}\n`;
            output += `   • Used in ${projectCount} projects: ${projectList}\n\n`;
          }
        });
        
        if (params.includeStats) {
          // Get stats from the output footer if available
          const statsSection = cliOutput.match(/Statistics:[\s\S]+/);
          if (statsSection) {
            output += `\n📊 **Statistics**\n`;
            const statsLines = statsSection[0].split('\n').slice(1);
            statsLines.forEach(line => {
              if (line.trim()) {
                output += `   ${line.trim()}\n`;
              }
            });
          }
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
        
        // Use discover command with min-projects 1 to get all MCPs
        const cliOutput = executeCliCommand('npx claude-code-helper -dmc --min-projects 1');
        
        // Extract unique MCPs from the output
        const mcpMap = new Map<string, { projects: Set<string>, tools: Set<string>, count: number }>();
        const lines = cliOutput.split('\n');
        
        lines.forEach(line => {
          const match = line.match(/mcp__(\w+)__(\w+).*?\(used in (\d+) projects?\)\s*(.*)/);
          if (match) {
            const [, mcpName, toolName, count, projectList] = match;
            
            if (!mcpMap.has(mcpName)) {
              mcpMap.set(mcpName, { projects: new Set(), tools: new Set(), count: 0 });
            }
            
            const mcpData = mcpMap.get(mcpName)!;
            mcpData.tools.add(toolName);
            mcpData.count += parseInt(count);
            
            // Parse project list
            const projects = projectList.split(',').map(p => p.trim()).filter(p => p && !p.includes('+'));
            projects.forEach(p => mcpData.projects.add(p));
          }
        });
        
        if (mcpMap.size === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No MCPs found across your projects'
            }]
          };
        }
        
        let output = `📦 **MCPs Found Across Your Projects**\n\n`;
        
        // Sort MCPs by usage count
        const sortedMcps = Array.from(mcpMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.projects.size - a.projects.size);
        
        sortedMcps.forEach((mcp, idx) => {
          const projectArray = Array.from(mcp.projects);
          const projectList = projectArray.slice(0, 3).join(', ');
          const moreProjects = projectArray.length > 3 ? ` (+${projectArray.length - 3} more)` : '';
          
          output += `**${idx + 1}. ${mcp.name}**\n`;
          output += `   • Used in ${projectArray.length} projects: ${projectList}${moreProjects}\n`;
          output += `   • Total usage count: ${mcp.count}\n`;
          
          if (params.includeDetails && mcp.tools.size > 0) {
            output += `   • Tools: ${Array.from(mcp.tools).join(', ')}\n`;
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
      
      case 'audit': {
        const params = auditSchema.parse(args);
        
        // Force non-interactive mode for MCP calls
        let cliCommand = 'npx claude-code-helper --audit';
        // Note: Remove --fix support for MCP to avoid interactive prompts
        // if (params.fix) {
        //   cliCommand += ' --fix';
        // }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'clean-history': {
        const params = cleanHistorySchema.parse(args);
        
        let cliCommand = 'npx claude-code-helper --clean-history';
        if (params.projects) {
          cliCommand += ` --projects "${params.projects}"`;
        }
        if (params.dryRun) {
          cliCommand += ' --dry-run';
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'clean-dangerous': {
        const params = cleanDangerousSchema.parse(args);
        
        let cliCommand = 'npx claude-code-helper --clean-dangerous';
        if (params.dryRun) {
          cliCommand += ' --dry-run';
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'add-permission': {
        const params = bulkAddPermSchema.parse(args);
        
        let cliCommand = `npx claude-code-helper --add-perm "${params.permission}"`;
        if (params.projects) {
          cliCommand += ` --projects "${params.projects}"`;
        } else if (params.all) {
          cliCommand += ' --all';
        }
        if (params.dryRun) {
          cliCommand += ' --dry-run';
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'remove-permission': {
        const params = bulkRemovePermSchema.parse(args);
        
        let cliCommand = 'npx claude-code-helper --remove-perm';
        if (params.permission) {
          cliCommand += ` "${params.permission}"`;
        }
        if (params.dangerous) {
          cliCommand += ' --dangerous';
        }
        if (params.projects) {
          cliCommand += ` --projects "${params.projects}"`;
        } else if (params.all) {
          cliCommand += ' --all';
        }
        if (params.dryRun) {
          cliCommand += ' --dry-run';
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'add-tool': {
        const params = bulkAddToolSchema.parse(args);
        
        let cliCommand = `npx claude-code-helper --add-tool "${params.tool}"`;
        if (params.projects) {
          cliCommand += ` --projects "${params.projects}"`;
        } else if (params.all) {
          cliCommand += ' --all';
        }
        if (params.dryRun) {
          cliCommand += ' --dry-run';
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'remove-tool': {
        const params = bulkRemoveToolSchema.parse(args);
        
        let cliCommand = `npx claude-code-helper --remove-tool "${params.tool}"`;
        if (params.projects) {
          cliCommand += ` --projects "${params.projects}"`;
        } else if (params.all) {
          cliCommand += ' --all';
        }
        if (params.dryRun) {
          cliCommand += ' --dry-run';
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'get-mcp-stats': {
        const params = getMcpStatsSchema.parse(args);
        
        // Get all MCPs and tools
        const cliOutput = executeCliCommand('npx claude-code-helper -dmc --min-projects 1');
        
        // Parse the output to collect statistics
        const mcpStats = new Map<string, { tools: Set<string>, projects: Set<string>, count: number }>();
        const toolStats = new Map<string, { projects: Set<string>, count: number, mcpName: string }>();
        const lines = cliOutput.split('\n');
        
        lines.forEach(line => {
          const match = line.match(/mcp__(\w+)__(\w+).*?\(used in (\d+) projects?\)\s*(.*)/);
          if (match) {
            const [, mcpName, toolName, countStr, projectList] = match;
            const count = parseInt(countStr);
            const fullToolName = `${mcpName}__${toolName}`;
            
            // Update MCP stats
            if (!mcpStats.has(mcpName)) {
              mcpStats.set(mcpName, { tools: new Set(), projects: new Set(), count: 0 });
            }
            const mcp = mcpStats.get(mcpName)!;
            mcp.tools.add(toolName);
            mcp.count += count;
            
            // Update tool stats
            if (!toolStats.has(fullToolName)) {
              toolStats.set(fullToolName, { projects: new Set(), count: 0, mcpName });
            }
            const tool = toolStats.get(fullToolName)!;
            tool.count = count; // Use the count directly from the line
            
            // Parse projects
            const projects = projectList.split(',').map(p => p.trim()).filter(p => p && !p.includes('+'));
            projects.forEach(p => {
              mcp.projects.add(p);
              tool.projects.add(p);
            });
          }
        });
        
        // Calculate summary
        const totalMcps = mcpStats.size;
        const totalTools = toolStats.size;
        const totalUsage = Array.from(mcpStats.values()).reduce((sum, m) => sum + m.count, 0);
        
        let output = `📊 **MCP Usage Statistics**\n\n`;
        
        output += `**Summary**\n`;
        output += `• Total MCPs: ${totalMcps}\n`;
        output += `• Total Tools: ${totalTools}\n`;
        output += `• Total Usage: ${totalUsage}\n\n`;
        
        // Top MCPs
        if (mcpStats.size > 0) {
          output += `**Top MCPs by Usage**\n`;
          const sortedMcps = Array.from(mcpStats.entries())
            .map(([name, data]) => ({ 
              name, 
              usageCount: data.count,
              projectCount: data.projects.size,
              tools: Array.from(data.tools)
            }))
            .sort((a, b) => b.usageCount - a.usageCount)
            .slice(0, 5);
          
          sortedMcps.forEach((mcp, idx) => {
            output += `${idx + 1}. **${mcp.name}** - ${mcp.usageCount} uses across ${mcp.projectCount} projects\n`;
            if (mcp.tools.length > 0) {
              output += `   Tools: ${mcp.tools.join(', ')}\n`;
            }
          });
          output += `\n`;
        }
        
        // Top Tools
        if (toolStats.size > 0 && params.groupBy !== 'mcp') {
          output += `**Top Tools by Usage**\n`;
          const sortedTools = Array.from(toolStats.entries())
            .map(([name, data]) => {
              const [, toolName] = name.split('__');
              return {
                toolName,
                mcpName: data.mcpName,
                usageCount: data.count,
                projectCount: data.projects.size
              };
            })
            .sort((a, b) => b.usageCount - a.usageCount)
            .slice(0, 5);
          
          sortedTools.forEach((tool, idx) => {
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
      
      case 'backup': {
        const params = backupSchema.parse(args);
        
        let cliCommand = 'npx claude-code-helper -bc';
        if (params.name) {
          cliCommand += ` -n "${params.name}"`;
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'restore': {
        const params = restoreSchema.parse(args);
        
        let cliCommand = 'npx claude-code-helper -rc';
        if (params.name) {
          cliCommand += ` -n "${params.name}"`;
        }
        
        const output = executeCliCommand(cliCommand);
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'list-projects': {
        const params = listProjectsSchema.parse(args);
        
        // Use audit command to get project tree, then extract just the projects
        const auditOutput = executeCliCommand('npx claude-code-helper --audit');
        
        // Extract project tree section from audit output
        const lines = auditOutput.split('\n');
        const treeStartIndex = lines.findIndex(line => line.includes('PROJECT TREE:'));
        
        if (treeStartIndex === -1) {
          return {
            content: [{
              type: 'text',
              text: 'No projects found in configuration'
            }]
          };
        }
        
        // Find where tree section ends (next major section)
        const treeEndIndex = lines.findIndex((line, idx) => 
          idx > treeStartIndex && line.match(/^[A-Z ]+:$/)
        );
        
        const treeLines = lines.slice(
          treeStartIndex, 
          treeEndIndex === -1 ? undefined : treeEndIndex
        );
        
        let output = '📂 **Projects in Claude Code Configuration**\n\n';
        
        // Extract project count from overview if available
        const overviewLine = lines.find(line => line.includes('Total projects:'));
        if (overviewLine) {
          const projectCount = overviewLine.match(/(\d+)/)?.[1];
          if (projectCount) {
            output += `**Total Projects:** ${projectCount}\n\n`;
          }
        }
        
        // Add the tree structure
        treeLines.forEach(line => {
          if (line.trim() && !line.includes('PROJECT TREE:')) {
            output += line + '\n';
          }
        });
        
        if (params.includeStats) {
          // Add additional stats from the overview section
          const configSizeLine = lines.find(line => line.includes('Total config size:'));
          if (configSizeLine) {
            output += '\n**Configuration Stats:**\n';
            output += `${configSizeLine.trim()}\n`;
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: output.trim() || 'No projects found in configuration'
          }]
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text',
        text: `Error: ${errorMessage}`,
      }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr to avoid interfering with stdio protocol
  console.error('Claude Code Helper MCP server started (CLI-based)');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});