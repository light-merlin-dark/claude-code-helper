/**
 * Progress indicator utilities for long-running operations
 */

export class ProgressIndicator {
  private spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  private message: string;
  
  constructor(message: string) {
    this.message = message;
  }
  
  start(): void {
    // Clear any existing interval
    this.stop();
    
    // Hide cursor
    process.stdout.write('\x1B[?25l');
    
    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.spinner[this.currentIndex]} ${this.message}`);
      this.currentIndex = (this.currentIndex + 1) % this.spinner.length;
    }, 80);
  }
  
  update(message: string): void {
    this.message = message;
  }
  
  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    // Clear the line and show cursor
    process.stdout.write('\r\x1B[K');
    process.stdout.write('\x1B[?25h');
    
    if (finalMessage) {
      console.log(finalMessage);
    }
  }
}

/**
 * Progress bar for operations with known total
 */
export class ProgressBar {
  private total: number;
  private current: number = 0;
  private width: number = 40;
  private message: string;
  
  constructor(total: number, message: string = 'Progress') {
    this.total = total;
    this.message = message;
  }
  
  update(current: number): void {
    this.current = Math.min(current, this.total);
    this.render();
  }
  
  increment(): void {
    this.update(this.current + 1);
  }
  
  private render(): void {
    const percentage = Math.floor((this.current / this.total) * 100);
    const filled = Math.floor((this.current / this.total) * this.width);
    const empty = this.width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    process.stdout.write(
      `\r${this.message}: [${bar}] ${percentage}% (${this.current}/${this.total})`
    );
    
    if (this.current === this.total) {
      console.log(); // New line when complete
    }
  }
  
  complete(message?: string): void {
    this.update(this.total);
    if (message) {
      console.log(message);
    }
  }
}

/**
 * Simple progress logger for operations without spinners
 */
export class ProgressLogger {
  private startTime: number;
  
  constructor() {
    this.startTime = Date.now();
  }
  
  log(message: string): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] ${message}`);
  }
  
  complete(message: string): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`✓ ${message} (${elapsed}s)`);
  }
}

/**
 * Wrap an async operation with a progress indicator
 */
export async function withProgress<T>(
  message: string,
  operation: () => Promise<T>
): Promise<T> {
  const progress = new ProgressIndicator(message);
  progress.start();
  
  try {
    const result = await operation();
    progress.stop(`✓ ${message}`);
    return result;
  } catch (error) {
    progress.stop(`✗ ${message}`);
    throw error;
  }
}

/**
 * Process items with progress bar
 */
export async function processWithProgress<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  message: string = 'Processing'
): Promise<R[]> {
  const progress = new ProgressBar(items.length, message);
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i++) {
    results.push(await processor(items[i], i));
    progress.increment();
  }
  
  return results;
}