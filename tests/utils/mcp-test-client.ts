/**
 * Enhanced MCP Test Client for E2E Testing
 * Provides proper JSON-RPC handling and response parsing
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPTestClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageId: number = 1;
  private pendingRequests: Map<number, {
    resolve: (response: MCPResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private buffer: string = '';
  private initialized: boolean = false;

  constructor(
    private mcpPath: string,
    private options: {
      timeout?: number;
      env?: Record<string, string>;
    } = {}
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.process) {
      throw new Error('Already connected');
    }

    const isTypeScript = this.mcpPath.endsWith('.ts');
    const command = isTypeScript ? 'bun' : this.mcpPath;
    const args = isTypeScript ? ['run', this.mcpPath] : [];

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.options.env }
    });

    this.process.stdout?.on('data', (data) => {
      this.handleData(data.toString());
    });

    this.process.stderr?.on('data', (data) => {
      // MCP servers often log to stderr, only emit as debug
      const message = data.toString();
      this.emit('stderr', message);
      
      // Only treat as error if it looks like a critical error, not just log messages
      if ((message.toLowerCase().includes('error') || 
          message.toLowerCase().includes('fatal')) &&
          !message.includes('[ERROR]') && // Don't treat log messages as errors
          !message.includes('Failed to reload MCP')) { // Expected failure in tests
        this.emit('error', new Error(`MCP error: ${message}`));
      }
    });

    this.process.on('exit', (code) => {
      this.emit('exit', code);
      this.cleanup();
    });

    // Initialize the connection
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const response = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-test-client', version: '1.0.0' }
    });

    if (response.error) {
      throw new Error(`Failed to initialize: ${response.error.message}`);
    }

    this.initialized = true;
    this.emit('initialized', response.result);
  }

  private handleData(data: string): void {
    this.buffer += data;
    
    // Try to parse complete JSON-RPC messages
    const lines = this.buffer.split('\n');
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          this.emit('parse-error', { line, error });
        }
      }
    }
    
    // Keep the incomplete line in the buffer
    this.buffer = lines[lines.length - 1];
  }

  private handleMessage(message: any): void {
    if (message.id !== undefined) {
      // This is a response
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);
        pending.resolve(message as MCPResponse);
      }
    } else {
      // This is a notification or request from server
      this.emit('notification', message);
    }
  }

  async request(method: string, params?: any): Promise<MCPResponse> {
    if (!this.process) {
      throw new Error('Not connected');
    }

    const id = this.messageId++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.options.timeout || 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send the request
      this.process!.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(name: string, args: any = {}): Promise<any> {
    if (!this.initialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.request('tools/call', {
      name,
      arguments: args
    });

    if (response.error) {
      throw new Error(`Tool error: ${response.error.message}`);
    }

    return response.result;
  }

  async listTools(): Promise<any> {
    if (!this.initialized) {
      throw new Error('Client not initialized');
    }

    const response = await this.request('tools/list');

    if (response.error) {
      throw new Error(`List tools error: ${response.error.message}`);
    }

    return response.result;
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.cleanup();
    }
  }

  private cleanup(): void {
    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
    this.process = null;
    this.initialized = false;
    this.buffer = '';
  }
}

// Convenience function for simple tool calls
export async function callMCPTool(
  mcpPath: string,
  toolName: string,
  args: any = {},
  options: { timeout?: number; env?: Record<string, string> } = {}
): Promise<any> {
  const client = new MCPTestClient(mcpPath, options);
  
  try {
    await client.connect();
    const result = await client.callTool(toolName, args);
    return result;
  } finally {
    client.disconnect();
  }
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`Usage: mcp-test-client.ts <mcp-path> <command> [args]

Commands:
  list-tools              - List available tools
  tool <name> <args>      - Call a specific tool
  interactive             - Start interactive mode

Examples:
  bun run tests/utils/mcp-test-client.ts src/mcp-server.ts list-tools
  bun run tests/utils/mcp-test-client.ts src/mcp-server.ts tool doctor
  bun run tests/utils/mcp-test-client.ts src/mcp-server.ts tool view-logs '{"lines":10}'
`);
    process.exit(1);
  }

  const [mcpPath, command, ...cmdArgs] = args;

  async function main() {
    const client = new MCPTestClient(mcpPath);
    
    try {
      await client.connect();
      
      if (command === 'list-tools') {
        const result = await client.listTools();
        console.log(JSON.stringify(result, null, 2));
      } else if (command === 'tool') {
        const [toolName, toolArgs] = cmdArgs;
        if (!toolName) {
          console.error('Tool name is required');
          process.exit(1);
        }
        const args = toolArgs ? JSON.parse(toolArgs) : {};
        const result = await client.callTool(toolName, args);
        console.log(JSON.stringify(result, null, 2));
      } else if (command === 'interactive') {
        console.log('Interactive mode not implemented yet');
      } else {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  }

  main();
}