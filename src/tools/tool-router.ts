import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { appLauncherTool } from "./app-launcher-tool";
import { textResponseTool } from "./text-response";
import { visionTool } from "./vision-tool";
import { cliTool } from "./cli-tool";
import { fileSystemTool } from "./filesystem-tool";
import { fileOrganizerTool } from "./file-organizer-tool";
import { systemInfoTool } from "./system-info-tool";
import { Logger } from "../core/logger";

/**
 * Intelligent Tool Router
 * Uses LLM to intelligently route user requests to the most appropriate tool
 * Prioritizes reliability and user experience over speed
 */
export const toolRouter = tool(
  async ({ userQuery }) => {
    try {
      Logger.info('🧭 [ToolRouter] Intelligently analyzing query:', userQuery);
      
      // Initialize LLM for tool selection
      const llm = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0, // Deterministic for tool selection
        maxTokens: 500,
      });
      
      // Define available tools and their capabilities
      const toolDescriptions = {
        fileSystemTool: {
          description: "Read, write, list, move, copy, delete files and directories. Handle any file operations.",
          operations: ["read", "write", "list", "stat", "head", "tail", "mkdir", "move", "copy", "delete"],
          examples: ["read a file", "list files in Documents", "create a folder", "move files", "delete file"]
        },
        fileOrganizerTool: {
          description: "Organize and arrange files by type, clean up directories, sort files into folders.",
          operations: ["organize", "arrange", "sort", "clean up", "tidy"],
          examples: ["organize my desktop", "arrange files by type", "clean up downloads folder"]
        },
        cliTool: {
          description: "Execute command line operations, terminal commands, system commands.",
          operations: ["run commands", "execute", "terminal", "shell"],
          examples: ["run ls command", "execute git status", "check running processes"]
        },
        appLauncherTool: {
          description: "Launch applications, open websites, navigate to URLs, search, automation tasks.",
          operations: ["open", "launch", "navigate", "search", "automate"],
          examples: ["open YouTube", "launch Spotify", "search for something", "go to website"]
        },
        systemInfoTool: {
          description: "Get system information, hardware specs, memory usage, running processes.",
          operations: ["system info", "hardware", "memory", "CPU", "processes"],
          examples: ["show system info", "check memory usage", "list running apps"]
        },
        visionTool: {
          description: "Analyze screen content, capture screenshots, describe what's visible.",
          operations: ["analyze", "see", "look", "capture", "describe"],
          examples: ["what do you see", "analyze my screen", "describe what's visible"]
        },
        textResponseTool: {
          description: "General conversation, questions, explanations, anything not requiring tools.",
          operations: ["chat", "explain", "answer", "general"],
          examples: ["how are you", "explain something", "general questions"]
        }
      };
      
      const routingPrompt = `You are a tool router for an AI assistant. Analyze the user's request and determine which tool should handle it.

User Request: "${userQuery}"

Available Tools:
${Object.entries(toolDescriptions).map(([tool, info]) => 
  `- ${tool}: ${info.description}\n  Examples: ${info.examples.join(", ")}`
).join("\n")}

Instructions:
1. Choose the MOST APPROPRIATE tool for this request
2. Extract relevant parameters from the user's query
3. For file operations, determine the operation type and file paths
4. For system commands, identify what needs to be executed
5. Be intelligent about natural language variations

Respond with JSON only:
{
  "tool": "toolName",
  "reasoning": "brief explanation of why this tool was chosen",
  "parameters": {
    // tool-specific parameters extracted from the query
  }
}`;

      Logger.debug('🧭 [ToolRouter] Sending query to LLM for intelligent routing...');
      
      const response = await llm.invoke(routingPrompt);
      const content = response.content as string;
      
      let routingDecision;
      try {
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        routingDecision = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        Logger.error('❌ [ToolRouter] Failed to parse LLM response:', parseError);
        Logger.debug('Raw response:', content);
        // Fallback to text response for safety
        return await textResponseTool.invoke({ query: userQuery });
      }
      
      Logger.info(`🎯 [ToolRouter] LLM selected: ${routingDecision.tool} - ${routingDecision.reasoning}`);
      
      // Route to the selected tool
      switch (routingDecision.tool) {
        case 'fileSystemTool':
          const { operation = 'read', filePath = '.', ...fileParams } = routingDecision.parameters || {};
          return await fileSystemTool.invoke({ operation, filePath, ...fileParams });
          
        case 'fileOrganizerTool':
          const { action = 'organize', directoryPath = '~/Desktop', organizationType = 'by_type' } = routingDecision.parameters || {};
          return await fileOrganizerTool.invoke({ action, directoryPath, organizationType });
          
        case 'cliTool':
          const command = routingDecision.parameters?.command || userQuery;
          return await cliTool.invoke({ command });
          
        case 'appLauncherTool':
          return await appLauncherTool.invoke({ command: userQuery });
          
        case 'systemInfoTool':
          const infoType = routingDecision.parameters?.infoType || 'basic';
          return await systemInfoTool.invoke({ infoType });
          
        case 'visionTool':
          const visionAction = routingDecision.parameters?.action || 'capture';
          return await visionTool.invoke({ action: visionAction, query: userQuery });
          
        case 'textResponseTool':
        default:
          return await textResponseTool.invoke({ query: userQuery });
      }
      
    } catch (error) {
      Logger.error('❌ [ToolRouter] Error in intelligent routing:', error);
      // Fallback to text response to ensure user always gets a response
      return await textResponseTool.invoke({ query: userQuery });
    }
  },
  {
    name: "toolRouter",
    description: "Intelligently routes user requests to the most appropriate tool using LLM-based analysis. Handles any type of user request with high reliability and proper parameter extraction.",
    schema: z.object({
      userQuery: z.string().describe("The complete user query that needs to be intelligently routed to the appropriate tool"),
    }),
  }
);
