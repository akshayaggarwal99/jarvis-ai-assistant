import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Simple text response tool - handles user queries intelligently
export const textResponseTool = tool(
  async ({ query }) => {
    // This tool processes the user query and provides context for the LLM
    // It identifies the type of request and formats it appropriately
    
    const lowerQuery = query.toLowerCase();
    
    // IMPORTANT: Do not handle system automation commands - those should use appLauncher tool
    if (lowerQuery.includes('open ') || lowerQuery.includes('launch ') || lowerQuery.includes('start ') || 
        lowerQuery.includes('go to ') || lowerQuery.includes('visit ') || lowerQuery.includes('navigate to ') ||
        lowerQuery.includes('search for ') || lowerQuery.includes('youtube ') || lowerQuery.includes('spotify ') ||
        lowerQuery.includes('amazon ') || lowerQuery.includes('google ') || lowerQuery.includes('facebook') ||
        lowerQuery.includes('instagram') || lowerQuery.includes('twitter') || 
        (lowerQuery.includes('write') && (lowerQuery.includes('into') || lowerQuery.includes('in the'))) ||
        (lowerQuery.includes('type') && (lowerQuery.includes('into') || lowerQuery.includes('in the'))) ||
        (lowerQuery.includes('add') && (lowerQuery.includes('to the') || lowerQuery.includes('into')))) {
      return `SYSTEM_AUTOMATION_REQUEST: ${query}. This should be handled by the appLauncher tool for text input automation.`;
    }
    
    // Detect request type for better processing
    if (lowerQuery.includes('email') || lowerQuery.includes('reply') || lowerQuery.includes('message')) {
      return `Email/Message request: ${query}. Please generate an appropriate email response that is professional and contextual.`;
    }
    
    if (lowerQuery.includes('code') || lowerQuery.includes('function') || lowerQuery.includes('programming')) {
      return `Code-related request: ${query}. Please provide clear, helpful programming assistance.`;
    }
    
    if (lowerQuery.includes('write') || lowerQuery.includes('draft') || lowerQuery.includes('compose')) {
      return `Writing request: ${query}. Please help with professional writing that matches the user's context.`;
    }
    
    // General query
    return `User request: ${query}. Please provide a helpful, concise response.`;
  },
  {
    name: "textResponse",
    description: "Processes user queries for emails, code, writing, and general assistance. DO NOT use for system automation commands like opening apps or websites - use appLauncher tool instead.",
    schema: z.object({
      query: z.string().describe("The user's query or request (NOT for opening apps/websites)"),
    }),
  }
);
