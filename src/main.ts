import { route } from './router';
import { RuntimeContext } from './shared/core';
import { logger } from './common';

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  const ctx: RuntimeContext = {
    cwd: process.cwd(),
    env: process.env
  };

  try {
    const result = await route(args, ctx);
    
    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : 'Unknown error occurred');
    process.exit(1);
  }
}