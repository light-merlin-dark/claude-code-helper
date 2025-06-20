#!/usr/bin/env bun
// Test utility to call MCP servers directly - useful for testing and debugging

import { spawn } from 'child_process';

// Test command definitions
const METHODS = {
  init: {
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' }
    }
  },
  'list-tools': {
    method: 'tools/list',
    params: {}
  }
} as const;

async function callMcp(target: string, method: string, params?: any) {
  return new Promise((resolve, reject) => {
    // Check if target is a TypeScript file
    const isTypeScript = target.endsWith('.ts');
    const command = isTypeScript ? 'bun' : target;
    const args = isTypeScript ? ['run', target] : [];
    
    const mcpProcess = spawn(command, args, {
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

    const timeout = setTimeout(() => {
      mcpProcess.kill();
      reject(new Error('MCP call timeout'));
    }, 5000);

    mcpProcess.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error('MCP process exited with code:', code);
        if (error) console.error('Error:', error);
      }
      console.log(response);
      resolve(response);
    });

    // Build JSON-RPC request
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params: params || {}
    };

    // Send request
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    mcpProcess.stdin.end();
  });
}

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`Usage: call-mcp.ts <target> <method> [params]

Commands:
  init              - Initialize MCP connection
  list-tools        - List available tools
  tool <name> <args> - Call a specific tool
  raw <method> <params> - Send raw JSON-RPC method

Examples:
  bun run tests/utils/call-mcp.ts src/mcp-server.ts init
  bun run tests/utils/call-mcp.ts src/mcp-server.ts list-tools
  bun run tests/utils/call-mcp.ts src/mcp-server.ts tool config-set '{"service":"openrouter","key":"models","value":"google/gemini-2.5-pro-preview"}'
  bun run tests/utils/call-mcp.ts src/mcp-server.ts tool consult '{"prompt":"What is 2+2?","models":["openrouter/google/gemini-2.5-pro-preview"]}'
`);
  process.exit(1);
}

const [target, command, ...cmdArgs] = args;

if (!target) {
  console.error('Target is required');
  process.exit(1);
}

// Handle commands
if (command === 'init') {
  const { method, params } = METHODS.init;
  callMcp(target, method, params).catch(console.error);
} else if (command === 'list-tools') {
  const { method, params } = METHODS['list-tools'];
  callMcp(target, method, params).catch(console.error);
} else if (command === 'tool') {
  const [toolName, toolArgs] = cmdArgs;
  if (!toolName) {
    console.error('Tool name is required');
    process.exit(1);
  }
  const params = {
    name: toolName,
    arguments: toolArgs ? JSON.parse(toolArgs) : {}
  };
  callMcp(target, 'tools/call', params).catch(console.error);
} else if (command === 'raw') {
  const [rawMethod, rawParams] = cmdArgs;
  if (!rawMethod) {
    console.error('Method is required for raw command');
    process.exit(1);
  }
  callMcp(target, rawMethod, rawParams ? JSON.parse(rawParams) : {}).catch(console.error);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}