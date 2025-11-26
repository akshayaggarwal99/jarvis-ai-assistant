import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export enum LogLevel {
  ERROR = 0,
  WARNING = 1, 
  INFO = 2,
  SUCCESS = 3,
  DEBUG = 4,
  PERFORMANCE = 5
}

export class Logger {
  private static isDev = process.env.NODE_ENV === 'development';
  private static logFilePath = path.join(os.homedir(), 'Library', 'Logs', 'Jarvis', 'jarvis.log');
  private static isInitialized = false;
  
  // Performance optimizations
  private static currentLogLevel = Logger.isDev ? LogLevel.DEBUG : LogLevel.INFO;
  private static fileLoggingEnabled = true;
  private static consoleLoggingEnabled = Logger.isDev;
  private static logBuffer: string[] = [];
  private static maxBufferSize = 100;
  private static lastFlush = Date.now();
  private static flushInterval = 5000; // 5 seconds

  static setLogLevel(level: LogLevel) {
    this.currentLogLevel = level;
  }

  static setFileLogging(enabled: boolean) {
    this.fileLoggingEnabled = enabled;
  }

  static setConsoleLogging(enabled: boolean) {
    this.consoleLoggingEnabled = enabled;
  }

  private static ensureLogDirectory() {
    if (!this.isInitialized) {
      const logDir = path.dirname(this.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      this.isInitialized = true;
    }
  }

  private static shouldLog(level: LogLevel): boolean {
    return level <= this.currentLogLevel;
  }

  static shouldLogLevel(level: LogLevel): boolean {
    return this.shouldLog(level);
  }

  // Lazy evaluation - only process arguments if logging will actually happen
  private static log(level: LogLevel, emoji: string, messageFn: () => string, argsFn?: () => any[]) {
    if (!this.shouldLog(level)) return;

    const message = messageFn();
    const args = argsFn ? argsFn() : [];

    if (this.consoleLoggingEnabled) {
      console.log(`${emoji} ${message}`, ...args);
    }

    if (this.fileLoggingEnabled) {
      this.addToBuffer(this.getLevelName(level), message, args);
    }
  }

  private static getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return 'ERROR';
      case LogLevel.WARNING: return 'WARNING';
      case LogLevel.INFO: return 'INFO';
      case LogLevel.SUCCESS: return 'SUCCESS';
      case LogLevel.DEBUG: return 'DEBUG';
      case LogLevel.PERFORMANCE: return 'PERF';
      default: return 'UNKNOWN';
    }
  }

  private static addToBuffer(level: string, message: string, args: any[]) {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    const logEntry = `[${timestamp}] ${level}: ${message}${argsStr}`;
    
    this.logBuffer.push(logEntry);
    
    // Auto-flush when buffer is full or after time interval
    if (this.logBuffer.length >= this.maxBufferSize || 
        (Date.now() - this.lastFlush) > this.flushInterval) {
      this.flushBuffer();
    }
  }

  private static flushBuffer() {
    if (this.logBuffer.length === 0) return;
    
    try {
      this.ensureLogDirectory();
      const entries = this.logBuffer.join('\n') + '\n';
      fs.appendFileSync(this.logFilePath, entries);
      this.logBuffer = [];
      this.lastFlush = Date.now();
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  // Public logging methods with lazy evaluation for performance
  static info(message: string | (() => string), ...args: any[]) {
    this.log(LogLevel.INFO, 'ℹ️', 
      typeof message === 'string' ? () => message : message,
      args.length > 0 ? () => args : undefined
    );
  }

  static success(message: string | (() => string), ...args: any[]) {
    this.log(LogLevel.SUCCESS, '✅',
      typeof message === 'string' ? () => message : message,
      args.length > 0 ? () => args : undefined
    );
  }

  static warning(message: string | (() => string), ...args: any[]) {
    this.log(LogLevel.WARNING, '⚠️',
      typeof message === 'string' ? () => message : message,
      args.length > 0 ? () => args : undefined
    );
  }

  static error(message: string | (() => string), error?: any) {
    // Errors always get logged regardless of level
    const messageStr = typeof message === 'string' ? message : message();
    if (this.consoleLoggingEnabled) {
      console.error(`❌ ${messageStr}`, error);
    }
    if (this.fileLoggingEnabled) {
      this.addToBuffer('ERROR', messageStr, error ? [error] : []);
    }
  }

  static debug(message: string | (() => string), ...args: any[]) {
    this.log(LogLevel.DEBUG, '🔧',
      typeof message === 'string' ? () => message : message,
      args.length > 0 ? () => args : undefined
    );
  }

  static performance(message: string | (() => string), timeMs: number) {
    this.log(LogLevel.PERFORMANCE, '⚡',
      typeof message === 'string' ? () => `${message}: ${timeMs}ms` : () => `${message()}: ${timeMs}ms`
    );
  }

  // Force flush buffer (useful for shutdown)
  static flush() {
    this.flushBuffer();
  }

  static getLogFilePath(): string {
    return this.logFilePath;
  }
}
