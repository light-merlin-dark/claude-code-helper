import { CommandSpec, CommandResult, RuntimeContext } from './shared/core';
import { parseArgs } from './common';
import claude from './commands/claude';

const commands: Record<string, CommandSpec> = {
  claude
};

export async function route(args: string[], ctx: RuntimeContext): Promise<CommandResult> {
  const { command, commandArgs, options } = parseArgs(args);

  // Since this is a single-purpose CLI, we'll always use the claude command
  // regardless of what command was specified
  return await claude.execute(commandArgs, options, ctx);
}