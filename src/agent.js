import { FileReadTool } from './tools/read.js';
import { FileWriteTool } from './tools/write.js';
import { BashTool } from './tools/bash.js';
import { GlobTool } from './tools/glob.js';
import { GrepTool } from './tools/grep.js';
import { EditTool } from './tools/edit.js';

const MAXIM_API_KEY = process.env.MINIMAX_API_KEY;
const MAXIM_BASE_URL = process.env.MAXIM_BASE_URL || 'https://api.minimax.io/anthropic';

export class MaximAgent {
  constructor(options = {}) {
    this.model = options.model || 'MiniMax-M2.7';
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.continueSession = options.continueSession || false;
    this.messages = [];
    this.sessionHistory = [];
  }

  get tools() {
    return {
      read: {
        description: 'Read file contents',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to read' },
          },
          required: ['filePath'],
        },
      },
      write: {
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to write' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['filePath', 'content'],
        },
      },
      edit: {
        description: 'Edit a specific part of a file',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to edit' },
            oldString: { type: 'string', description: 'The exact string to replace' },
            newString: { type: 'string', description: 'The new string to replace it with' },
          },
          required: ['filePath', 'oldString', 'newString'],
        },
      },
      glob: {
        description: 'Find files matching a glob pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern to match' },
          },
          required: ['pattern'],
        },
      },
      grep: {
        description: 'Search for text in files',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern to search for' },
            include: { type: 'string', description: 'File pattern to filter by' },
          },
          required: ['pattern'],
        },
      },
      bash: {
        description: 'Execute a bash command',
        input_schema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The bash command to execute' },
          },
          required: ['command'],
        },
      },
    };
  }

  systemPrompt() {
    return `You are maxi, an expert AI coding agent built by Taeyun. You help developers with coding tasks.

You have access to tools: read, write, edit, glob, grep, bash.

Working directory: ${this.workingDirectory}`;
  }

  async callAPI(messages) {
    const response = await fetch(`${MAXIM_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAXIM_API_KEY}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  async executeTool(toolName, toolInput) {
    const filePath = toolInput.filePath || toolInput.path;
    const content = toolInput.content;
    const command = toolInput.command;
    const pattern = toolInput.pattern;
    const include = toolInput.include;
    const oldString = toolInput.oldString;
    const newString = toolInput.newString;

    switch (toolName) {
      case 'read':
        return new FileReadTool().execute(filePath, this.workingDirectory);
      case 'write':
        return new FileWriteTool().execute(filePath, content, this.workingDirectory);
      case 'edit':
        return new EditTool().execute(filePath, oldString, newString, this.workingDirectory);
      case 'glob':
        return new GlobTool().execute(pattern, this.workingDirectory);
      case 'grep':
        return new GrepTool().execute(pattern, include, this.workingDirectory);
      case 'bash':
        return new BashTool().execute(command, this.workingDirectory);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
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

    try {
      const result = await this.callAPI(this.messages);
      
      // Extract text from response
      const textBlock = result.content?.find(c => c.type === 'text');
      const fullResponse = textBlock?.text || '';

      // Check for tool use
      const toolUses = result.content?.filter(c => c.type === 'tool_use') || [];

      if (toolUses.length > 0) {
        console.log();
        for (const tool of toolUses) {
          console.log(`⚡ Calling tool: ${tool.name}`);
          const toolResult = await this.executeTool(tool.name, tool.input);
          console.log(`Result: ${JSON.stringify(toolResult).slice(0, 200)}`);
          
          this.messages.push({
            role: 'assistant',
            content: result.content.filter(c => c.type !== 'tool_use').map(c => c.text).join('\n')
          });
          this.messages.push({
            role: 'user',
            content: `Tool ${tool.name} result: ${JSON.stringify(toolResult)}`
          });

          // Get follow-up response
          const followUp = await this.callAPI(this.messages);
          const followUpText = followUp.content?.find(c => c.type === 'text')?.text || '';
          console.log(`\n${followUpText}`);
          
          this.messages.push({ role: 'assistant', content: followUpText });
          return { response: followUpText };
        }
      }

      console.log(`\n${fullResponse}`);
      this.messages.push({ role: 'assistant', content: fullResponse });
      this.sessionHistory.push(...this.messages.slice(-2));

      return { response: fullResponse };
    } catch (error) {
      console.error('Error:', error.message);
      throw error;
    }
  }
}
