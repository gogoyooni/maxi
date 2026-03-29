#!/usr/bin/env node

import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __rootdir = join(__dirname, '..', '..');

// Colors using ANSI codes
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  lightGray: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
};

const s = {
  user: `${C.green}›${C.reset} `,
  assistant: `${C.magenta}‹${C.reset} `,
  thinking: `${C.cyan}◆${C.reset} `,
  tool: `${C.cyan}⚡${C.reset} `,
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const MAX_LINES = 1000;

const HEADER = `
${C.cyan}╔═══════════════════════════════════════════════════════════════╗
║  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗               ║
║  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝               ║
║  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗               ║
║  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║               ║
║  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║               ║
║  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝               ║
║  ██████╗ ███████╗ █████╗ ██████╗██╗ ██╗                    ║
║  ██╔══██╗██╔════╝██╔══██╗██╔════╝██║ ██║                    ║
║  ██████╔╝█████╗ ███████║██║     ███████║                    ║
║  ██╔══██╗██╔══╝ ██╔══██║██║     ██╔══██║                    ║
║  ██║  ██║███████╗██║  ██║╚██████╗██║  ██║                    ║
║  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝                    ║
╚═══════════════════════════════════════════════════════════════╝${C.reset}
`;

class MaxiTUI {
  constructor(options = {}) {
    this.model = options.model || 'MiniMax-M2.7';
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.messages = [];
    this.mode = 'build';
    this.tokenCount = 0;
    this.scrollback = [];
    this.isStreaming = false;
    this.fileTracker = new Map();
  }

  trackFile(filePath) {
    try {
      if (existsSync(filePath)) {
        this.fileTracker.set(filePath, readFileSync(filePath, 'utf-8'));
      } else {
        this.fileTracker.set(filePath, null);
      }
    } catch {
      this.fileTracker.set(filePath, null);
    }
  }

  getOriginalContent(filePath) {
    return this.fileTracker.get(filePath);
  }

  clearFileTracking(filePath) {
    this.fileTracker.delete(filePath);
  }

  async executeTool(toolUse) {
    const { name, input, id } = toolUse;
    
    this.println(`\n  ${s.tool}${C.cyan}${name}${C.reset} ${C.dim}(${id})${C.reset}`);
    
    try {
      let result;
      
      switch (name) {
        case 'read': {
          const filePath = isAbsolute(input.file_path) ? input.file_path : join(this.workingDirectory, input.file_path);
          const content = readFileSync(filePath, 'utf-8');
          result = { content, lines: content.split('\n').length };
          this.println(`  ${C.green}✓ Read ${result.lines} lines${C.reset}`);
          break;
        }
        
        case 'write': {
          const filePath = isAbsolute(input.file_path) ? input.file_path : join(this.workingDirectory, input.file_path);
          this.trackFile(filePath);
          const newContent = input.content;
          writeFileSync(filePath, newContent, 'utf-8');
          const oldContent = this.getOriginalContent(filePath);
          this.showDiff(oldContent, newContent, input.file_path);
          result = { written: true, path: input.file_path };
          break;
        }
        
        case 'edit': {
          const filePath = isAbsolute(input.file_path) ? input.file_path : join(this.workingDirectory, input.file_path);
          this.trackFile(filePath);
          let content = readFileSync(filePath, 'utf-8');
          const oldContent = content;
          
          if (input.old_string) {
            if (input.old_string === content) {
              content = input.new_string;
            } else if (content.includes(input.old_string)) {
              content = content.replace(input.old_string, input.new_string);
            } else {
              throw new Error(`old_string not found in file`);
            }
          } else if (input.replace_all) {
            content = input.new_string;
          } else {
            const lines = content.split('\n');
            const startLine = input.start_line || 0;
            const endLine = input.end_line || lines.length;
            lines.splice(startLine, endLine - startLine, input.new_string);
            content = lines.join('\n');
          }
          
          writeFileSync(filePath, content, 'utf-8');
          this.showDiff(oldContent, content, input.file_path);
          result = { edited: true, path: input.file_path };
          break;
        }
        
        case 'bash': {
          const { command, timeout = 30 } = input;
          this.println(`  ${C.dim}${C.italic}${command}${C.reset}`);
          
          result = await new Promise((resolve, reject) => {
            const proc = spawn(command, [], {
              shell: true,
              cwd: this.workingDirectory,
              timeout: timeout * 1000
            });
            
            let stdout = '';
            let stderr = '';
            
            proc.stdout.on('data', (data) => {
              stdout += data.toString();
            });
            
            proc.stderr.on('data', (data) => {
              stderr += data.toString();
            });
            
            proc.on('close', (code) => {
              resolve({ stdout, stderr, exit_code: code });
            });
            
            proc.on('error', reject);
          });
          
          if (result.stdout) {
            const outputLines = result.stdout.split('\n').slice(0, 50);
            outputLines.forEach(line => this.println(`  ${C.dim}${line}${C.reset}`));
            if (result.stdout.split('\n').length > 50) {
              this.println(`  ${C.dim}...${C.reset}`);
            }
          }
          if (result.stderr) {
            this.println(`  ${C.red}${result.stderr}${C.reset}`);
          }
          this.println(`  ${C.green}✓ Exit code: ${result.exit_code}${C.reset}`);
          break;
        }
        
        default:
          result = { error: `Unknown tool: ${name}` };
      }
      
      return { id, name, result, type: 'tool_result' };
    } catch (error) {
      return { id, name, result: { error: error.message }, type: 'tool_result', is_error: true };
    }
  }

  async executeTools(toolUses) {
    const results = [];
    
    for (const tool of toolUses) {
      const result = await this.executeTool(tool);
      results.push(result);
      
      if (result.result?.error) {
        this.println(`  ${C.red}✗ ${result.result.error}${C.reset}`);
      }
    }
    
    return results;
  }

  systemPrompt() {
    return `You are maxi, an expert AI coding agent built by Taeyun. Use tools when helpful.

Working directory: ${this.workingDirectory}`;
  }

  clearLine() {
    process.stdout.write('\r\x1b[K');
  }

  print(text) {
    process.stdout.write(text);
  }

  println(text) {
    process.stdout.write(text + '\n');
  }

  moveCursorUp(lines = 1) {
    process.stdout.write(`\x1b[${lines}A`);
  }

  moveCursorDown(lines = 1) {
    process.stdout.write(`\x1b[${lines}B`);
  }

  saveCursor() {
    process.stdout.write('\x1b[s');
  }

  restoreCursor() {
    process.stdout.write('\x1b[u');
  }

  async thinkingAnimation(promise) {
    let frame = 0;
    let cleared = false;
    const interval = setInterval(() => {
      process.stdout.write(`\r  ${C.cyan}◆${C.reset} ${C.cyan}Thinking${C.reset} ${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}    `);
      frame++;
    }, 150);

    try {
      const result = await promise;
      clearInterval(interval);
      if (!cleared) {
        this.clearLine();
        this.print(`  ${C.green}✓ Done${C.reset}\n`);
      }
      return result;
    } catch (error) {
      clearInterval(interval);
      this.clearLine();
      this.print(`  ${C.red}✗ Error${C.reset}\n`);
      throw error;
    }
  }

  formatCodeBlock(code, lang = 'code') {
    const lines = code.split('\n');
    const maxLineNumWidth = String(lines.length).length;
    const borderWidth = Math.min(lines.length, MAX_LINES);
    const displayLines = lines.slice(0, MAX_LINES);
    
    let output = `\n${C.yellow}┌─${C.bgBlue} ${lang.toUpperCase()} ${C.reset}${C.yellow}${'─'.repeat(Math.max(0, 56 - maxLineNumWidth - lang.length - 4))}┐${C.reset}\n`;
    
    displayLines.forEach((line, i) => {
      const lineNum = String(i + 1).padStart(maxLineNumWidth, ' ');
      output += `${C.gray}${lineNum}${C.reset} ${C.dim}│${C.reset} ${line}\n`;
    });
    
    if (lines.length > MAX_LINES) {
      output += `${C.gray}${' '.repeat(maxLineNumWidth)} ${C.dim}│${C.reset} ${C.dim}... ${lines.length - MAX_LINES} more lines${C.reset}\n`;
    }
    
    output += `${C.yellow}└${'─'.repeat(maxLineNumWidth + 1)}┘${C.reset}\n`;
    output += `${C.dim}  ${C.italic}Press ${C.reset}${C.green}[c]${C.reset}${C.dim} to copy${C.reset}\n`;
    
    return output;
  }

  showDiff(oldContent, newContent, filePath = '') {
    const oldLines = (oldContent || '').split('\n');
    const newLines = (newContent || '').split('\n');
    
    this.println(`\n  ${C.cyan}📝 ${filePath}${C.reset}`);
    this.println(`  ${C.dim}${'─'.repeat(60)}${C.reset}`);
    
    const maxLines = Math.max(oldLines.length, newLines.length);
    let hasChanges = false;

    for (let i = 0; i < Math.min(maxLines, MAX_LINES); i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        hasChanges = true;
        if (oldLine && !newLine) {
          this.println(`  ${C.red}- ${oldLine}${C.reset}`);
        } else if (!oldLine && newLine) {
          this.println(`  ${C.green}+ ${newLine}${C.reset}`);
        } else {
          this.println(`  ${C.red}- ${oldLine}${C.reset}`);
          this.println(`  ${C.green}+ ${newLine}${C.reset}`);
        }
      }
    }

    if (!hasChanges) {
      this.println(`  ${C.green}  (no changes)${C.reset}`);
    }
    
    if (maxLines > MAX_LINES) {
      this.println(`  ${C.dim}... ${maxLines - MAX_LINES} more lines${C.reset}`);
    }
    this.println('');
  }

  async parseAndDisplay(text, isStreaming = false) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', lang: match[1] || 'code', code: match[2].trimEnd() });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    for (const part of parts) {
      if (part.type === 'text') {
        const lines = part.content.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.println(`${s.assistant}${line}`);
          } else {
            this.println('');
          }
        }
      } else if (part.type === 'code') {
        this.print(this.formatCodeBlock(part.code, part.lang));
      }
    }
  }

  async streamResponse(stream, onCodeBlock) {
    const decoder = new TextDecoder();
    let buffer = '';
    let inCodeBlock = false;
    let currentLang = '';
    let currentCode = '';
    let codeStartIndex = 0;
    
    this.isStreaming = true;
    let frame = 0;
    const spinnerInterval = setInterval(() => {
      process.stdout.write(`\r  ${C.cyan}◆${C.reset} ${C.cyan}Streaming${C.reset} ${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}    `);
      frame++;
    }, 150);

    try {
      let fullText = '';
      
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        fullText += text;
        
        buffer += text;
        
        while (buffer.includes('\n')) {
          const newlineIndex = buffer.indexOf('\n');
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          
          if (line.trim()) {
            this.clearLine();
            this.println(`${s.assistant}${line}`);
          }
        }
      }
      
      if (buffer.trim()) {
        this.println(`${s.assistant}${buffer}`);
        fullText += buffer;
      }
      
      clearInterval(spinnerInterval);
      this.clearLine();
      this.println(`  ${C.green}✓ Received${C.reset}\n`);
      this.isStreaming = false;
      
      return fullText;
    } catch (error) {
      clearInterval(spinnerInterval);
      this.clearLine();
      this.isStreaming = false;
      throw error;
    }
  }

  async callAPI(userMessage) {
    const API_KEY = process.env.MINIMAX_API_KEY;
    const BASE_URL = process.env.MAXIM_BASE_URL || 'https://api.minimax.io/anthropic/v1';

    const systemMessage = { role: 'system', content: this.systemPrompt() };
    
    const allMessages = [systemMessage, ...this.messages];
    
    if (userMessage) {
      allMessages.push({ role: 'user', content: userMessage });
    }
    
    return this.makeAPIRequest(allMessages);
  }
  
  async callAPIWithHistory() {
    const API_KEY = process.env.MINIMAX_API_KEY;
    const BASE_URL = process.env.MAXIM_BASE_URL || 'https://api.minimax.io/anthropic/v1';
    
    const systemMessage = { role: 'system', content: this.systemPrompt() };
    
    // Build messages from history - convert content blocks to text
    const historyMessages = this.messages.map(msg => {
      if (typeof msg.content === 'string') {
        return msg;
      }
      // If content is an array of blocks, extract text
      if (Array.isArray(msg.content)) {
        const text = msg.content.map(block => {
          if (block.type === 'text') return block.text;
          if (block.type === 'thinking') return '[Thinking: ' + (block.thinking || '').slice(0, 100) + '...]';
          return '';
        }).join('\n');
        return { role: msg.role, content: text };
      }
      return msg;
    });
    
    const allMessages = [systemMessage, ...historyMessages];
    
    return this.makeAPIRequest(allMessages);
  }
  
  async makeAPIRequest(messages) {
    const API_KEY = process.env.MINIMAX_API_KEY;
    const BASE_URL = process.env.MAXIM_BASE_URL || 'https://api.minimax.io/anthropic/v1';

    const tools = [
      {
        name: 'read',
        description: 'Read file contents',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file to read' }
          },
          required: ['file_path']
        }
      },
      {
        name: 'write',
        description: 'Write content to a file, creating or overwriting',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file to write' },
            content: { type: 'string', description: 'Content to write' }
          },
          required: ['file_path', 'content']
        }
      },
      {
        name: 'edit',
        description: 'Edit a file by replacing old_string or modifying specific lines',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file to edit' },
            old_string: { type: 'string', description: 'String to replace' },
            new_string: { type: 'string', description: 'Replacement string' },
            start_line: { type: 'integer', description: 'Start line for replacement' },
            end_line: { type: 'integer', description: 'End line for replacement' },
            replace_all: { type: 'boolean', description: 'Replace all occurrences' }
          },
          required: ['file_path', 'new_string']
        }
      },
      {
        name: 'bash',
        description: 'Execute a bash command',
        input_schema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
            timeout: { type: 'integer', description: 'Timeout in seconds', default: 30 }
          },
          required: ['command']
        }
      }
    ];

    const response = await fetch(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 8192,
        messages: messages,
        tools,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status}`);
    }

    return await response.json();
  }

  async handleMessage(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed === 'exit' || trimmed === 'quit') {
      this.println(`\n  ${C.green}Goodbye!${C.reset}\n`);
      process.exit(0);
    }
    
    if (trimmed === 'help' || trimmed === '?') {
      this.println(`
  ${C.bold}Commands:${C.reset}
    ${C.green}help, ?${C.reset}      Show this help
    ${C.green}mode${C.reset}         Toggle build/plan mode
    ${C.green}clear${C.reset}       Clear chat history
    ${C.green}new${C.reset}         New session
    ${C.green}tree${C.reset}       Show file tree
    ${C.green}diff <file>${C.reset}   Show diff for file
    ${C.green}history${C.reset}      Show scrollback history
    ${C.green}tokens${C.reset}       Show token count

  ${C.bold}Tips:${C.reset}
    ${C.dim}• Use ${C.reset}${C.green}[c]${C.reset}${C.dim} after code blocks to copy${C.reset}
    ${C.dim}• Diffs show green (+) and red (-) lines${C.reset}
    ${C.dim}• Responses stream in real-time${C.reset}
    ${C.dim}• Maxi can execute tools (read, write, edit, bash)${C.reset}
