#!/usr/bin/env bun

/**
 * Simple MCP test helper
 */

import { spawn } from 'child_process';

export function testMcpTool(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const mcpProcess = spawn('bun', ['run', ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let response = '';
    let error = '';

    mcpProcess.stdout.on('data', (data) => {
      response += data.toString();
    });

    mcpProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    mcpProcess.on('close', (code) => {
      if (code !== 0 && error) {
        reject(new Error(error));
      } else {
        resolve(response);
      }
    });

    // Send command
    mcpProcess.stdin.write(command);
    mcpProcess.stdin.end();
  });
}

// If run directly, execute the command
if (import.meta.main) {
  const [mcpPath, method, params] = process.argv.slice(2);
  
  if (!mcpPath || !method) {
    console.log('Usage: test-mcp.ts <mcp-path> <method> [params]');
    process.exit(1);
  }

  const request = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params: params ? JSON.parse(params) : {}
  });

  try {
    const result = await testMcpTool(request + '\n', [mcpPath]);
    console.log(result);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}