declare module 'fn_key_monitor' {
  export function startMonitoring(callback: (event: string) => void): void;
  export function stopMonitoring(): void;
  export function checkAccessibilityPermissions(): boolean;
}
