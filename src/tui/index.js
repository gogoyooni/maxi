#!/usr/bin/env node

import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __rootdir = join(__dirname, '..', '..');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';

const HEADER = `
${CYAN}╔═══════════════════════════════════════════════════════════════╗
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
╚═══════════════════════════════════════════════════════════════╝${RESET}
`;

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

  async callAPI(userMessage) {
    const API_KEY = process.env.MINIMAX_API_KEY;
    const BASE_URL = process.env.MAXIM_BASE_URL || 'https://api.minimax.io/anthropic';

    const messages = [
      { role: 'system', content: this.systemPrompt() },
      ...this.messages,
      { role: 'user', content: userMessage }
    ];

    console.log(`\n${MAGENTA}◆ Thinking...${RESET}\n`);

    const response = await fetch(`${BASE_URL}/messages`, {
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
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status}\n${error}`);
    }

    return await response.json();
  }

  async handleMessage(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Commands
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(`${GREEN}Goodbye!${RESET}`);
      process.exit(0);
    }
    if (trimmed === 'help') {
      console.log(`
${BOLD}Commands:${RESET}
  help, ?    - Show this help
  mode       - Toggle build/plan mode
  clear      - Clear chat history
  new        - New session
  exit       - Exit
  tree       - Show file tree

${BOLD}Examples:${RESET}
  ${GREEN}How do I create a React app?${RESET}
  ${GREEN}Write a Python script to sort files${RESET}
`);
      return;
    }
    if (trimmed === 'mode') {
      this.mode = this.mode === 'build' ? 'plan' : 'build';
      console.log(`${GREEN}Mode: ${this.mode.toUpperCase()}${RESET}`);
      return;
    }
    if (trimmed === 'clear') {
      this.messages = [];
      console.clear();
      return;
    }
    if (trimmed === 'new') {
      this.messages = [];
      console.log(`${GREEN}New session started${RESET}`);
      return;
    }
    if (trimmed === 'tree') {
      this.showTree();
      return;
    }

    // Add to history
    this.messages.push({ role: 'user', content: trimmed });

    try {
      const result = await this.callAPI(trimmed);
      const text = result.content?.find(c => c.type === 'text')?.text || '';
      console.log(`\n${MAGENTA}‹${RESET} ${text}\n`);
      this.messages.push({ role: 'assistant', content: text });
    } catch (error) {
      console.log(`\n${YELLOW}✗ ${error.message}${RESET}\n`);
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
        const stat = statSync(fullPath);
        const icon = stat.isDirectory() ? '📁' : '📄';
        const connector = isLast ? '└── ' : '├── ';
        console.log(`${prefix}${connector}${icon} ${item}`);
        if (stat.isDirectory()) {
          this.showTree(fullPath, prefix + (isLast ? '    ' : '│   '), depth + 1);
        }
      });
    } catch (e) {}
  }

  showHeader() {
    console.clear();
    console.log(HEADER);
    console.log(`  ${CYAN}◇ Mode:${RESET} ${GREEN}${this.mode.toUpperCase()}${RESET}  ${CYAN}Model:${RESET} ${this.model}  ${CYAN}Dir:${RESET} ${this.workingDirectory}\n`);
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
    console.error(`${YELLOW}✗ MINIMAX_API_KEY not set!${RESET}`);
    console.error('  Run: export MINIMAX_API_KEY="your-api-key"');
    process.exit(1);
  }

  const tui = new MaxiTUI({
    model: args.values.model,
    workingDirectory: args.values.dir,
  });

  tui.showHeader();
  console.log(`${CYAN}Type ${GREEN}help${CYAN} for commands, ${GREEN}exit${CYAN} to quit\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', async (input) => {
    await tui.handleMessage(input);
    process.stdout.write(`${GREEN}› ${RESET}`);
  });
}

main().catch(console.error);
