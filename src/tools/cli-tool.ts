import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "../core/logger";

const execAsync = promisify(exec);

/**
 * CLI Tool for executing system commands safely
 * Provides controlled access to system tools and utilities
 */
export const cliTool = tool(
  async ({ command, workingDirectory }) => {
    try {
      Logger.info('🖥️ [CLI Tool] Executing command:', { command, workingDirectory });
      
      // Security: Only allow safe commands
      const safeCommands = [
        // File operations
        'ls', 'pwd', 'find', 'grep', 'cat', 'head', 'tail', 'wc',
        // Text processing
        'sed', 'awk', 'sort', 'uniq', 'cut', 'tr',
        // System info
        'ps', 'top', 'df', 'free', 'uname', 'whoami', 'date',
        // Network
        'ping', 'curl', 'wget', 'nslookup', 'dig',
        // Development
        'git', 'npm', 'node', 'python', 'pip', 'brew',
        // macOS specific
        'open', 'say', 'osascript', 'sw_vers', 'system_profiler'
      ];
      
      const commandWord = command.trim().split(' ')[0];
      
      if (!safeCommands.includes(commandWord)) {
        return `❌ Command '${commandWord}' is not allowed for security reasons. Allowed commands: ${safeCommands.join(', ')}`;
      }
      
      const options: any = {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      };
      
      if (workingDirectory) {
        options.cwd = workingDirectory;
      }
      
      const { stdout, stderr } = await execAsync(command, options);
      
      let result = '';
      if (stdout) {
        result += `📤 Output:\n${stdout}`;
      }
      if (stderr) {
        result += `\n⚠️ Warnings/Errors:\n${stderr}`;
      }
      
      Logger.info('✅ [CLI Tool] Command executed successfully');
      return result || '✅ Command executed successfully (no output)';
      
    } catch (error: any) {
      Logger.error('❌ [CLI Tool] Command execution failed:', error);
      
      if (error.code === 'ETIMEDOUT') {
        return '⏰ Command timed out after 30 seconds';
      }
      
      if (error.killed) {
        return '🛑 Command was killed (likely due to timeout or resource limits)';
      }
      
      return `❌ Command failed: ${error.message}`;
    }
  },
  {
    name: "cli_tool",
    description: `Execute safe system commands and CLI tools. 
    
Available command categories:
- File operations: ls, pwd, find, grep, cat, head, tail, wc
- Text processing: sed, awk, sort, uniq, cut, tr  
- System info: ps, top, df, free, uname, whoami, date
- Network: ping, curl, wget, nslookup, dig
- Development: git, npm, node, python, pip, brew
- macOS: open, say, osascript, sw_vers, system_profiler

Examples:
- "ls -la /Applications" - List applications
- "git status" - Check git status
- "npm list -g --depth=0" - List global npm packages
- "curl -s https://api.github.com/users/octocat" - Make API request
- "find . -name '*.ts' | head -10" - Find TypeScript files
- "ps aux | grep node" - Find Node.js processes`,
    schema: z.object({
      command: z.string().describe("The CLI command to execute (only safe commands allowed)"),
      workingDirectory: z.string().optional().describe("Working directory for the command (optional)")
    })
  }
);
