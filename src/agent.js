import { streamText, tool } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { FileReadTool } from './tools/read.js';
import { FileWriteTool } from './tools/write.js';
import { BashTool } from './tools/bash.js';
import { GlobTool } from './tools/glob.js';
import { GrepTool } from './tools/grep.js';
import { EditTool } from './tools/edit.js';

const MAXIM_API_KEY = process.env.MINIMAX_API_KEY;
const MAXIM_BASE_URL = process.env.MAXIM_BASE_URL || 'https://api.minimax.io/anthropic/v1';

export class MaximAgent {
  constructor(options = {}) {
    this.model = options.model || 'MiniMax-M2.7';
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.continueSession = options.continueSession || false;
    this.messages = [];
    this.sessionHistory = [];
  }

  get provider() {
    return createOpenAICompatible({
      baseURL: MAXIM_BASE_URL,
      apiKey: MAXIM_API_KEY,
    });
  }

  get tools() {
    return {
      read: tool({
        description: 'Read file contents',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to read' },
          },
          required: ['filePath'],
        },
        execute: async ({ filePath }) => {
          return new FileReadTool().execute(filePath, this.workingDirectory);
        },
      }),
      write: tool({
        description: 'Write content to a file',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to write' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['filePath', 'content'],
        },
        execute: async ({ filePath, content }) => {
          return new FileWriteTool().execute(filePath, content, this.workingDirectory);
        },
      }),
      edit: tool({
        description: 'Edit a specific part of a file',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to edit' },
            oldString: { type: 'string', description: 'The exact string to replace' },
            newString: { type: 'string', description: 'The new string to replace it with' },
          },
          required: ['filePath', 'oldString', 'newString'],
        },
        execute: async ({ filePath, oldString, newString }) => {
          return new EditTool().execute(filePath, oldString, newString, this.workingDirectory);
        },
      }),
      glob: tool({
        description: 'Find files matching a glob pattern',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern to match (e.g., **/*.js)' },
          },
          required: ['pattern'],
        },
        execute: async ({ pattern }) => {
          return new GlobTool().execute(pattern, this.workingDirectory);
        },
      }),
      grep: tool({
        description: 'Search for text in files',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern to search for' },
            include: { type: 'string', description: 'File pattern to filter by (e.g., *.js)' },
          },
          required: ['pattern'],
        },
        execute: async ({ pattern, include }) => {
          return new GrepTool().execute(pattern, include, this.workingDirectory);
        },
      }),
      bash: tool({
        description: 'Execute a bash command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The bash command to execute' },
          },
          required: ['command'],
        },
        execute: async ({ command }) => {
          return new BashTool().execute(command, this.workingDirectory);
        },
      }),
    };
  }

  systemPrompt() {
    return `You are maxi, an expert AI coding agent built by Taeyun. You help developers with coding tasks.

You have access to powerful tools:
- read: Read file contents
- write: Write content to a file
- edit: Edit specific parts of a file
- glob: Find files matching a pattern
- grep: Search for text in files
- bash: Execute bash commands

Working directory: ${this.workingDirectory}

When using tools:
- Always be concise and focused
- Prefer existing file patterns and conventions
- Ask clarifying questions if needed
- Show your work through file operations, not explanations

Format your responses to include tool calls when needed.`;
  }

  async run(initialMessage) {
    if (this.continueSession && this.messages.length > 0) {
      this.messages.push({ role: 'user', content: initialMessage });
    } else {
      this.messages = [
        { role: 'system', content: this.systemPrompt() },
        { role: 'user', content: initialMessage },
      ];
    }

    let fullResponse = '';
    const toolResults = [];

    const result = await streamText({
      model: this.provider(this.model),
      messages: this.messages,
      tools: this.tools,
      maxTokens: 8192,
    });

    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.delta);
        fullResponse += chunk.delta;
      } else if (chunk.type === 'tool-call') {
        console.log(`\n✱ Calling tool: ${chunk.toolName}`);
        toolResults.push({ tool: chunk.toolName, args: chunk.args });
      }
    }
    
    this.messages.push({ role: 'assistant', content: fullResponse });
    this.sessionHistory.push(...this.messages.slice(-2));

    return {
      response: fullResponse,
      toolCalls: toolResults,
      sessionHistory: this.sessionHistory,
    };
  }
}
