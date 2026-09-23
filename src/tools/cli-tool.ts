import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { Logger } from "../core/logger";
import { allowedCommandNames, parseSafeCommand } from "../security/command-policy";

const execFileAsync = promisify(execFile);

/**
 * CLI Tool for executing system commands safely
 * Provides controlled access to system tools and utilities
 */
export const cliTool = tool(
  async ({ command, workingDirectory }) => {
    try {
      const { executable, args } = parseSafeCommand(command);
      Logger.info('🖥️ [CLI Tool] Executing approved command:', { executable, argCount: args.length, workingDirectory });

      if (workingDirectory) {
        throw new Error('Custom working directories are not allowed');
      }
      
      const options: any = {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024, // 1MB buffer
        cwd: '/Applications'
      };
      
      const { stdout, stderr } = await execFileAsync(executable, args, options);
      
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
    
Available system-information commands: ${allowedCommandNames().join(', ')}.
Shell operators, pipelines, substitutions, redirections, and scripts are rejected.

Examples:
- "ls -la /Applications" - List applications
- "find . -name *.ts" - Find TypeScript files
- "sw_vers" - Show the macOS version`,
    schema: z.object({
      command: z.string().describe("The CLI command to execute (only safe commands allowed)"),
      workingDirectory: z.string().optional().describe("Deprecated; custom working directories are rejected")
    })
  }
);
