import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { appLauncherService } from "../services/app-launcher-service";
import { smartBrowserService } from "../services/smart-browser-service";
import { Logger } from "../core/logger";

/**
 * App Launcher Tool for Jarvis Agent
 * Handles natural language commands to open apps, websites, and perform searches
 */
export const appLauncherTool = tool(
  async ({ command, directExecution = true }) => {
    try {
      Logger.info('🚀 [AppLauncher] Tool activated with command:', command);
      Logger.info('🚀 [AppLauncher] Direct execution:', directExecution);
      
      // Check if this is a text input automation request
      const textInputMatch = command.match(/(?:write|type|add|input)\s+(['"]?)(.*?)\1\s+(?:into|in(?:\s+the)?|to(?:\s+the)?)\s+(.*?)(?:\s+app)?$/i);
      if (textInputMatch) {
        const [, , textToWrite, targetApp] = textInputMatch;
        Logger.info('📝 [AppLauncher] Text input automation detected:', { textToWrite, targetApp });
        
        // First open the target app
        const appIntent = await appLauncherService.parseIntent(`open ${targetApp}`);
        const appOpened = await appLauncherService.executeIntent(appIntent);
        
        if (appOpened) {
          // Give the app time to open and become active
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Use AppleScript to type the text (for macOS)
          const { exec } = require('child_process');
          const escapedText = textToWrite.replace(/'/g, "\\'");
          const script = `osascript -e 'tell application "System Events" to keystroke "${escapedText}"'`;
          
          try {
            await new Promise((resolve, reject) => {
              exec(script, (error: any, stdout: any, stderr: any) => {
                if (error) {
                  Logger.error('❌ [AppLauncher] Text input failed:', error);
                  reject(error);
                } else {
                  Logger.success('✅ [AppLauncher] Text input successful');
                  resolve(stdout);
                }
              });
            });
            
            return `✅ Successfully opened ${targetApp} and wrote "${textToWrite}" into it!`;
          } catch (error) {
            return `✅ Successfully opened ${targetApp}, but couldn't automatically type the text. Please type "${textToWrite}" manually.`;
          }
        } else {
          return `❌ Couldn't open ${targetApp}. Please try opening it manually first.`;
        }
      }
      
      // First try smart browser automation for complex commands
      const smartActionExecuted = await smartBrowserService.executeSmartAction(command);
      if (smartActionExecuted) {
        Logger.success('✅ [AppLauncher] Smart browser action executed successfully');
        return formatSmartActionSuccess(command);
      }
      
      // Fallback to basic app launcher
      const intent = await appLauncherService.parseIntent(command);
      
      Logger.debug('🎯 [AppLauncher] Parsed intent:', intent);
      
      // If confidence is too low, provide suggestions
      if (intent.confidence < 0.4) {
        const suggestions = generateSuggestions(command);
        return `I'm not sure exactly what you want to open. Here are some suggestions:
${suggestions}

Please be more specific, or try one of these formats:
• "Open [app name]" - to launch an application
• "Go to [website]" - to open a website  
• "Search for [query]" - to search on Google
• "YouTube [query]" - to search on YouTube
• "Play [song] on Spotify" - to search on Spotify`;
      }
      
      if (directExecution) {
        // Execute the intent immediately
        Logger.info('🎯 [AppLauncher] Executing intent:', intent);
        const success = await appLauncherService.executeIntent(intent);
        
        if (success) {
          Logger.success('✅ [AppLauncher] Intent executed successfully');
          return formatSuccessMessage(intent);
        } else {
          Logger.error('❌ [AppLauncher] Intent execution failed');
          return formatErrorMessage(intent);
        }
      } else {
        // Just return what would be executed (for confirmation)
        return formatIntentDescription(intent);
      }
      
    } catch (error) {
      Logger.error('❌ [AppLauncher] Tool error:', error);
      return `Sorry, I encountered an error while trying to process your request: ${error}`;
    }
  },
  {
    name: "appLauncher",
    description: "REQUIRED for opening apps, websites, searches, and text input automation. Use this tool immediately when users request: opening applications (e.g., 'open Spotify'), navigating to websites (e.g., 'go to YouTube'), performing searches (e.g., 'search for cats on YouTube'), or typing text into apps (e.g., 'write my name into Notes app'). This tool handles system automation - do not just describe what you would do, execute it.",
    schema: z.object({
      command: z.string().describe("The exact user command requesting app/website opening or search (e.g., 'open YouTube', 'go to facebook.com', 'search for cats')"),
      directExecution: z.boolean().optional().default(true).describe("Always true - execute the action immediately")
    }),
  }
);

/**
 * Format success message for smart browser actions
 */
function formatSmartActionSuccess(command: string): string {
  return `✅ Successfully executed: "${command}"`;
}

/**
 * Generate helpful suggestions when intent is unclear
 */
function generateSuggestions(command: string): string {
  const installedApps = appLauncherService.getInstalledApps();
  const commandLower = command.toLowerCase();
  
  // Find apps that might match
  const appSuggestions = installedApps
    .filter(app => 
      app.toLowerCase().includes(commandLower) || 
      commandLower.includes(app.toLowerCase())
    )
    .slice(0, 3);
  
  const suggestions: string[] = [];
  
  if (appSuggestions.length > 0) {
    suggestions.push(`📱 Apps: ${appSuggestions.map(app => `"Open ${app}"`).join(', ')}`);
  }
  
  // Common website suggestions
  if (commandLower.includes('tube') || commandLower.includes('video')) {
    suggestions.push('🎥 Websites: "Open YouTube", "Go to youtube.com"');
  }
  
  if (commandLower.includes('social') || commandLower.includes('face')) {
    suggestions.push('👥 Social: "Open Facebook", "Go to instagram.com"');
  }
  
  if (commandLower.includes('music') || commandLower.includes('song')) {
    suggestions.push('🎵 Music: "Open Spotify", "Search for [song] on Spotify"');
  }
  
  // Search suggestions
  suggestions.push(`🔍 Search: "Search for ${command}", "YouTube ${command}"`);
  
  return suggestions.join('\n');
}

/**
 * Format success message based on intent type
 */
function formatSuccessMessage(intent: any): string {
  switch (intent.action) {
    case 'open_app':
      return `✅ Successfully opened ${intent.appName}!`;
    
    case 'open_website':
      return `✅ Successfully opened ${intent.website}!`;
    
    case 'search_web':
      const platform = intent.searchEngine === 'google' ? 'Google' : 
                      intent.searchEngine === 'youtube' ? 'YouTube' :
                      intent.searchEngine === 'spotify' ? 'Spotify' :
                      intent.searchEngine === 'amazon' ? 'Amazon' : 'the web';
      return `✅ Successfully searched for "${intent.query}" on ${platform}!`;
    
    default:
      return '✅ Action completed successfully!';
  }
}

/**
 * Format error message based on intent type - more concise, no multiple retries
 */
function formatErrorMessage(intent: any): string {
  switch (intent.action) {
    case 'open_app':
      return `❌ I couldn't find the app "${intent.appName}". Please check if it's installed or try a different name.`;
    
    case 'open_website':
      return `❌ I couldn't open "${intent.website}". Please check the URL.`;
    
    case 'search_web':
      return `❌ I couldn't search for "${intent.query}". Please try again.`;
    
    default:
      return '❌ I couldn\'t complete that action. Please try again.';
  }
}

/**
 * Format intent description (when not executing directly)
 */
function formatIntentDescription(intent: any): string {
  switch (intent.action) {
    case 'open_app':
      return `I would open the app: ${intent.appName}`;
    
    case 'open_website':
      return `I would open the website: ${intent.website}`;
    
    case 'search_web':
      const platform = intent.searchEngine === 'google' ? 'Google' : 
                      intent.searchEngine === 'youtube' ? 'YouTube' :
                      intent.searchEngine === 'spotify' ? 'Spotify' :
                      intent.searchEngine === 'amazon' ? 'Amazon' : 'the web';
      return `I would search for "${intent.query}" on ${platform}`;
    
    default:
      return 'I would perform the requested action';
  }
}
