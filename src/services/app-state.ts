import { Logger } from '../core/logger';

export interface TranscriptEntry {
  id: number;
  text: string;
  timestamp: string;
  suggestion?: string;
}

export class AppState {
  private static instance: AppState;
  
  // Application state
  private transcripts: TranscriptEntry[] = [];
  private currentSessionId: string | null = null;
  private conversationContext: string[] = [];
  private currentAudioFile: string | null = null;
  private isCurrentlyInDictationMode: boolean = false;
  private isHandsFreeModeActive: boolean = false;
  private pendingHandsFreeStop: boolean = false;
  
  // Fn key state tracking
  private fnKeyPressed: boolean = false;
  private spaceKeyPressed: boolean = false;
  private lastFnKeyTime: number = 0;
  private pendingSingleTapTimeout: NodeJS.Timeout | null = null;
  
  private constructor() {}
  
  static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState();
    }
    return AppState.instance;
  }
  
  // Transcript management
  addTranscript(text: string, suggestion?: string): TranscriptEntry {
    const entry: TranscriptEntry = {
      id: Date.now(),
      text,
      timestamp: new Date().toISOString(),
      suggestion
    };
    this.transcripts.push(entry);
    return entry;
  }
  
  getTranscripts(): TranscriptEntry[] {
    return [...this.transcripts];
  }
  
  clearTranscripts(): void {
    this.transcripts = [];
  }
  
  // Session management
  startNewSession(): void {
    this.currentSessionId = new Date().toISOString().replace(/[:.]/g, '-');
    this.clearTranscripts();
    this.conversationContext = [];
    Logger.info('Session cleared - fresh start initiated with session:', this.currentSessionId);
  }
  
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }
  
  // Conversation context
  addToContext(text: string): void {
    this.conversationContext.push(text);
    // Keep only last 10 items for context
    if (this.conversationContext.length > 10) {
      this.conversationContext = this.conversationContext.slice(-10);
    }
  }
  
  getConversationContext(): string[] {
    return [...this.conversationContext];
  }
  
  clearConversationContext(): void {
    this.conversationContext = [];
  }
  
  // Audio file tracking
  setCurrentAudioFile(file: string | null): void {
    this.currentAudioFile = file;
  }
  
  getCurrentAudioFile(): string | null {
    return this.currentAudioFile;
  }
  
  // Dictation mode
  setDictationMode(isDictation: boolean): void {
    this.isCurrentlyInDictationMode = isDictation;
    Logger.debug(`🎯 [DictationMode] Set to: ${isDictation}`);
  }
  
  getDictationMode(): boolean {
    return this.isCurrentlyInDictationMode;
  }
  
  // Hands-free mode
  setHandsFreeMode(isActive: boolean): void {
    this.isHandsFreeModeActive = isActive;
  }
  
  isHandsFreeMode(): boolean {
    return this.isHandsFreeModeActive;
  }
  
  setPendingHandsFreeStop(pending: boolean): void {
    this.pendingHandsFreeStop = pending;
  }
  
  isPendingHandsFreeStop(): boolean {
    return this.pendingHandsFreeStop;
  }
  
  // Fn key tracking
  setFnKeyPressed(pressed: boolean): void {
    this.fnKeyPressed = pressed;
  }
  
  isFnKeyPressed(): boolean {
    return this.fnKeyPressed;
  }
  
  setSpaceKeyPressed(pressed: boolean): void {
    this.spaceKeyPressed = pressed;
  }
  
  isSpaceKeyPressed(): boolean {
    return this.spaceKeyPressed;
  }
  
  setLastFnKeyTime(time: number): void {
    this.lastFnKeyTime = time;
  }
  
  getLastFnKeyTime(): number {
    return this.lastFnKeyTime;
  }
  
  setPendingSingleTapTimeout(timeout: NodeJS.Timeout | null): void {
    if (this.pendingSingleTapTimeout) {
      clearTimeout(this.pendingSingleTapTimeout);
    }
    this.pendingSingleTapTimeout = timeout;
  }
  
  clearPendingSingleTapTimeout(): void {
    if (this.pendingSingleTapTimeout) {
      clearTimeout(this.pendingSingleTapTimeout);
      this.pendingSingleTapTimeout = null;
    }
  }
}
