/**
 * Tool Registry
 * Manages tool definitions and execution for the unified agent
 */

import { ToolDefinition } from '../core/llm-provider';
import { Logger } from '../core/logger';

// Tool execution function type
export type ToolExecutor = (args: Record<string, any>) => Promise<string>;

// Registered tool with definition and executor
interface RegisteredTool {
    definition: ToolDefinition;
    executor: ToolExecutor;
}

/**
 * ToolRegistry manages all available tools for the agent
 */
export class ToolRegistry {
    private tools: Map<string, RegisteredTool> = new Map();

    /**
     * Register a tool with its definition and executor
     */
    register(
        name: string,
        description: string,
        parameters: ToolDefinition['parameters'],
        executor: ToolExecutor
    ): void {
        this.tools.set(name, {
            definition: { name, description, parameters },
            executor
        });
        Logger.debug(`📦 [ToolRegistry] Registered tool: ${name}`);
    }

    /**
     * Get all tool definitions for LLM function calling
     */
    getToolDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map(t => t.definition);
    }

    /**
     * Execute a tool by name with given arguments
     */
    async execute(name: string, args: Record<string, any>): Promise<string> {
        const tool = this.tools.get(name);
        if (!tool) {
            Logger.error(`❌ [ToolRegistry] Unknown tool: ${name}`);
            return `Error: Unknown tool "${name}"`;
        }

        try {
            Logger.info(`🔧 [ToolRegistry] Executing tool: ${name}`, args);
            const result = await tool.executor(args);
            Logger.info(`✅ [ToolRegistry] Tool ${name} completed`);
            return result;
        } catch (error) {
            Logger.error(`❌ [ToolRegistry] Tool ${name} failed:`, error);
            return `Error executing ${name}: ${error}`;
        }
    }

    /**
     * Check if a tool exists
     */
    has(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Get tool count
     */
    get size(): number {
        return this.tools.size;
    }
}

/**
 * Create and populate the default tool registry with all available tools
 */
export function createDefaultToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();

    // Import existing tools
    const { appLauncherTool } = require('./app-launcher-tool');
    const { visionTool } = require('./vision-tool');
    const { cliTool } = require('./cli-tool');
    const { fileSystemTool } = require('./filesystem-tool');
    const { systemInfoTool } = require('./system-info-tool');

    // Register app launcher
    registry.register(
        'open_app',
        'Open an application, website, or URL. Use for commands like "open YouTube", "launch Chrome", "go to google.com".',
        {
            type: 'object',
            properties: {
                target: {
                    type: 'string',
                    description: 'The app name, website, or URL to open (e.g., "YouTube", "Chrome", "google.com")'
                }
            },
            required: ['target']
        },
        async (args) => {
            return await appLauncherTool.func({ command: `open ${args.target}`, directExecution: true });
        }
    );

    // Register screenshot/vision
    registry.register(
        'capture_screen',
        'Capture a screenshot of the current screen.',
        {
            type: 'object',
            properties: {},
            required: []
        },
        async () => {
            return await visionTool.func({ action: 'capture', query: null });
        }
    );

    // Register screen analysis
    registry.register(
        'analyze_screen',
        'Analyze what is currently visible on the screen and describe it.',
        {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'Optional specific question about the screen content'
                }
            },
            required: []
        },
        async (args) => {
            return await visionTool.func({ action: 'analyze', query: args.question || 'Describe what you see' });
        }
    );

    // Register CLI command
    registry.register(
        'run_command',
        'Execute a terminal/shell command.',
        {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The command to execute (e.g., "ls -la", "git status")'
                }
            },
            required: ['command']
        },
        async (args) => {
            return await cliTool.func({ command: args.command });
        }
    );

    // Register file operations
    registry.register(
        'file_operation',
        'Perform file system operations: read, write, list, delete files.',
        {
            type: 'object',
            properties: {
                operation: {
                    type: 'string',
                    description: 'The operation to perform',
                    enum: ['read', 'write', 'list', 'delete', 'stat']
                },
                path: {
                    type: 'string',
                    description: 'File or directory path'
                },
                content: {
                    type: 'string',
                    description: 'Content to write (for write operation)'
                }
            },
            required: ['operation', 'path']
        },
        async (args) => {
            return await fileSystemTool.func({
                operation: args.operation,
                filePath: args.path,
                content: args.content
            });
        }
    );

    // Register system info
    registry.register(
        'get_system_info',
        'Get system information like memory, CPU, running processes.',
        {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: 'Type of info to retrieve',
                    enum: ['basic', 'memory', 'cpu', 'processes', 'all']
                }
            },
            required: []
        },
        async (args) => {
            return await systemInfoTool.func({ infoType: args.type || 'basic' });
        }
    );

    Logger.info(`📦 [ToolRegistry] Initialized with ${registry.size} tools`);
    return registry;
}
