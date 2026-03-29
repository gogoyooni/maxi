#!/usr/bin/env node

import Chalk from 'chalk';
import { createInterface, clearScreenDown } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __rootdir = join(__dirname, '..', '..');

const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const spinnerFrames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const cursorFrames = ["▊","▋"];

const style = {
  prefix: { tool: `${c.cyan}⚡${c.reset}`, success: `${c.green}✓${c.reset}`, error: `${c.red}✗${c.reset}`, user: `${c.green}›${c.reset}`, assistant: `${c.magenta}‹${c.reset}`, mode: `${c.cyan}◇${c.reset}`, thinking: `${c.cyan}◆${c.reset}` },
  dim: (t) => `${c.dim}${t}${c.reset}`,
  bold: (t) => `${c.bright}${t}${c.reset}`,
  cyan: (t) => `${c.cyan}${t}${c.reset}`,
  green: (t) => `${c.green}${t}${c.reset}`,
  yellow: (t) => `${c.yellow}${t}${c.reset}`,
  red: (t) => `${c.red}${t}${c.reset}`,
  magenta: (t) => `${c.magenta}${t}${c.reset}`,
};

const ASCII_HEADER = `
${c.cyan}    ╔═══════════════════════════════════════════════════════════════╗
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
    ╚═══════════════════════════════════════════════════════════════╝${c.reset}
`;

const HELP_TEXT = `
${style.bold('Commands:')}
  ${style.green('help')}            Show this help message
  ${style.green('mode')}            Toggle build/plan mode
  ${style.green('tree')}            Show file tree
  ${style.green('cd <dir>')}        Change working directory
  ${style.green('new')}             Start new session
  ${style.green('continue')}        Continue previous session
  ${style.green('clear')}           Clear chat
  ${style.green('exit')}            Exit

${style.bold('Skills:')}
  ${style.green('/skill list')}     List all skills
  ${style.green('/skill load')}     Load a skill
  ${style.green('/skill remove')}   Remove a skill

${style.bold('MCP Servers:')}
  ${style.green('/mcp add')}        Add MCP server
  ${style.green('/mcp list')}       List MCP servers
  ${style.green('/mcp start')}      Start MCP server
  ${style.green('/mcp stop')}       Stop MCP server

${style.bold('Connect:')}
  ${style.green('/connect notion')} Connect to Notion
  ${style.green('/connect github')} Connect to GitHub

${style.bold('Keyboard Shortcuts:')}
  ${style.dim('Ctrl+C')}    Exit
  ${style.dim('Ctrl+L')}    Clear screen
  ${style.dim('Ctrl+H')}    Toggle help
  ${style.dim('Ctrl+T')}    Toggle file tree
  ${style.dim('Ctrl+M')}    Toggle mode
`;

class MaxiTUI {
  constructor(options = {}) {
    this.model = options.model || 'MiniMax-M2.7';
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.messages = [];
    this.mode = 'build';
    this.showHelp = false;
    this.showTree = false;
    this.loadedSkills = [];
    this.mcpServers = {};
    this.currentResponse = '';
    this.isStreaming = false;
  }

  get skillsDir() { return join(__rootdir, 'skills'); }
  get mcpConfigPath() { return join(process.env.HOME || process.env.USERPROFILE, '.maxi', 'mcp-config.json'); }
  get tokensDir() { return join(process.env.HOME || process.env.USERPROFILE, '.maxi', 'tokens'); }

  async loadSkills() {
    if (!existsSync(this.skillsDir)) return;
    const files = readdirSync(this.skillsDir).filter(f => f.endsWith('.md'));
    return files.map(f => f.replace('.md', ''));
  }

  async loadMCPServers() {
    if (!existsSync(this.mcpConfigPath)) return {};
    try {
      return JSON.parse(readFileSync(this.mcpConfigPath, 'utf-8')).mcpServers || {};
    } catch { return {}; }
  }

