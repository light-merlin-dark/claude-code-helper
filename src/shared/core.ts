/**
 * Core types and interfaces for Claude Code Helper
 */

import { ServiceRegistry } from '../registry';

export interface CommandArgument {
  name: string;
  description?: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  validator?: (value: any) => boolean | string; // Return true or error message
}

export interface CommandOption {
  flag: string;          // e.g., 'f|force' for -f or --force
  description?: string;
  type: 'string' | 'boolean' | 'number';
  required?: boolean;
  default?: any;
  validator?: (value: any) => boolean | string;
}

export interface CommandSpec<T = any> {
  name: string;
  description?: string;
  help?: string;
  arguments?: CommandArgument[];
  options?: CommandOption[];

  // MCP integration
  mcpEnabled?: boolean;
  mcpName?: string;
  mcpDescription?: string;

  // Execution
  middleware?: CommandMiddleware[];
  execute: (
    args: string[],
    options: CommandOptions,
    ctx: RuntimeContext
  ) => Promise<CommandResult<T>>;
}

export interface RuntimeContext {
  verbose: boolean;
  cwd: string;
  env: Record<string, string>;
  testMode: boolean;
  isViaAgent?: boolean;
  isDryRun?: boolean;
  registry: ServiceRegistry;
  signal?: AbortSignal; // For graceful shutdown
}

export interface CommandResult<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: CommandError;
}

export interface CommandError {
  code: string;
  message: string;
  userMessage?: string;
  details?: any;
  suggestions?: string[];
}

export type CommandOptions = Record<string, any>;

export type CommandMiddleware = (
  args: string[],
  options: CommandOptions,
  ctx: RuntimeContext,
  next: () => Promise<CommandResult>
) => Promise<CommandResult>;

/**
 * Helper to create a command with default middleware
 */
export function createCommand<T = any>(spec: CommandSpec<T>): CommandSpec<T> {
  // Add default middleware
  const defaultMiddleware: CommandMiddleware[] = [
    // Logging middleware
    async (args, options, ctx, next) => {
      const logger = ctx.registry.get<any>('logger');
      const start = Date.now();

      logger.info('Command started', {
        command: spec.name,
        args,
        options,
        isAgent: ctx.isViaAgent,
        testMode: ctx.testMode
      });

      try {
        const result = await next();
        logger.info('Command completed', {
          command: spec.name,
          duration: Date.now() - start,
          success: result.success
        });
        return result;
      } catch (error) {
        logger.error('Command failed', {
          command: spec.name,
          duration: Date.now() - start,
          error
        });
        throw error;
      }
    }
  ];

  return {
    ...spec,
    middleware: [...defaultMiddleware, ...(spec.middleware || [])]
  };
}

/**
 * Execute a command with its middleware chain
 */
export async function executeWithMiddleware(
  command: CommandSpec,
  args: string[],
  options: CommandOptions,
  ctx: RuntimeContext
): Promise<CommandResult> {
  const middleware = command.middleware || [];
  
  // Create the execution chain
  let index = 0;
  
  const next = async (): Promise<CommandResult> => {
    if (index < middleware.length) {
      const currentMiddleware = middleware[index++];
      return currentMiddleware(args, options, ctx, next);
    }
    // Final execution
    return command.execute(args, options, ctx);
  };

  return next();
}