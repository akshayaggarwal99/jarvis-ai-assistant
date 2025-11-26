/**
 * Nudge HTML templates and messages
 */

export interface NudgeMessage {
  main: string;
  sub: string;
}

// Inspiring quotes about voice dictation
export const inspiringMessages: NudgeMessage[] = [
  { main: 'Voice is 3x faster than typing', sub: 'Average 150 WPM vs 40 WPM typing' },
  { main: 'Save 2 hours per day with voice', sub: 'Join thousands of power users' },
  { main: 'Your thoughts at the speed of speech', sub: 'No more typing fatigue' },
  { main: 'Professionals dictate 80% of their work', sub: 'Doctors, lawyers, writers use voice' },
  { main: 'Voice typing reduces RSI by 70%', sub: 'Give your hands a break' },
  { main: '🎯 Hit your deadlines faster', sub: 'Voice users finish work 40% quicker' },
  { main: 'Focus on ideas, not keystrokes', sub: 'Let your creativity flow' },
  { main: 'Top performers use voice', sub: '10x your productivity today' },
  { main: 'From thought to text instantly', sub: 'No more writer\'s block' },
  { main: 'Join the voice revolution', sub: '5 million users and growing' },
  { main: 'Work smarter, not harder', sub: 'Voice saves 70% of typing time' },
  { main: '⚡ Lightning-fast documentation', sub: 'Speak naturally, type perfectly' },
  { main: 'Your personal transcriptionist', sub: 'AI-powered accuracy at your fingertips' },
  { main: 'Break free from the keyboard', sub: 'Express yourself naturally' },
  { main: '🏆 Champions use voice', sub: 'Join the productivity elite' },
  { main: 'Think it. Say it. Done.', sub: 'The future of writing is here' },
  { main: 'Emails in seconds, not minutes', sub: 'Reply 5x faster with voice' },
  { main: 'Code comments at light speed', sub: 'Document as you think' },
  { main: 'Meeting notes? Just speak them', sub: 'Never miss important details' },
  { main: '🚀 Unlock your full potential', sub: 'Voice is your superpower' }
];

// Special messages for very new users
export const newUserMessages: NudgeMessage[] = [
  { main: '👋 Try voice typing - it\'s magical!', sub: 'Just hold Fn and speak' },
  { main: 'Welcome! Voice is 3x faster', sub: 'Give it a try with Fn key' },
  { main: '🚀 Ready to type faster?', sub: 'Hold Fn and start speaking' }
];

export function getRandomMessage(isNewUser: boolean, totalNudgesShown: number): NudgeMessage {
  const messages = isNewUser && totalNudgesShown <= 1 ? newUserMessages : inspiringMessages;
  return messages[Math.floor(Math.random() * messages.length)];
}

export function getNudgeHTML(isNewUser: boolean, message: NudgeMessage): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: transparent;
      overflow: hidden;
      cursor: default;
      -webkit-user-select: none;
      user-select: none;
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .nudge-container {
      background: rgba(0, 0, 0, 0.9);
      border-radius: 8px;
      padding: 20px;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      pointer-events: auto;
      animation: fadeIn 0.3s ease-out;
    }
    .nudge-content { display: flex; align-items: center; gap: 12px; }
    .nudge-text-container { flex: 1; }
    .nudge-text {
      color: white;
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 6px;
      line-height: 1.4;
      letter-spacing: -0.01em;
      -webkit-font-smoothing: antialiased;
    }
    .nudge-subtitle {
      color: rgba(255, 255, 255, 0.85);
      font-size: 13px;
      font-weight: 400;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    .nudge-action {
      color: rgba(255, 255, 255, 0.7);
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .fn-key {
      background: rgba(255, 255, 255, 0.25);
      color: white;
      padding: 3px 7px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      font-family: 'SF Mono', 'Monaco', monospace;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    .close-btn {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-size: 18px;
      cursor: pointer;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: color 0.2s;
    }
    .close-btn:hover { color: white; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .nudge-container.fade-out { animation: fadeOut 0.3s ease-out; }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
  </style>
</head>
<body>
  <div class="nudge-container" id="nudgeContainer">
    <div class="nudge-content">
      <div class="nudge-text-container">
        <div class="nudge-text">${message.main}</div>
        <div class="nudge-subtitle">${message.sub}</div>
        <div class="nudge-action">Press and hold <span class="fn-key">Fn</span> to start</div>
      </div>
      <button class="close-btn" onclick="closeNudge()">×</button>
    </div>
  </div>
  <script>
    let isClosing = false;
    function closeNudge() {
      if (isClosing) return;
      isClosing = true;
      const container = document.getElementById('nudgeContainer');
      container.classList.add('fade-out');
      if (window.electronAPI?.nudgeRecordTyping) window.electronAPI.nudgeRecordTyping();
      setTimeout(() => { if (window.electronAPI?.nudgeClose) window.electronAPI.nudgeClose(); }, 250);
    }
    setTimeout(() => closeNudge(), ${isNewUser ? 8000 : 6000});
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNudge(); });
  </script>
</body>
</html>`;
}