`);
      return;
    }
    
    if (trimmed === 'mode') {
      this.mode = this.mode === 'build' ? 'plan' : 'build';
      this.println(`  ${C.green}Mode: ${this.mode.toUpperCase()}${C.reset}`);
      this.updateStatusBar();
      return;
    }
    
    if (trimmed === 'clear' || trimmed === 'cls') {
      this.messages = [];
      this.scrollback = [];
      console.clear();
      this.showHeader();
      return;
    }
    
    if (trimmed === 'new') {
      this.messages = [];
      this.scrollback = [];
      this.fileTracker.clear();
      this.println(`  ${C.green}✓ New session started${C.reset}\n`);
      return;
    }
    
    if (trimmed === 'tree') {
      this.println('');
      this.showTree();
      this.println('');
      return;
    }
    
    if (trimmed === 'history') {
      if (this.scrollback.length === 0) {
        this.println(`  ${C.dim}No history yet${C.reset}\n`);
      } else {
        this.println(`\n  ${C.bold}Scrollback History:${C.reset}\n`);
        for (const entry of this.scrollback.slice(-20)) {
          const role = entry.role === 'user' ? `${C.green}You${C.reset}` : `${C.magenta}Maxi${C.reset}`;
          this.println(`  ${C.dim}[${role}]${C.reset} ${entry.preview.slice(0, 60)}${entry.preview.length > 60 ? '...' : ''}`);
        }
        this.println('');
      }
      return;
    }
    
    if (trimmed === 'tokens') {
      this.println(`  ${C.cyan}Tokens:${C.reset} ${this.tokenCount}\n`);
      return;
    }
    
    if (trimmed.startsWith('diff ')) {
      const file = trimmed.slice(5).trim();
      try {
        const content = readFileSync(file, 'utf-8');
        this.println(`  ${C.yellow}File: ${file}${C.reset}`);
        this.println(`  ${C.dim}${'─'.repeat(60)}${C.reset}\n`);
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          this.println(`  ${C.white}${String(i + 1).padStart(4)} ${C.dim}│${C.reset} ${line}`);
        });
        this.println('');
      } catch (e) {
        this.println(`  ${C.red}Cannot read file: ${file}${C.reset}\n`);
      }
      return;
    }

    this.messages.push({ role: 'user', content: trimmed });
    this.scrollback.push({ role: 'user', preview: trimmed });

    try {
      const result = await this.thinkingAnimation(this.callAPI(trimmed));
      
      await this.processResponse(result);
      this.updateStatusBar();
    } catch (error) {
      this.println(`\n  ${C.red}✗ ${error.message}${C.reset}\n`);
    }
  }

  async processResponse(result, toolResults = []) {
    const toolUses = result.content?.filter(c => c.type === 'tool_use') || [];
    const rawText = result.content?.find(c => c.type === 'text')?.text || '';
    const thinking = result.content?.find(c => c.type === 'thinking');
    
    if (thinking?.thinking) {
      this.println(`  ${C.cyan}💭 Thinking...${C.reset}`);
      this.println(`  ${C.dim}${thinking.thinking.slice(0, 200)}${thinking.thinking.length > 200 ? '...' : ''}${C.reset}\n`);
    }

    if (toolUses.length > 0) {
      this.println(`\n  ${C.cyan}⚡ Executing ${toolUses.length} tool(s)${C.reset}`);
      
      const results = await this.executeTools(toolUses);
      
      // Save assistant message with tool calls
      this.messages.push({ role: 'assistant', content: result.content });
      
      // Add tool results as user messages
      for (const r of results) {
        const toolResultText = 'Tool ' + r.name + ' result: ' + JSON.stringify(r.result);
        this.messages.push({ role: 'user', content: toolResultText });
      }
      
      // Now get follow-up from API with tool results
      const followUp = await this.thinkingAnimation(
        this.callAPIWithHistory()
      );
      
      if (followUp) {
        await this.processResponse(followUp);
      }
      return;
    }

    if (rawText) {
      await this.parseAndDisplay(rawText);
      this.messages.push({ role: 'assistant', content: rawText });
      this.scrollback.push({ role: 'assistant', preview: rawText.slice(0, 60) });
    }
    
    if (result.usage) {
      this.tokenCount += result.usage.output_tokens || 0;
    }
  }

  showTree(dir = null, prefix = '', depth = 0) {
    if (depth > 3) return;
    const path = dir || this.workingDirectory;
    try {
      const items = readdirSync(path).filter(f => !f.startsWith('.') && f !== 'node_modules');
      items.forEach((item, i) => {
        const fullPath = join(path, item);
        const isLast = i === items.length - 1;
        const isDir = statSync(fullPath).isDirectory();
        const icon = isDir ? `${C.cyan}📁${C.reset}` : `${C.gray}📄${C.reset}`;
        const conn = isLast ? '└── ' : '├── ';
        this.println(`  ${prefix}${conn}${icon} ${item}`);
        if (isDir) {
          this.showTree(fullPath, prefix + (isLast ? '    ' : '│   '), depth + 1);
        }
      });
    } catch (e) {}
  }

  updateStatusBar() {
    const width = process.stdout.columns || 80;
    const modeLabel = `${C.cyan}MODE${C.reset}:${C.bold}${this.mode.toUpperCase()}${C.reset}`;
    const modelLabel = `${C.cyan}MODEL${C.reset}:${this.model}`;
    const tokenLabel = `${C.cyan}TOKENS${C.reset}:${this.tokenCount}`;
    const dirLabel = `${C.cyan}DIR${C.reset}:${C.dim}${this.workingDirectory.split('/').pop()}${C.reset}`;
    
    const info = `  ${modeLabel}   ${modelLabel}   ${tokenLabel}   ${dirLabel}`;
    const padding = Math.max(0, width - info.length - 2);
    
    this.println(`\n${C.dim}${'─'.repeat(width)}${C.reset}`);
    this.print(info);
    this.print(' '.repeat(padding));
    this.println(`${C.dim}│${C.reset}`);
  }

  showHeader() {
    console.clear();
    this.println(HEADER);
    this.println(`  ${C.dim}Version 1.0.0${C.reset}  ${C.green}Type ${C.reset}${C.green}help${C.reset}${C.green} for commands${C.reset}`);
    this.println('');
    this.updateStatusBar();
    this.println('');
  }
}

async function main() {
  const args = parseArgs({
    args: process.argv,
    options: {
      model: { type: 'string', default: 'MiniMax-M2.7' },
      dir: { type: 'string', default: process.cwd() },
    },
    allowPositionals: true,
  });

  const API_KEY = process.env.MINIMAX_API_KEY;
  if (!API_KEY) {
    console.error(`\n  ${C.red}✗ MINIMAX_API_KEY not set!${C.reset}`);
    console.error(`  ${C.dim}Run:${C.reset} ${C.green}export MINIMAX_API_KEY="your-api-key"${C.reset}\n`);
    process.exit(1);
  }

  const tui = new MaxiTUI({
    model: args.values.model,
    workingDirectory: args.values.dir,
  });

  tui.showHeader();
  
  tui.println(`  ${C.green}›${C.reset} Start chatting! Type ${C.green}help${C.reset} for commands\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => {
    tui.print(`\n  ${C.green}›${C.reset} `);
  };
  
  prompt();
  
  rl.on('line', async (input) => {
    await tui.handleMessage(input);
    prompt();
  });

  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      tui.println(`\n\n  ${C.red}Interrupted${C.reset}\n`);
      prompt();
    }
  });
}

main().catch(console.error);
