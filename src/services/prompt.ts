/**
 * Prompt Service - Handles user input prompts
 */

import * as readline from 'readline';

export class PromptService {
  /**
   * Prompt user for input
   */
  async prompt(message: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  /**
   * Prompt for confirmation (yes/no)
   */
  async confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
    const suffix = defaultValue ? ' (Y/n): ' : ' (y/N): ';
    const answer = await this.prompt(message + suffix);
    
    if (!answer.trim()) {
      return defaultValue;
    }
    
    return answer.toLowerCase().startsWith('y');
  }

  /**
   * Prompt for selection from a list
   */
  async select(message: string, options: string[]): Promise<number> {
    console.log(message);
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option}`);
    });
    
    while (true) {
      const answer = await this.prompt('Select an option (number): ');
      const selection = parseInt(answer, 10);
      
      if (!isNaN(selection) && selection >= 1 && selection <= options.length) {
        return selection - 1;
      }
      
      console.log('Invalid selection. Please enter a number between 1 and ' + options.length);
    }
  }

  /**
   * Prompt for multiple selections from a list
   */
  async multiSelect(message: string, options: string[]): Promise<number[]> {
    console.log(message);
    console.log('(Enter numbers separated by commas, or "all" for all options)');
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option}`);
    });
    
    while (true) {
      const answer = await this.prompt('Select options: ');
      
      if (answer.trim().toLowerCase() === 'all') {
        return options.map((_, index) => index);
      }
      
      const selections = answer.split(',')
        .map(s => parseInt(s.trim(), 10) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < options.length);
      
      if (selections.length > 0) {
        return [...new Set(selections)]; // Remove duplicates
      }
      
      console.log('Invalid selection. Please enter numbers separated by commas.');
    }
  }

  /**
   * Prompt for password (hidden input)
   */
  async password(message: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Hide input
    process.stdin.on('data', () => {
      // Move cursor back and clear the character
      readline.moveCursor(process.stdout, -1, 0);
      readline.clearLine(process.stdout, 1);
      process.stdout.write('*');
    });

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        process.stdin.removeAllListeners('data');
        console.log(); // New line after password
        resolve(answer);
      });
    });
  }
}