import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { Logger } from "../core/logger";

/**
 * Configuration for file organization
 */
const ORGANIZATION_CONFIG = {
  maxDisplayFiles: 5,
  maxDisplayErrors: 3,
  fileCategories: {
    Documents: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.pages', '.odt', '.xls', '.xlsx', '.ppt', '.pptx'],
    Images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.svg', '.webp', '.ico', '.heic'],
    Videos: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp'],
    Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
    Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.dmg', '.pkg', '.deb', '.rpm'],
    Scripts: ['.js', '.ts', '.py', '.sh', '.bat', '.html', '.css', '.json', '.xml', '.yml', '.yaml']
  },
  categoryIcons: {
    Documents: '📄',
    Images: '🖼️',
    Videos: '🎥',
    Audio: '🎵',
    Archives: '📦',
    Scripts: '💻',
    Other: '📂'
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
 * File Organization Tool - handles complex file organization workflows
 * Can create folders and organize files by type in a single operation
 */
export const fileOrganizerTool = tool(
  async ({ action, directoryPath, organizationType }) => {
    try {
      const expandedPath = expandPath(directoryPath);
      Logger.info('🗂️ [FileOrganizer Tool] Operation:', { action, directoryPath, expandedPath, organizationType });
      
      // Security: Prevent access to sensitive directories
      const blockedPaths = process.platform === 'darwin' ? [
        '/etc', '/usr/bin', '/bin', '/sbin', '/var/log',
        '/System', '/Library/LaunchDaemons', '/private'
      ] : process.platform === 'win32' ? [
        'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
        'C:\\ProgramData', 'C:\\System Volume Information'
      ] : [
        '/etc', '/usr/bin', '/bin', '/sbin', '/var/log',
        '/root', '/boot', '/sys', '/proc'
      ];
      
      const normalizedPath = path.resolve(expandedPath);
      const isBlocked = blockedPaths.some(blocked => 
        normalizedPath.startsWith(blocked)
      );
      
      if (isBlocked) {
        return `❌ Access denied: Cannot access system directory ${normalizedPath}`;
      }

      if (action === 'organize') {
        return await organizeFiles(expandedPath, organizationType);
      } else if (action === 'list_with_analysis') {
        return await listAndAnalyzeFiles(expandedPath);
      }
      
      return `❌ Unknown action: ${action}. Available: organize, list_with_analysis`;
      
    } catch (error: any) {
      Logger.error('❌ [FileOrganizer Tool] Operation failed:', error);
      return `❌ File organization failed: ${error.message}`;
    }
  },
  {
    name: "file_organizer_tool",
    description: `Advanced file organization tool that can create folders and organize files by type in a single operation.

Available actions:
- organize: Create appropriate folders and organize files by type
- list_with_analysis: List files with organization recommendations

Organization types:
- by_type: Organize by file extensions (Documents, Images, Videos, etc.)
- by_date: Organize by creation/modification date
- smart: Intelligent organization based on file types and names

Examples:
- Organize desktop by type: action="organize", directoryPath="~/Desktop", organizationType="by_type"
- Analyze before organizing: action="list_with_analysis", directoryPath="~/Desktop"`,
    schema: z.object({
      action: z.enum(['organize', 'list_with_analysis']).describe("The organization action to perform"),
      directoryPath: z.string().describe("The directory path to organize"),
      organizationType: z.enum(['by_type', 'by_date', 'smart']).optional().describe("How to organize the files (default: by_type)")
    })
  }
);

/**
 * List files and provide organization analysis
 */
async function listAndAnalyzeFiles(dirPath: string): Promise<string> {
  try {
    const items = await fs.readdir(dirPath);
    const analysis: { [key: string]: string[] } = {
      Documents: [],
      Images: [],
      Videos: [],
      Audio: [],
      Archives: [],
      Scripts: [],
      Other: []
    };
    
    let totalFiles = 0;
    let skippedFolders = 0;
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      try {
        const stats = await fs.stat(itemPath);
        
        if (stats.isFile()) {
          totalFiles++;
          const ext = path.extname(item).toLowerCase();
          const category = categorizeFile(ext);
          analysis[category].push(item);
        } else if (stats.isDirectory()) {
          skippedFolders++;
        }
      } catch {
        // Skip items we can't access
      }
    }
    
    let result = `📊 File Analysis for ${dirPath}:\n\n`;
    result += `Total files: ${totalFiles}`;
    if (skippedFolders > 0) {
      result += ` (${skippedFolders} folders skipped)`;
    }
    result += '\n\n';
    
    for (const [category, files] of Object.entries(analysis)) {
      if (files.length > 0) {
        result += `${getCategoryIcon(category)} ${category}: ${files.length} files\n`;
        if (files.length <= ORGANIZATION_CONFIG.maxDisplayFiles) {
          result += `   ${files.join(', ')}\n`;
        } else {
          result += `   ${files.slice(0, 3).join(', ')}, ... and ${files.length - 3} more\n`;
        }
        result += '\n';
      }
    }
    
    if (totalFiles > 0) {
      result += `💡 Organization suggestion: I can create folders (Documents, Images, Videos, etc.) and move files to appropriate categories.`;
    } else if (skippedFolders > 0) {
      result += `✨ Directory contains only folders - already organized.`;
    } else {
      result += `✨ Directory is empty.`;
    }
    
    return result;
    
  } catch (error: any) {
    return `❌ Cannot analyze directory: ${error.message}`;
  }
}

/**
 * Organize files in a directory by creating appropriate folders and moving files
 */
async function organizeFiles(dirPath: string, orgType: string = 'by_type'): Promise<string> {
  try {
    const items = await fs.readdir(dirPath);
    const fileOperations: { file: string; targetCategory: string; targetPath: string }[] = [];
    const foldersToCreate = new Set<string>();
    const skippedItems: string[] = [];
    
    // Analyze files and plan operations
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      try {
        const stats = await fs.stat(itemPath);
        
        if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          const category = categorizeFile(ext);
          
          if (category !== 'Other') { // Don't move miscellaneous files
            const folderName = category;
            const folderPath = path.join(dirPath, folderName);
            const targetPath = path.join(folderPath, item);
            
            foldersToCreate.add(folderPath);
            fileOperations.push({
              file: item,
              targetCategory: category,
              targetPath
            });
          } else {
            skippedItems.push(`${item} (misc file)`);
          }
        } else if (stats.isDirectory()) {
          skippedItems.push(`${item} (folder)`);
        }
      } catch (error: any) {
        skippedItems.push(`${item} (access denied)`);
      }
    }
    
    if (fileOperations.length === 0) {
      let result = `✨ No files need organizing in ${dirPath}`;
      if (skippedItems.length > 0) {
        result += `\n\nSkipped items (${skippedItems.length}): ${skippedItems.slice(0, ORGANIZATION_CONFIG.maxDisplayFiles).join(', ')}`;
        if (skippedItems.length > ORGANIZATION_CONFIG.maxDisplayFiles) {
          result += `, ... and ${skippedItems.length - ORGANIZATION_CONFIG.maxDisplayFiles} more`;
        }
      }
      return result;
    }
    
    let result = `🗂️ Organizing ${fileOperations.length} files in ${dirPath}:\n\n`;
    
    // Create folders
    for (const folderPath of foldersToCreate) {
      try {
        await fs.mkdir(folderPath, { recursive: true });
        const folderName = path.basename(folderPath);
        result += `📁 Created folder: ${folderName}\n`;
      } catch (error: any) {
        if (error.code !== 'EEXIST') {
          result += `⚠️ Could not create folder ${path.basename(folderPath)}: ${error.message}\n`;
        } else {
          const folderName = path.basename(folderPath);
          result += `📁 Using existing folder: ${folderName}\n`;
        }
      }
    }
    
    result += '\n';
    
    // Move files
    const moveResults: { [key: string]: string[] } = {};
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    
    for (const op of fileOperations) {
      try {
        const sourcePath = path.join(dirPath, op.file);
        
        // Check if target already exists
        try {
          await fs.access(op.targetPath);
          // File exists, skip or rename
          const newName = `${path.parse(op.file).name}_copy${path.extname(op.file)}`;
          const newTargetPath = path.join(path.dirname(op.targetPath), newName);
          await fs.rename(sourcePath, newTargetPath);
          op.file = `${op.file} → ${newName}`;
        } catch {
          // File doesn't exist, normal move
          await fs.rename(sourcePath, op.targetPath);
        }
        
        if (!moveResults[op.targetCategory]) {
          moveResults[op.targetCategory] = [];
        }
        moveResults[op.targetCategory].push(op.file);
        successCount++;
      } catch (error: any) {
        const errorMsg = `${op.file}: ${error.message}`;
        errors.push(errorMsg);
        errorCount++;
      }
    }
    
    // Report results
    for (const [category, files] of Object.entries(moveResults)) {
      result += `${getCategoryIcon(category)} Moved to ${category}: ${files.length} files\n`;
      if (files.length <= 3) {
        result += `   ${files.join(', ')}\n`;
      } else {
        result += `   ${files.slice(0, 2).join(', ')}, ... and ${files.length - 2} more\n`;
      }
      result += '\n';
    }
    
    // Report skipped items
    if (skippedItems.length > 0) {
      result += `⏭️ Skipped (${skippedItems.length}): ${skippedItems.slice(0, 3).join(', ')}`;
      if (skippedItems.length > 3) {
        result += `, ... and ${skippedItems.length - 3} more`;
      }
      result += '\n\n';
    }
    
    result += `✅ Organization complete: ${successCount} files moved`;
    if (errorCount > 0) {
      result += `, ${errorCount} errors`;
      result += `\n\n❌ Errors:\n${errors.slice(0, ORGANIZATION_CONFIG.maxDisplayErrors).join('\n')}`;
      if (errors.length > ORGANIZATION_CONFIG.maxDisplayErrors) {
        result += `\n... and ${errors.length - ORGANIZATION_CONFIG.maxDisplayErrors} more errors`;
      }
    }
    
    return result;
    
  } catch (error: any) {
    return `❌ Cannot organize directory: ${error.message}`;
  }
}

/**
 * Categorize a file based on its extension
 */
function categorizeFile(extension: string): string {
  for (const [category, extensions] of Object.entries(ORGANIZATION_CONFIG.fileCategories)) {
    if (extensions.includes(extension)) {
      return category;
    }
  }
  return 'Other';
}

/**
 * Get emoji icon for category
 */
function getCategoryIcon(category: string): string {
  return ORGANIZATION_CONFIG.categoryIcons[category] || ORGANIZATION_CONFIG.categoryIcons.Other;
}
