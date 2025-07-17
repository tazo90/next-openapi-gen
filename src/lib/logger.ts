import { OpenApiConfig } from "../types.js";

class Logger {
  private config: OpenApiConfig | null = null;

  init(config: OpenApiConfig) {
    this.config = config;
  }

  private getCallerInfo(): string {
    const stack = new Error().stack;
    if (!stack) return 'Unknown';

    const lines = stack.split('\n');
    // Skip: Error, getCallerInfo, log/warn/error
    const callerLine = lines[3] || lines[2];
    
    // Extract class/function name
    const match = callerLine.match(/at (\w+)\.(\w+)|at (\w+)/);
    if (match) {
      return match[1] || match[3] || 'Unknown';
    }
    
    return 'Unknown';
  }

  log(message: string, ...args: any[]) {
    if (this.config?.debug) {
      const source = this.getCallerInfo();
      console.log(`[${source}] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.config?.debug) {
      const source = this.getCallerInfo();
      console.warn(`[${source}] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    if (this.config?.debug) {
      const source = this.getCallerInfo();
      console.error(`[${source}] ${message}`, ...args);
    }
  }
}

export const logger = new Logger();
