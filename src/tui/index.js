#!/usr/bin/env node

import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __rootdir = join(__dirname, '..', '..');

// Colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

const s = {
  prefix: {
    user: `${C.green}›${C.reset} `,
    assistant: `${C.magenta}‹${C.reset} `,
    thinking: `${C.cyan}◆${C.reset} `,
    tool: `${C.cyan}⚡${C.reset} `,
    mode: `${C.cyan}◇${C.reset} `,
  }
};

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

// Spinner frames for thinking animation
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class MaxiTUI {
  constructor(options = {}) {
    this.model = options.model || 'MiniMax-M2.7';
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.messages = [];
    this.mode = 'build';
  }

  systemPrompt() {
    return `You are maxi, an expert AI coding agent built by Taeyun. Use tools when helpful.

Working directory: ${this.workingDirectory}`;
  }

  // Thinking animation
  async thinkingAnimation(promise) {
    let frame = 0;
    const interval = setInterval(() => {
      process.stdout.write(`\r${C.cyan}◆${C.reset} ${C.cyan('Thinking...')} ${SPINNER[frame % SPINNER.length]} `);
      frame++;
    }, 80);

    try {
      const result = await promise;
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      return result;
    } catch (error) {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      throw error;
    }
  }

  // Format code with syntax highlighting (simple)
  formatCode(text) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    return text.replace(codeBlockRegex, (match, lang, code) => {
      return `\n${C.yellow}┌─${lang || 'code'}${'─'.repeat(Math.max(0, 50 - (lang || 'code').length - 2))}┐${C.reset}\n${C.gray}${code}${C.reset}\n${C.yellow}└${'─'.repeat(52)}┘${C.reset}`;
    });
  }

  // Show diff view for code changes
  showDiff(filePath, oldContent, newContent) {
    const oldLines = (oldContent || '').split('\n');
    const newLines = (newContent || '').split('\n');
    
    console.log(`\n${C.cyan}📝 ${filePath}${C.reset}\n`);
    
    const maxLines = Math.max(oldLines.length, newLines.length);
    let hasChanges = false;

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        hasChanges = true;
        if (oldLine && !newLine) {
          console.log(`${C.red}- ${oldLine}${C.reset}`);
        } else if (!oldLine && newLine) {
          console.log(`${C.green}+ ${newLine}${C.reset}`);
        } else {
          console.log(`${C.red}- ${oldLine}${C.reset}`);
          console.log(`${C.green}+ ${newLine}${C.reset}`);
        }
      } else if (oldLine) {
        console.log(`${C.dim}  ${oldLine}${C.reset}`);
      }
    }

    if (!hasChanges) {
      console.log(`${C.green}  (no changes)${C.reset}`);
    }
  }

  // Parse response and handle code blocks
  async parseResponse(text) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', lang: match[1] || 'code', code: match[2] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts;
  }

  async callAPI(userMessage) {
    const API_KEY = process.env.MINIMAX_API_KEY;
    const BASE_URL = process.env.MAXIM_BASE_URL || 'https://api.minimax.io/anthropic/v1';

    const messages = [
      { role: 'system', content: this.systemPrompt() },
      ...this.messages,
      { role: 'user', content: userMessage }
    ];

    const response = await this.thinkingAnimation(
      fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          messages,
        }),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status}`);
    }

    return await response.json();
  }

  async handleMessage(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Commands
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(`${C.green}Goodbye!${C.reset}`);
      process.exit(0);
    }
    if (trimmed === 'help' || trimmed === '?') {
      console.log(`
${C.bold}Commands:${C.reset}
  ${C.green}help, ?${C.reset}   - Show this help
  ${C.green}mode${C.reset}      - Toggle build/plan mode
  ${C.green}clear${C.reset}     - Clear chat history
  ${C.green}new${C.reset}       - New session
  ${C.green}tree${C.reset}     - Show file tree
  ${C.green}diff <file>${C.reset} - Show diff for file

${C.bold}Examples:${C.reset}
  How do I create a React app?
  Write a Python script to sort files
