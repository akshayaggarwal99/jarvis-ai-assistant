const COMMAND_PATHS: Record<string, string> = {
  ls: '/bin/ls',
  pwd: '/bin/pwd',
  uname: '/usr/bin/uname',
  whoami: '/usr/bin/whoami',
  date: '/bin/date',
  sw_vers: '/usr/bin/sw_vers'
};

const PUBLIC_READ_ROOTS = ['/Applications', '/System/Applications', '/usr/bin', '/bin'];

const SHELL_SYNTAX = /[;&|><`$(){}\[\]\n\r\\]/;

export type SafeCommand = { executable: string; args: string[] };

/** Parse a deliberately tiny system-information command subset without a shell. */
export function parseSafeCommand(command: string): SafeCommand {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('Command is empty');
  }
  if (SHELL_SYNTAX.test(trimmed) || trimmed.includes('\0')) {
    throw new Error('Shell operators, substitutions, escapes, and redirections are not allowed');
  }

  const parts = trimmed.split(/\s+/);
  const commandName = parts.shift()!;
  const executable = COMMAND_PATHS[commandName];
  if (!executable) {
    throw new Error(`Command '${commandName}' is not allowed`);
  }

  for (const argument of parts) {
    if (argument === '..' || argument.startsWith('../') || argument.includes('/../')) {
      throw new Error('Parent-directory traversal is not allowed');
    }
    if (argument.startsWith('/') && !PUBLIC_READ_ROOTS.some(root => argument === root || argument.startsWith(`${root}/`))) {
      throw new Error('Access to private filesystem paths is not allowed');
    }
  }

  return { executable, args: parts };
}

export const allowedCommandNames = (): string[] => Object.keys(COMMAND_PATHS);