  systemPrompt() {
    let prompt = `You are maxi, an expert AI coding agent built by Taeyun. You help developers with coding tasks.`;
    if (this.mode === 'plan') {
      prompt += ' You are in PLAN mode - read-only analysis, do not modify files.';
    }
    if (this.loadedSkills.length > 0) {
      prompt += `\n\nLoaded skills: ${this.loadedSkills.join(', ')}`;
    }
    prompt += `\n\nWorking directory: ${this.workingDirectory}`;
    return prompt;
  }

  async callMinimax(messages) {
    const API_KEY = process.env.MINIMAX_API_KEY;
    const BASE_URL = 'https://api.minimax.io/anthropic/v1';

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
      throw new Error(`API Error: ${response.status}: ${error}`);
    }

    return await response.json();
  }

  async streamResponse(userMessage) {
    const messages = [
      { role: 'system', content: this.systemPrompt() },
      ...this.messages,
      { role: 'user', content: userMessage }
    ];

    let spinnerIndex = 0;
    let cursorIndex = 0;
    let loadingInterval = null;
    let cursorInterval = null;
    this.currentResponse = '';
    this.isStreaming = true;

    const clearLoading = () => {
      if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
      if (cursorInterval) { clearInterval(cursorInterval); cursorInterval = null; }
      process.stdout.write('\r' + '\x1b[K');
    };

    const showLoading = () => {
      process.stdout.write('\n');
      process.stdout.write(`\r  ${style.prefix.thinking} ${style.cyan('Thinking')} `);
      loadingInterval = setInterval(() => {
        const spinner = spinnerFrames[spinnerIndex % spinnerFrames.length];
        process.stdout.write(`\r  ${style.prefix.thinking} ${style.cyan('Thinking')} ${style.magenta(spinner)} `);
        spinnerIndex++;
      }, 80);
    };

    const startCursor = () => {
      clearLoading();
      process.stdout.write('\r  ' + style.prefix.assistant + ' ');
      cursorInterval = setInterval(() => {
        const cursor = cursorFrames[cursorIndex % cursorFrames.length];
        process.stdout.write(`\r  ${style.prefix.assistant} ${style.magenta(cursor)}`);
        process.stdout.write(' '.repeat(20));
        process.stdout.write(`\r  ${style.prefix.assistant} `);
        cursorIndex++;
      }, 150);
    };

    try {
      showLoading();
      const result = await this.callMinimax(messages);
      
      // Get response text
      const textBlock = result.content?.find(c => c.type === 'text');
      let fullResponse = textBlock?.text || '';

      // Get tool uses
      const toolUses = result.content?.filter(c => c.type === 'tool_use') || [];

      if (toolUses.length > 0) {
        clearLoading();
        for (const tool of toolUses) {
          process.stdout.write('\n\n');
          process.stdout.write(`${style.prefix.tool} ${style.yellow(tool.name)}\n`);
          
          // Execute tool
          let toolResult = { error: 'Tool execution not implemented' };
          try {
            if (tool.name === 'read') {
              const path = tool.input.filePath;
              const fullPath = isAbsolute(path) ? path : join(this.workingDirectory, path);
              toolResult = { content: readFileSync(fullPath, 'utf-8').slice(0, 2000) };
            } else if (tool.name === 'bash') {
              const { stdout, stderr, exit_code } = await this.execCommand(tool.input.command);
              toolResult = { stdout, stderr, exit_code };
            }
          } catch (e) {
            toolResult = { error: e.message };
          }

          process.stdout.write(`  ${style.dim(JSON.stringify(toolResult).slice(0, 200))}\n`);

          // Continue conversation with tool result
          messages.push({ role: 'assistant', content: `[${tool.name}]` });
          messages.push({ role: 'user', content: `Tool result: ${JSON.stringify(toolResult)}` });

          const followUp = await this.callMinimax(messages);
          const followUpText = followUp.content?.find(c => c.type === 'text')?.text || '';
          process.stdout.write(`\n  ${style.prefix.assistant}${followUpText}\n`);
          fullResponse = followUpText;
        }
      } else {
        // No tool use, just show response
        startCursor();
        clearInterval(cursorInterval);
        process.stdout.write('\r  ' + style.prefix.assistant + ' ');
        process.stdout.write(fullResponse);
      }

    } catch (error) {
      clearLoading();
      process.stdout.write(`\n${style.prefix.error} ${style.red(error.message)}\n`);
    }

    clearLoading();
    process.stdout.write('\n\n');
    this.isStreaming = false;
    return this.currentResponse;
  }

  execCommand(command) {
    return new Promise((resolve) => {
      const proc = spawn(command, [], { shell: true, cwd: this.workingDirectory });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('close', code => resolve({ stdout, stderr, exit_code: code }));
    });
  }

  showHeader() {
    console.clear();
    console.log(ASCII_HEADER);
    console.log(`  ${style.prefix.mode} ${style.cyan('Mode')}: ${style.green(this.mode.toUpperCase())}    ${style.cyan('Model')}: ${this.model}    ${style.cyan('Dir')}: ${this.workingDirectory}\n`);
  }

  async handleCommand(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Add to messages
    this.messages.push({ role: 'user', content: trimmed });

    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(`${style.prefix.success} Goodbye!`);
      process.exit(0);
    } else if (trimmed === 'help' || trimmed === '?') {
      console.log(HELP_TEXT);
    } else if (trimmed === 'mode') {
      this.mode = this.mode === 'build' ? 'plan' : 'build';
      console.log(`${style.prefix.success} Switched to ${style.green(this.mode.toUpperCase())} mode`);
    } else if (trimmed === 'clear') {
      this.messages = [];
      console.clear();
      this.showHeader();
    } else if (trimmed === 'new') {
      this.messages = [];
      this.showHeader();
      console.log(`${style.prefix.success} New session started\n`);
    } else if (trimmed.startsWith('cd ')) {
      const dir = trimmed.slice(3).trim();
      try {
        const fullPath = isAbsolute(dir) ? dir : join(this.workingDirectory, dir);
        statSync(fullPath);
        this.workingDirectory = fullPath;
        console.log(`${style.prefix.success} Changed directory to: ${fullPath}`);
      } catch {
        console.log(`${style.prefix.error} Directory not found`);
      }
    } else if (trimmed.startsWith('/skill')) {
      console.log(`${style.prefix.info} Skills: ${(await this.loadSkills()).join(', ') || 'none'}`);
    } else if (trimmed.startsWith('/mcp')) {
      const servers = await this.loadMCPServers();
      console.log(`${style.prefix.info} MCP Servers: ${Object.keys(servers).join(', ') || 'none'}`);
    } else if (trimmed.startsWith('/connect')) {
      const service = trimmed.split(' ')[1];
      console.log(`${style.prefix.info} Use /mcp add ${service} to connect`);
    } else {
      // Send to AI
      await this.streamResponse(trimmed);
      this.messages.push({ role: 'assistant', content: this.currentResponse });
    }
  }

  async start() {
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '' });
    
    this.showHeader();
    console.log(`${style.prefix.info} Type ${style.green('help')} for commands, ${style.green('exit')} to quit\n`);

    for await (const line of rl) {
      await this.handleCommand(line);
      rl.prompt = `${style.prefix.user} `;
    }
  }
}

const args = parseArgs({
  args: process.argv,
  options: {
    model: { type: 'string', default: 'MiniMax-M2.7' },
    dir: { type: 'string', default: process.cwd() },
    continue: { type: 'boolean', short: 'c', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
});

if (args.values.help) {
  console.log(`Maxi - AI Coding Agent\n\nUsage: maxi [options]\n  -m, --model <model>  Model to use\n  -d, --dir <path>     Working directory\n  -c, --continue       Continue session\n  -h, --help           Help`);
  process.exit(0);
}

const API_KEY = process.env.MINIMAX_API_KEY;
if (!API_KEY) {
  console.error('MINIMAX_API_KEY not set! Run: export MINIMAX_API_KEY="your-key"');
  process.exit(1);
}

const tui = new MaxiTUI({
  model: args.values.model,
  workingDirectory: args.values.dir,
  continueSession: args.values.continue,
});

tui.start().catch(console.error);
