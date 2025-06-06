export function parseArgs(args: string[]): {
  command?: string;
  commandArgs: string[];
  options: Record<string, any>;
} {
  const options: Record<string, any> = {};
  const commandArgs: string[] = [];
  let command: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      
      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const flagStr = arg.slice(1);
      
      // Check if this is a multi-character flag (like -nc, -bc, etc)
      if (flagStr.length === 2 && ['bc', 'rc', 'ec', 'lc', 'sc', 'ac', 'dc', 'nc', 'dd'].includes(flagStr)) {
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          options[flagStr] = nextArg;
          i++;
        } else {
          options[flagStr] = true;
        }
      } else {
        // Handle single character flags
        const flags = flagStr.split('');
        
        for (let j = 0; j < flags.length; j++) {
          const flag = flags[j];
          
          if (j === flags.length - 1) {
            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
              options[flag] = nextArg;
              i++;
            } else {
              options[flag] = true;
            }
          } else {
            options[flag] = true;
          }
        }
      }
    } else {
      if (!command) {
        command = arg;
      } else {
        commandArgs.push(arg);
      }
    }
  }
  
  return { command, commandArgs, options };
}