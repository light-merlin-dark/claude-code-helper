import { handleCLI } from './cli';

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  try {
    // Check if running as MCP server
    if (args.includes('--mcp')) {
      // Dynamic import to avoid loading MCP dependencies unless needed
      await import('./mcp-server');
      return;
    }
    
    await handleCLI(args);
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}