export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  success(message: string, ...args: any[]): void;
  warning(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export interface KeyMonitor {
  start(): boolean;
  stop(): void;
  isActive(): boolean;
}

export interface ShortcutService {
  register(shortcut: string, callback: () => void): boolean;
  unregister(shortcut: string): void;
}
