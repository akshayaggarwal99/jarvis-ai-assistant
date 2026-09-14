import { parseSafeCommand } from '../src/security/command-policy';
import { isAllowedProviderUrl, isSafeExternalUrl, isSafeLoopbackHttpUrl } from '../src/security/url-policy';

describe('command policy', () => {
  test('parses an approved command into executable and arguments', () => {
    expect(parseSafeCommand('ls -la /Applications')).toEqual({
      executable: '/bin/ls',
      args: ['-la', '/Applications']
    });
  });

  test.each([
    'ls; open /Applications/Calculator.app',
    'find . | head',
    'ls $(whoami)',
    'cat /etc/passwd',
    'curl https://example.com',
    'head /etc/passwd',
    'ls ../../.ssh',
    'find . -delete',
    'sort -o output.txt input.txt'
  ])('rejects unsafe command: %s', command => {
    expect(() => parseSafeCommand(command)).toThrow();
  });
});

describe('URL policy', () => {
  test('allows ordinary HTTPS links only', () => {
    expect(isSafeExternalUrl('https://github.com/openai')).toBe(true);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('https://user:pass@example.com')).toBe(false);
  });

  test('pins proxy URLs to each provider host', () => {
    expect(isAllowedProviderUrl('openai', 'https://api.openai.com/v1/responses')).toBe(true);
    expect(isAllowedProviderUrl('openai', 'https://evil.example/v1/responses')).toBe(false);
    expect(isAllowedProviderUrl('openai', 'http://api.openai.com/v1/responses')).toBe(false);
    expect(isAllowedProviderUrl('unknown', 'https://api.openai.com/v1/responses')).toBe(false);
  });

  test('limits local-service URLs to loopback', () => {
    expect(isSafeLoopbackHttpUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isSafeLoopbackHttpUrl('http://localhost:11434')).toBe(true);
    expect(isSafeLoopbackHttpUrl('http://192.168.1.20:11434')).toBe(false);
    expect(isSafeLoopbackHttpUrl('http://user:pass@localhost:11434')).toBe(false);
  });
});
