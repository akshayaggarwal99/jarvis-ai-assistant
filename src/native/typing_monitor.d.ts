declare module "typing_monitor" {
  interface TypingMonitor {
    startMonitoring(callback: (event: string) => void): boolean;
    stopMonitoring(): boolean;
    checkAccessibilityPermissions(): boolean;
    fastPasteText(text: string): boolean;
  }

  const typingMonitor: TypingMonitor;
  export = typingMonitor;
}
