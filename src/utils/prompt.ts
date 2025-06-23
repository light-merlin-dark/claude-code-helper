import readline from 'readline';

/**
 * User interaction utilities
 */
export async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function promptConfirm(question: string, defaultValue: boolean = false): Promise<boolean> {
  const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = await promptUser(`${question} ${defaultText}: `);
  
  if (answer === '') {
    return defaultValue;
  }
  
  return answer === 'y' || answer === 'yes';
}