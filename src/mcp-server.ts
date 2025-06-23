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

// Tool definitions
const TOOLS = [
  {
    name: 'mcp__cch__reload-mcp',
    description: 'Reload MCP configuration from Claude CLI',
    inputSchema: reloadMcpSchema,
  },
  {
    name: 'mcp__cch__doctor',
    description: 'Run comprehensive diagnostics and health checks for Claude Code Helper',
    inputSchema: z.object({}),
  },
  {
    name: 'mcp__cch__view-logs',
    description: 'View Claude Code Helper logs with filtering options',
    inputSchema: viewLogsSchema,
  },
  {
    name: 'mcp__cch__discover-mcp-tools',
    description: 'Discover and analyze MCP tools used across projects with frequency and project details',
    inputSchema: discoverMcpToolsSchema,
  },
  {
    name: 'mcp__cch__list-mcps',
    description: 'List all MCPs found across projects with usage information and project associations',
    inputSchema: listMcpsSchema,
  },
  {
    name: 'mcp__cch__get-mcp-stats',
    description: 'Get comprehensive statistics about MCP usage across all projects',
    inputSchema: getMcpStatsSchema,
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
      case 'mcp__cch__reload-mcp': {
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
      
      case 'mcp__cch__doctor': {
        const output = executeCliCommand('npx claude-code-helper --doctor');
        
        return {
          content: [{
            type: 'text',
            text: parseCliOutput(output),
          }],
        };
      }
      
      case 'mcp__cch__view-logs': {
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
      
      case 'mcp__cch__discover-mcp-tools': {
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
      
      case 'mcp__cch__list-mcps': {
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
      
      case 'mcp__cch__get-mcp-stats': {
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