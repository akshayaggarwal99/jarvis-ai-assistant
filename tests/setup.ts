// Jest setup file for mocking and global configuration

// Mock node-fetch to avoid ES module issues
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200
  }))
}));

// Mock Jimp
jest.mock('jimp', () => ({
  Jimp: jest.fn(),
  JimpMime: {}
}));

// Mock Electron
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((path) => {
      switch (path) {
        case 'userData': return '/tmp/test/userData';
        case 'home': return '/tmp/test/home';
        case 'appData': return '/tmp/test/appData';
        case 'temp': return '/tmp/test/temp';
        case 'desktop': return '/tmp/test/desktop';
        case 'documents': return '/tmp/test/documents';
        case 'downloads': return '/tmp/test/downloads';
        case 'pictures': return '/tmp/test/pictures';
        case 'videos': return '/tmp/test/videos';
        case 'music': return '/tmp/test/music';
        default: return `/tmp/test/${path}`;
      }
    }),
    getVersion: jest.fn(() => '1.0.0'),
    getName: jest.fn(() => 'Jarvis Test'),
    on: jest.fn(),
    quit: jest.fn(),
    isReady: jest.fn(() => true),
    whenReady: jest.fn(() => Promise.resolve())
  },
  dialog: {
    showMessageBox: jest.fn(),
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn()
  },
  BrowserWindow: jest.fn(),
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
    removeAllListeners: jest.fn()
  },
  ipcRenderer: {
    send: jest.fn(),
    on: jest.fn(),
    invoke: jest.fn(),
    removeAllListeners: jest.fn()
  },
  shell: {
    openExternal: jest.fn()
  }
}));

// Mock Firebase Storage with Analytics
jest.mock('../src/storage/firebase-storage', () => ({
  FirebaseStorage: jest.fn().mockImplementation(() => ({
    setUserId: jest.fn(),
    saveSession: jest.fn(),
    getStats: jest.fn().mockResolvedValue(null),
    getUserSessions: jest.fn().mockResolvedValue([]),
    trackEvent: jest.fn()
  }))
}));

// Mock Firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn()
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  collection: jest.fn(),
  addDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn()
}));

jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(),
  logEvent: jest.fn(),
  setUserId: jest.fn(),
  setUserProperties: jest.fn()
}));

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn(),
  execSync: jest.fn(() => '00:00:00:00:00:00')
}));

// Mock fs with proper promises
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn()
  }
}));

// Mock UserFeedbackService
const mockUserFeedbackService = {
  getInstance: jest.fn(() => ({
    showTip: jest.fn(),
    showError: jest.fn(),
    showSuccess: jest.fn(),
    showTranscriptionDrop: jest.fn(),
    suggestCorrection: jest.fn(),
    trackCorrection: jest.fn(),
    getFeedbackHistory: jest.fn(() => []),
    clearFeedback: jest.fn(),
  })),
};

jest.mock('../src/services/user-feedback-service', () => ({
  __esModule: true,
  default: mockUserFeedbackService,
}));

// Mock path module
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((filePath) => filePath ? filePath.split('/').slice(0, -1).join('/') : '/tmp'),
  basename: jest.fn((filePath) => filePath ? filePath.split('/').pop() : 'test'),
  extname: jest.fn((filePath) => filePath ? '.' + filePath.split('.').pop() : '.txt'),
  resolve: jest.fn((...args) => '/' + args.join('/').replace(/\/+/g, '/')),
}));

// Mock FastAssistantTranscriber
jest.mock('../src/transcription/fast-assistant-transcriber', () => ({
  FastAssistantTranscriber: jest.fn().mockImplementation(() => ({
    transcribeFromBuffer: jest.fn().mockResolvedValue({
      text: 'Test transcription',
      model: 'whisper-cloud'
    })
  }))
}));

// Mock common services
jest.mock('../src/services/user-feedback-service', () => {
  const mockUserFeedbackService = {
    showTip: jest.fn(),
    showTroubleshootingGuide: jest.fn()
  };
  
  const MockUserFeedbackServiceClass = jest.fn().mockImplementation(() => mockUserFeedbackService) as any;
  MockUserFeedbackServiceClass.getInstance = jest.fn(() => mockUserFeedbackService);
  
  return {
    __esModule: true,
    UserFeedbackService: MockUserFeedbackServiceClass,
    default: MockUserFeedbackServiceClass
  };
});

jest.mock('../src/services/notification-service', () => ({
  default: {
    getInstance: jest.fn(() => ({
      showCorrectionSuggestions: jest.fn()
    }))
  }
}));

jest.mock('../src/audio/processor', () => ({
  AudioProcessor: {
    showSuccessNotification: jest.fn(),
    showFailureNotification: jest.fn()
  }
}));

// Global test timeout
jest.setTimeout(30000);

// Global test variables
(global as any).keyReleaseTime = Date.now();
(global as any).waveformWindow = {
  webContents: {
    send: jest.fn()
  },
  isDestroyed: jest.fn().mockReturnValue(false)
};
