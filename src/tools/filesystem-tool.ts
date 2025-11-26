import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { Logger } from "../core/logger";

/**
 * Cross-platform blocked paths configuration
 */
const getBlockedPaths = () => {
  switch (process.platform) {
    case 'darwin': // macOS
      return [
        '/etc', '/usr/bin', '/bin', '/sbin', '/var/log',
        '/System', '/Library/LaunchDaemons', '/private'
      ];
    case 'win32': // Windows
      return [
        'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
        'C:\\ProgramData', 'C:\\System Volume Information'
      ];
    default: // Linux and others
      return [
        '/etc', '/usr/bin', '/bin', '/sbin', '/var/log',
        '/root', '/boot', '/sys', '/proc'
      ];
  }
};

/**
 * Expand tilde in file paths
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * File System Tool for safe file operations
 * Provides controlled access to reading and basic file operations
 */
export const fileSystemTool = tool(
  async ({ operation, filePath, content, lines, targetPath, recursive }) => {
    try {
      // Expand tilde paths
      const expandedPath = expandPath(filePath);
      const expandedTargetPath = targetPath ? expandPath(targetPath) : undefined;
      Logger.info('📁 [FileSystem Tool] Operation:', { operation, filePath, expandedPath, targetPath: expandedTargetPath });
      
      // Security: Prevent access to sensitive directories
      const blockedPaths = getBlockedPaths();
      
      const isPathBlocked = (pathToCheck: string) => {
        const normalizedPath = path.resolve(pathToCheck);
        return blockedPaths.some(blocked => normalizedPath.startsWith(blocked));
      };
      
      if (isPathBlocked(expandedPath)) {
        return `❌ Access denied: Cannot access system directory ${expandedPath}`;
      }
      
      if (expandedTargetPath && isPathBlocked(expandedTargetPath)) {
        return `❌ Access denied: Cannot access system directory ${expandedTargetPath}`;
      }
      
      switch (operation) {
        case 'read':
          try {
            const fileContent = await fs.readFile(expandedPath, 'utf8');
            const fileSize = fileContent.length;
            
            if (fileSize > 50000) { // 50KB limit
              return `📄 File is large (${fileSize} chars). First 2000 characters:\n\n${fileContent.substring(0, 2000)}...\n\n[File truncated - use 'head' or 'tail' for specific sections]`;
            }
            
            return `📄 File content (${filePath}):\n\n${fileContent}`;
          } catch (error: any) {
            return `❌ Cannot read file: ${error.message}`;
          }
          
        case 'head':
          try {
            const fileContent = await fs.readFile(expandedPath, 'utf8');
            const fileLines = fileContent.split('\n');
            const numLines = lines || 20;
            const headLines = fileLines.slice(0, numLines);
            
            return `📄 First ${numLines} lines of ${filePath}:\n\n${headLines.join('\n')}`;
          } catch (error: any) {
            return `❌ Cannot read file: ${error.message}`;
          }
          
        case 'tail':
          try {
            const fileContent = await fs.readFile(expandedPath, 'utf8');
            const fileLines = fileContent.split('\n');
            const numLines = lines || 20;
            const tailLines = fileLines.slice(-numLines);
            
            return `📄 Last ${numLines} lines of ${filePath}:\n\n${tailLines.join('\n')}`;
          } catch (error: any) {
            return `❌ Cannot read file: ${error.message}`;
          }
          
        case 'stat':
          try {
            const stats = await fs.stat(expandedPath);
            const isDirectory = stats.isDirectory();
            const isFile = stats.isFile();
            const size = stats.size;
            const modified = stats.mtime.toISOString();
            const permissions = (stats.mode & parseInt('777', 8)).toString(8);
            
            return `📊 File info for ${filePath}:
Type: ${isDirectory ? 'Directory' : isFile ? 'File' : 'Other'}
Size: ${size} bytes
Modified: ${modified}
Permissions: ${permissions}`;
          } catch (error: any) {
            return `❌ Cannot get file info: ${error.message}`;
          }
          
        case 'list':
          try {
            const items = await fs.readdir(expandedPath);
            const detailedItems = await Promise.all(
              items.slice(0, 50).map(async (item) => { // Limit to 50 items
                try {
                  const itemPath = path.join(expandedPath, item);
                  const stats = await fs.stat(itemPath);
                  const type = stats.isDirectory() ? 'DIR' : 'FILE';
                  const size = stats.isDirectory() ? '' : ` (${stats.size}b)`;
                  return `${type}: ${item}${size}`;
                } catch {
                  return `?: ${item}`;
                }
              })
            );
            
            return `📂 Contents of ${filePath}:\n\n${detailedItems.join('\n')}${items.length > 50 ? '\n\n[Showing first 50 items]' : ''}`;
          } catch (error: any) {
            return `❌ Cannot list directory: ${error.message}`;
          }
          
        case 'write':
          if (!content) {
            return '❌ Content is required for write operation';
          }
          
          try {
            // Ensure directory exists
            await fs.mkdir(path.dirname(expandedPath), { recursive: true });
            await fs.writeFile(expandedPath, content, 'utf8');
            return `✅ Successfully wrote ${content.length} characters to ${filePath}`;
          } catch (error: any) {
            return `❌ Cannot write file: ${error.message}`;
          }

        case 'mkdir':
          try {
            await fs.mkdir(expandedPath, { recursive: true });
            return `✅ Successfully created directory '${path.basename(expandedPath)}'`;
          } catch (error: any) {
            if (error.code === 'EEXIST') {
              return `✅ Directory '${path.basename(expandedPath)}' already exists`;
            }
            return `❌ Cannot create directory: ${error.message}`;
          }

        case 'move':
          if (!expandedTargetPath) {
            return '❌ Target path is required for move operation';
          }
          
          try {
            // Ensure target directory exists
            await fs.mkdir(path.dirname(expandedTargetPath), { recursive: true });
            await fs.rename(expandedPath, expandedTargetPath);
            return `✅ Successfully moved '${path.basename(expandedPath)}' to '${expandedTargetPath}'`;
          } catch (error: any) {
            return `❌ Cannot move file: ${error.message}`;
          }

        case 'copy':
          if (!expandedTargetPath) {
            return '❌ Target path is required for copy operation';
          }
          
          try {
            // Ensure target directory exists
            await fs.mkdir(path.dirname(expandedTargetPath), { recursive: true });
            await fs.copyFile(expandedPath, expandedTargetPath);
            return `✅ Successfully copied '${path.basename(expandedPath)}' to '${expandedTargetPath}'`;
          } catch (error: any) {
            return `❌ Cannot copy file: ${error.message}`;
          }

        case 'delete':
          try {
            const stats = await fs.stat(expandedPath);
            if (stats.isDirectory()) {
              if (recursive) {
                await fs.rm(expandedPath, { recursive: true, force: true });
                return `✅ Successfully deleted directory '${path.basename(expandedPath)}' and its contents`;
              } else {
                return `❌ Cannot delete directory '${path.basename(expandedPath)}' - use recursive option`;
              }
            } else {
              await fs.unlink(expandedPath);
              return `✅ Successfully deleted file '${path.basename(expandedPath)}'`;
            }
          } catch (error: any) {
            return `❌ Cannot delete: ${error.message}`;
          }
          
        default:
          return `❌ Unknown operation: ${operation}. Available: read, head, tail, stat, list, write, mkdir, move, copy, delete`;
      }
      
    } catch (error: any) {
      Logger.error('❌ [FileSystem Tool] Operation failed:', error);
      return `❌ File system operation failed: ${error.message}`;
    }
  },
  {
    name: "filesystem_tool",
    description: `Safe file system operations for reading and comprehensive file management.

Available operations:
- read: Read entire file content (with size limits)
- head: Read first N lines of a file (default 20)
- tail: Read last N lines of a file (default 20)  
- stat: Get file/directory information (size, permissions, etc.)
- list: List directory contents (up to 50 items)
- write: Write content to a file (creates directories if needed)
- mkdir: Create a new directory
- move: Move a file or directory to a new location
- copy: Copy a file to a new location
- delete: Delete a file or directory (use recursive for directories)

Security: Blocks access to system directories like /etc, /bin, /System.

Examples:
- Read a config file: operation="read", filePath="/Users/user/config.json"
- List files: operation="list", filePath="/Users/user/Documents"
- Create folder: operation="mkdir", filePath="/Users/user/Desktop/NewFolder"
- Move file: operation="move", filePath="/Users/user/file.txt", targetPath="/Users/user/Documents/file.txt"
- Copy file: operation="copy", filePath="/Users/user/file.txt", targetPath="/Users/user/backup.txt"
- Delete file: operation="delete", filePath="/Users/user/oldfile.txt"
- Delete folder: operation="delete", filePath="/Users/user/oldfolder", recursive=true`,
    schema: z.object({
      operation: z.enum(['read', 'head', 'tail', 'stat', 'list', 'write', 'mkdir', 'move', 'copy', 'delete']).describe("The file system operation to perform"),
      filePath: z.string().describe("The path to the file or directory"),
      content: z.string().optional().describe("Content to write (required for write operation)"),
      lines: z.number().optional().describe("Number of lines for head/tail operations (default 20)"),
      targetPath: z.string().optional().describe("Target path for move/copy operations"),
      recursive: z.boolean().optional().describe("Whether to delete directories recursively (for delete operation)")
    })
  }
);