`);
      return;
    }
    if (trimmed === 'mode') {
      this.mode = this.mode === 'build' ? 'plan' : 'build';
      console.log(`${C.green}Mode: ${this.mode.toUpperCase()}${C.reset}`);
      return;
    }
    if (trimmed === 'clear' || trimmed === 'cls') {
      this.messages = [];
      console.clear();
      return;
    }
    if (trimmed === 'new') {
      this.messages = [];
      console.log(`${C.green}New session started${C.reset}`);
      return;
    }
    if (trimmed === 'tree') {
      this.showTree();
      return;
    }
    if (trimmed.startsWith('diff ')) {
      const file = trimmed.slice(5).trim();
      console.log(`${C.yellow}File: ${file}${C.reset}`);
      return;
    }

    // Add to history
    this.messages.push({ role: 'user', content: trimmed });

    try {
      const result = await this.callAPI(trimmed);
      const rawText = result.content?.find(c => c.type === 'text')?.text || '';
      
      // Also check for thinking content
      const thinking = result.content?.find(c => c.type === 'thinking');
      if (thinking) {
        console.log(`${C.cyan}💭 ${thinking.thinking?.slice(0, 100)}...${C.reset}\n`);
      }

      // Format and display response
      const parts = await this.parseResponse(rawText);
      
      for (const part of parts) {
        if (part.type === 'text') {
          console.log(`${s.prefix.assistant}${part.content.split('\n').join('\n' + s.prefix.assistant)}`);
        } else if (part.type === 'code') {
          console.log(`\n${C.yellow}┌─${part.lang}${'─'.repeat(Math.max(0, 50 - part.lang.length - 2))}┐${C.reset}`);
          const codeLines = part.code.split('\n');
          codeLines.forEach((line, i) => {
            const lineNum = String(i + 1).padStart(3, ' ');
            console.log(`${C.gray}${lineNum}│${C.reset} ${line}`);
          });
          console.log(`${C.yellow}└${'─'.repeat(52)}┘${C.reset}\n`);
        }
      }
      
      console.log();
      this.messages.push({ role: 'assistant', content: rawText });
    } catch (error) {
      console.log(`\n${C.red}✗ ${error.message}${C.reset}\n`);
    }
  }

  showTree(dir = null, prefix = '', depth = 0) {
    if (depth > 3) return;
    const path = dir || this.workingDirectory;
    try {
      const items = readdirSync(path).filter(f => !f.startsWith('.'));
      items.forEach((item, i) => {
        const fullPath = join(path, item);
        const isLast = i === items.length - 1;
        const isDir = statSync(fullPath).isDirectory();
        const icon = isDir ? `${C.cyan}📁${C.reset}` : `${C.gray}📄${C.reset}`;
        const conn = isLast ? '└── ' : '├── ';
        console.log(`${prefix}${conn}${icon} ${item}`);
        if (isDir) {
          this.showTree(fullPath, prefix + (isLast ? '    ' : '│   '), depth + 1);
        }
      });
    } catch (e) {}
  }

  showHeader() {
    console.clear();
    console.log(HEADER);
    console.log(`  ${s.prefix.mode} ${C.cyan}Mode:${C.reset} ${C.green}${this.mode.toUpperCase()}${C.reset}  ${C.cyan}Model:${C.reset} ${this.model}  ${C.cyan}Dir:${C.reset} ${C.dim}${this.workingDirectory}${C.reset}\n`);
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
    console.error(`${C.red}✗ MINIMAX_API_KEY not set!${C.reset}`);
    console.error(`  Run: ${C.green}export MINIMAX_API_KEY="your-api-key"${C.reset}`);
    process.exit(1);
  }

  const tui = new MaxiTUI({
    model: args.values.model,
    workingDirectory: args.values.dir,
  });

  tui.showHeader();
  console.log(`${C.cyan}Type ${C.green}help${C.cyan} for commands, ${C.green}exit${C.cyan} to quit\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', async (input) => {
    await tui.handleMessage(input);
    process.stdout.write(`${C.green}› ${C.reset}`);
  });
}

main().catch(console.error);
