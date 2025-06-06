import { handleCLI } from './cli';

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  try {
    await handleCLI(args);
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}