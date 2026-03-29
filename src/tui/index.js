#!/usr/bin/env node

import Chalk from 'chalk';
import { createInterface, clearScreenDown } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { parseArgs } from 'util';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { tool } from 'ai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __rootdir = join(__dirname, '..', '..');

const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  crimson: '\x1b[38m',
};

const spinnerFrames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const dotFrames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const cursorFrames = ["▊","▋"];

const style = {
  prefix: { tool: `${c.cyan}⚡${c.reset}`, info: `${c.blue}ℹ${c.reset}`, success: `${c.green}✓${c.reset}`, error: `${c.red}✗${c.reset}`, warn: `${c.yellow}⚠${c.reset}`, user: `${c.green}›${c.reset}`, assistant: `${c.magenta}‹${c.reset}`, mode: `${c.cyan}◇${c.reset}`, thinking: `${c.cyan}◆${c.reset}`, loading: `${c.magenta}◐${c.reset}` },
  dim: (t) => `${c.dim}${t}${c.reset}`,
  bold: (t) => `${c.bright}${t}${c.reset}`,
  cyan: (t) => `${c.cyan}${t}${c.reset}`,
  green: (t) => `${c.green}${t}${c.reset}`,
  yellow: (t) => `${c.yellow}${t}${c.reset}`,
  red: (t) => `${c.red}${t}${c.reset}`,
  magenta: (t) => `${c.magenta}${t}${c.reset}`,
  gray: (t) => `${c.gray}${t}${c.reset}`,
};

const ASCII_HEADER = `
${c.cyan}    ╔═══════════════════════════════════════════════════════════════╗
    ║${c.bright}  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗${c.reset}${c.cyan}                        ║
    ║${c.bright}  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝${c.reset}${c.cyan}                        ║
    ║${c.bright}  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗${c.reset}${c.cyan}                        ║
    ║${c.bright}  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║${c.reset}${c.cyan}                        ║
    ║${c.bright}  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║${c.reset}${c.cyan}                        ║
    ║${c.bright}  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝${c.reset}${c.cyan}                        ║
    ║${c.bright}           ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗${c.reset}${c.cyan}                   ║
    ║${c.bright}           ██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║${c.reset}${c.cyan}                   ║
    ║${c.bright}           ██████╔╝█████╗  ███████║██║     ███████║${c.reset}${c.cyan}                   ║
    ║${c.bright}           ██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║${c.reset}${c.cyan}                   ║
    ║${c.bright}           ██║  ██║███████╗██║  ██║╚██████╗██║  ██║${c.reset}${c.cyan}                   ║
    ║${c.bright}           ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝${c.reset}${c.cyan}                   ║
    ╚═══════════════════════════════════════════════════════════════╝
${c.gray}                        ${c.cyan}MiniMax AI Coding Agent${c.reset}
`;

const HELP_TEXT = `
${style.bold('╭──────────────────────────────────────────────────────────────────────╮')}
${style.bold('│')}                              ${style.bold('KEYBOARD SHORTCUTS')}                            ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}  ${style.cyan('Ctrl+C')}        Exit maxi                              ${style.bold('│')}
${style.bold('│')}  ${style.cyan('Ctrl+L')}        Clear screen                           ${style.bold('│')}
${style.bold('│')}  ${style.cyan('Ctrl+H')}        Toggle this help                       ${style.bold('│')}
${style.bold('│')}  ${style.cyan('Ctrl+T')}        Toggle file tree                       ${style.bold('│')}
${style.bold('│')}  ${style.cyan('Ctrl+G')}        Go to directory                        ${style.bold('│')}
${style.bold('│')}  ${style.cyan('Ctrl+N')}        New session                            ${style.bold('│')}
${style.bold('│')}  ${style.cyan('Ctrl+R')}        Reload session                         ${style.bold('│')}
${style.bold('│')}  ${style.cyan('Ctrl+M')}        Toggle mode (build/plan)               ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}                              ${style.bold('COMMANDS')}                                       ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}  ${style.cyan('help')}          Show this help                          ${style.bold('│')}
${style.bold('│')}  ${style.cyan('mode')}          Toggle between build/plan mode          ${style.bold('│')}
${style.bold('│')}  ${style.cyan('tree')}          Show/hide file tree                     ${style.bold('│')}
${style.bold('│')}  ${style.cyan('cd <dir>')}      Change working directory                ${style.bold('│')}
${style.bold('│')}  ${style.cyan('new')}           Start new session                       ${style.bold('│')}
${style.bold('│')}  ${style.cyan('continue')}     Continue previous session               ${style.bold('│')}
${style.bold('│')}  ${style.cyan('clear')}        Clear chat history                      ${style.bold('│')}
${style.bold('│')}  ${style.cyan('exit')}          Exit maxi                               ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}                              ${style.bold('SKILL COMMANDS')}                                  ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}  ${style.cyan('/skill list')}      List all skills                     ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/skill install')}   Install a skill                    ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/skill remove')}    Remove a skill                     ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/skill search')}    Search ClawHub                      ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/skill load')}      Load a skill                        ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/skill unload')}    Unload a skill                      ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/load <name>')}     Quick load a skill                  ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/unload <name>')}   Quick unload a skill                ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}                              ${style.bold('MCP COMMANDS')}                                       ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}  ${style.cyan('/mcp add')}          Add an MCP server                   ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/mcp remove')}       Remove an MCP server                ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/mcp list')}         List MCP servers                    ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/mcp start')}        Start an MCP server                 ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/mcp stop')}         Stop an MCP server                  ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}                              ${style.bold('CONNECT COMMANDS')}                                  ${style.bold('│')}
${style.bold('├──────────────────────────────────────────────────────────────────────┤')}
${style.bold('│')}  ${style.cyan('/connect notion')}   Connect to Notion via OAuth          ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/connect github')}   Connect to GitHub                    ${style.bold('│')}
${style.bold('│')}  ${style.cyan('/connect slack')}   Connect to Slack                     ${style.bold('│')}
${style.bold('╰──────────────────────────────────────────────────────────────────────╯')}
`;

class McpManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.servers = new Map();
    this.processes = new Map();
    this.tools = new Map();
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  init() {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.configPath)) {
      writeFileSync(this.configPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf-8');
    }
    this.loadConfig();
  }

  loadConfig() {
    try {
      const config = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      for (const [name, serverConfig] of Object.entries(config.mcpServers || {})) {
        this.servers.set(name, serverConfig);
      }
    } catch {
      this.servers.clear();
    }
  }

  saveConfig() {
    const config = { mcpServers: Object.fromEntries(this.servers) };
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  add(name, command, args = []) {
    this.servers.set(name, { command, args });
    this.saveConfig();
    return true;
  }

  remove(name) {
    if (this.processes.has(name)) {
      this.stop(name);
    }
    const deleted = this.servers.delete(name);
    if (deleted) this.saveConfig();
    return deleted;
  }

  list() {
    return Array.from(this.servers.entries()).map(([name, config]) => ({
      name,
      command: config.command,
      args: config.args,
      running: this.processes.has(name),
    }));
  }

  async start(name) {
    if (this.processes.has(name)) {
      return { success: true, error: 'Already running' };
    }

    const config = this.servers.get(name);
    if (!config) {
      return { success: false, error: 'Server not found' };
    }

    return new Promise((resolve) => {
      const proc = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.configPath ? dirname(this.configPath) : process.cwd(),
      });

      let buffer = '';

      proc.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            this.handleMessage(line, name);
          }
        }
      });

      proc.stderr.on('data', (data) => {
        process.stderr.write(style.dim(`[MCP ${name}] ${data.toString()}`));
      });

      proc.on('error', (e) => {
        this.log('error', `MCP server ${name} error: ${e.message}`, 'red');
        this.processes.delete(name);
      });

      proc.on('close', () => {
        this.log('warn', `MCP server ${name} stopped`, 'yellow');
        this.processes.delete(name);
        this.tools.delete(name);
      });

      this.processes.set(name, proc);
      this.sendInitialize(name);
      this.log('success', `MCP server ${name} started`, 'green');
      resolve({ success: true });
    });
  }

  sendInitialize(name) {
    const initialize = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'maxi', version: '1.0.0' },
      },
    };
    this.send(name, initialize);

    setTimeout(() => {
      const toolsList = {
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'tools/list',
        params: {},
      };
      this.send(name, toolsList);
    }, 500);
  }

  nextId() {
    return ++this.requestId;
  }

  send(name, message) {
    const proc = this.processes.get(name);
    if (proc && proc.stdin) {
      proc.stdin.write(JSON.stringify(message) + '\n');
    }
  }

  handleMessage(line, serverName) {
    try {
      const msg = JSON.parse(line);
      if (msg.result?.tools) {
        this.tools.set(serverName, msg.result.tools);
        this.log('info', `MCP server ${serverName} provides ${msg.result.tools.length} tools`, 'cyan');
      }
    } catch {}
  }

  async stop(name) {
    const proc = this.processes.get(name);
    if (proc) {
      proc.kill();
      this.processes.delete(name);
      this.tools.delete(name);
      return { success: true };
    }
    return { success: false, error: 'Not running' };
  }

  stopAll() {
    for (const [name] of this.processes) {
      this.stop(name);
    }
  }

  getTools() {
    const allTools = {};
    for (const [serverName, tools] of this.tools) {
      for (const t of tools) {
        allTools[`mcp_${serverName}_${t.name}`] = {
          server: serverName,
          tool: t,
        };
      }
    }
    return allTools;
  }

  async executeTool(serverName, toolName, args) {
    const proc = this.processes.get(serverName);
    if (!proc) {
      return { success: false, error: 'Server not running' };
    }

    return new Promise((resolve) => {
      const id = this.nextId();
      this.pendingRequests.set(id, resolve);

      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      };

      let buffer = '';
      const onData = (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const msg = JSON.parse(line);
              if (msg.id === id) {
                proc.stdout.removeListener('data', onData);
                this.pendingRequests.delete(id);
                resolve({ success: true, result: msg.result });
              }
            } catch {}
          }
        }
      };

      proc.stdout.on('data', onData);
      this.send(serverName, request);

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          proc.stdout.removeListener('data', onData);
          this.pendingRequests.delete(id);
          resolve({ success: false, error: 'Timeout' });
        }
      }, 30000);
    });
  }

  log(sym, msg, color = 'blue') {
    const colorCode = { green: c.green, red: c.red, yellow: c.yellow, blue: c.blue, cyan: c.cyan, magenta: c.magenta, gray: c.gray }[color] || c.blue;
    console.log(`${colorCode}${sym}${c.reset} ${msg}`);
  }

  getStatus() {
    const running = Array.from(this.processes.keys());
    if (running.length === 0) return style.dim('No MCP servers');
    return style.green('MCP:') + ' ' + running.map(n => style.cyan(n)).join(', ');
  }
}

class SkillsManager {
  constructor(skillsDir) {
    this.skillsDir = skillsDir;
    this.builtinSkillsDir = join(__rootdir, 'skills');
  }

  init() {
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  listInstalled() {
    try {
      const files = readdirSync(this.skillsDir).filter(f => f.endsWith('.md'));
      return files.map(f => {
        const content = readFileSync(join(this.skillsDir, f), 'utf-8');
        const name = f.replace('.md', '');
        const descMatch = content.match(/^---\nname: (\w+)\ndescription: (.+)\n---/);
        const description = descMatch ? descMatch[2] : 'No description';
        return { name, description, file: f };
      });
    } catch {
      return [];
    }
  }

  listBuiltin() {
    try {
      if (!existsSync(this.builtinSkillsDir)) return [];
      const files = readdirSync(this.builtinSkillsDir).filter(f => f.endsWith('.md'));
      return files.map(f => {
        const content = readFileSync(join(this.builtinSkillsDir, f), 'utf-8');
        const name = f.replace('.md', '');
        const descMatch = content.match(/^---\nname: (\w+)\ndescription: (.+)\n---/);
        const description = descMatch ? descMatch[2] : 'No description';
        return { name, description, file: f, builtin: true };
      });
    } catch {
      return [];
    }
  }

  getSkill(name) {
    const userPath = join(this.skillsDir, `${name}.md`);
    const builtinPath = join(this.builtinSkillsDir, `${name}.md`);
    
    if (existsSync(userPath)) {
      return readFileSync(userPath, 'utf-8');
    }
    if (existsSync(builtinPath)) {
      return readFileSync(builtinPath, 'utf-8');
    }
    return null;
  }

  install(name, content) {
    const destPath = join(this.skillsDir, `${name}.md`);
    writeFileSync(destPath, content, 'utf-8');
    return destPath;
  }

  remove(name) {
    const path = join(this.skillsDir, `${name}.md`);
    if (existsSync(path)) {
      unlinkSync(path);
      return true;
    }
    return false;
  }

  exists(name) {
    return existsSync(join(this.skillsDir, `${name}.md`)) || existsSync(join(this.builtinSkillsDir, `${name}.md`));
  }

  parseSkillContent(content) {
    const lines = content.split('\n');
    let inFrontmatter = false;
    let description = '';
    let instructions = [];

    for (const line of lines) {
      if (line.trim() === '---') {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter && line.startsWith('description:')) {
        description = line.replace('description:', '').trim();
      } else if (!inFrontmatter) {
        instructions.push(line);
      }
    }

    return { description, instructions: instructions.join('\n').trim() };
  }
}

class FileTree {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.maxDepth = 3;
    this.hidden = ['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv', '.cache', '.pnpm-store'];
  }

  shouldExclude(name) {
    return this.hidden.includes(name);
  }

  getTree(dir, depth = 0, prefix = '') {
    if (depth >= this.maxDepth) return [];
    
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }

    const dirs = [];
    const files = [];

    for (const entry of entries) {
      if (this.shouldExclude(entry)) continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) dirs.push(entry);
        else files.push(entry);
      } catch {}
    }

    dirs.sort();
    files.sort();

    const result = [];
    const allItems = [...dirs.map(d => ({ name: d, isDir: true })), ...files.map(f => ({ name: f, isDir: false }))];

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const isLast = i === allItems.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const newPrefix = prefix + (isLast ? '    ' : '│   ');

      result.push({
        name: item.name,
        isDir: item.isDir,
        depth,
        path: join(dir, item.name),
        connector: prefix + connector,
      });

      if (item.isDir) {
        result.push(...this.getTree(join(dir, item.name), depth + 1, newPrefix));
      }
    }

    return result;
  }

  render(targetDir = null) {
    const dir = targetDir || this.rootDir;
    const lines = [];
    const tree = this.getTree(dir);
    
    const relPath = targetDir ? targetDir.replace(this.rootDir, '.') : '.';
    lines.push(`\n ${style.bold('📁')} ${style.cyan(relPath)}/\n`);

    for (const item of tree.slice(0, 50)) {
      const indent = ' '.repeat(item.depth * 2);
      const icon = item.isDir ? style.cyan('📂') : '  ';
      const name = item.isDir ? style.bold(item.name) : item.name;
      const ext = item.name.includes('.') ? item.name.split('.').pop() : '';
      const extColor = { js: style.yellow, ts: style.blue, jsx: style.yellow, tsx: style.blue, py: style.green, md: style.gray, json: style.gray, css: style.magenta, html: style.red, sh: style.green }[ext] || ((s) => s);
      lines.push(`  ${indent}${icon} ${name}`);
    }

    if (tree.length > 50) {
      lines.push(`  ${style.dim(`... and ${tree.length - 50} more items`)}`);
    }

    return lines.join('\n');
  }
}

class SessionManager {
  constructor(sessionDir) {
    this.sessionDir = sessionDir;
    this.currentSession = null;
    this.history = [];
  }

  init() {
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
    this.loadHistory();
  }

  getSessionFile(sessionId) {
    return join(this.sessionDir, `session_${sessionId}.json`);
  }

  loadHistory() {
    try {
      const files = readdirSync(this.sessionDir).filter(f => f.startsWith('session_') && f.endsWith('.json'));
      this.history = files.map(f => {
        const data = JSON.parse(readFileSync(join(this.sessionDir, f), 'utf-8'));
        return { id: data.id, created: data.created, messageCount: data.messages?.length || 0, preview: data.messages?.[1]?.content?.slice(0, 50) || '' };
      }).sort((a, b) => b.created - a.created);
    } catch {
      this.history = [];
    }
  }

  createSession() {
    const id = Date.now().toString(36);
    const session = { id, created: Date.now(), messages: [], workingDirectory: process.cwd(), mode: 'build' };
    this.currentSession = session;
    this.saveSession(session);
    return session;
  }

  saveSession(session) {
    writeFileSync(this.getSessionFile(session.id), JSON.stringify(session, null, 2));
  }

  loadSession(sessionId) {
    const session = JSON.parse(readFileSync(this.getSessionFile(sessionId), 'utf-8'));
    this.currentSession = session;
    return session;
  }

  updateSession(updates) {
    if (this.currentSession) {
      Object.assign(this.currentSession, updates);
      this.saveSession(this.currentSession);
    }
  }
}

class MaximTUI {
  constructor(options = {}) {
    this.model = options.model || 'MiniMax-M2.7';
    this.workingDirectory = options.dir || process.cwd();
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.baseURL = options.baseURL || process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/anthropic/v1';
    this.sessionDir = join(this.workingDirectory, '.maxi', 'sessions');
    this.skillsDir = join(this.workingDirectory, '.maxi', 'skills');
    this.mcpConfigPath = join(process.env.HOME || '', '.maxi', 'mcp-config.json');
    this.mode = 'build';
    this.showTree = false;
    this.showHelp = false;
    this.activeSkills = [];
    this.sessions = new SessionManager(join(this.workingDirectory, '.maxi'));
    this.skills = new SkillsManager(this.skillsDir);
    this.mcp = new McpManager(this.mcpConfigPath);
    this.rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    this.lineBuffer = '';
    this.cursorPos = 0;
    this.pendingApproval = null;
    this.isStreaming = false;
    this.currentResponse = '';
  }

  log(sym, msg, color = 'blue') {
    const colorCode = { green: c.green, red: c.red, yellow: c.yellow, blue: c.blue, cyan: c.cyan, magenta: c.magenta, gray: c.gray }[color] || c.blue;
    console.log(`${colorCode}${sym}${c.reset} ${msg}`);
  }

  print(str) {
    process.stdout.write(str);
  }

  println(str = '') {
    console.log(str);
  }

  async prompt(query) {
    return new Promise((resolve) => this.rl.question(query, resolve));
  }

  async clearScreen() {
    process.stdout.write('\x1b[2J\x1b[H');
    this.printHeader();
  }

  printHeader() {
    this.println(ASCII_HEADER);
    this.println(`  ${style.dim('─'.repeat(73))}`);
    const leftInfo = `${style.prefix.mode} ${style.bold('Mode:')} ${this.mode === 'build' ? style.green('BUILD') : style.yellow('PLAN')}    ${style.prefix.info} ${style.bold('Dir:')} ${style.cyan(this.workingDirectory)}`;
    const rightInfo = `${style.bold('Model:')} ${style.cyan(this.model)}`;
    const padding = ' '.repeat(Math.max(1, 73 - leftInfo.length - rightInfo.length));
    this.println(`  ${leftInfo}${padding}${rightInfo}`);
    const mcpStatus = `  ${this.mcp.getStatus()}`;
    this.println(mcpStatus);
    this.println(`  ${style.dim('─'.repeat(73))}`);
    
    if (this.showTree) {
      const tree = new FileTree(this.workingDirectory);
      this.println(tree.render());
    }
    
    if (this.showHelp) {
      this.println(HELP_TEXT);
    }
    
    this.println();
  }

  get provider() {
    return createOpenAICompatible({ baseURL: this.baseURL, apiKey: this.apiKey });
  }

  get tools() {
    const wd = this.workingDirectory;
    return {
      read: tool({
        description: 'Read file contents',
        parameters: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] },
        execute: async ({ filePath }) => {
          const { readFileSync } = await import('fs');
          const { join, isAbsolute } = await import('path');
          const fullPath = isAbsolute(filePath) ? filePath : join(wd, filePath);
          try {
            const content = readFileSync(fullPath, 'utf-8');
            return { success: true, content: content.slice(0, 5000), truncated: content.length > 5000 };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
      }),
      write: tool({
        description: 'Write content to a file',
        parameters: { type: 'object', properties: { filePath: { type: 'string' }, content: { type: 'string' } }, required: ['filePath', 'content'] },
        execute: async ({ filePath, content }) => {
          const { writeFileSync, mkdirSync } = await import('fs');
          const { join, dirname, isAbsolute } = await import('path');
          const fullPath = isAbsolute(filePath) ? filePath : join(wd, filePath);
          try {
            mkdirSync(dirname(fullPath), { recursive: true });
            writeFileSync(fullPath, content, 'utf-8');
            return { success: true, path: fullPath };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
      }),
      edit: tool({
        description: 'Edit a specific part of a file',
        parameters: { type: 'object', properties: { filePath: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['filePath', 'oldString', 'newString'] },
        execute: async ({ filePath, oldString, newString }) => {
          const { readFileSync, writeFileSync } = await import('fs');
          const { join, isAbsolute } = await import('path');
          const fullPath = isAbsolute(filePath) ? filePath : join(wd, filePath);
          try {
            const content = readFileSync(fullPath, 'utf-8');
            if (!content.includes(oldString)) return { success: false, error: 'Text not found in file' };
            writeFileSync(fullPath, content.replace(oldString, newString), 'utf-8');
            return { success: true };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
      }),
      glob: tool({
        description: 'Find files matching a glob pattern',
        parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
        execute: async ({ pattern }) => {
          const { glob } = await import('glob');
          const { join, isAbsolute } = await import('path');
          const fullPattern = isAbsolute(pattern) ? pattern : join(wd, '**', pattern);
          try {
            const files = await glob(fullPattern, { absolute: false, ignore: ['**/node_modules/**', '**/.git/**'] });
            return { success: true, files: files.slice(0, 50) };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
      }),
      grep: tool({
        description: 'Search for text in files',
        parameters: { type: 'object', properties: { pattern: { type: 'string' }, include: { type: 'string' } }, required: ['pattern'] },
        execute: async ({ pattern, include }) => {
          const { readdirSync, statSync, readFileSync } = await import('fs');
          const { join, isAbsolute } = await import('path');
          const results = [];
          const searchDir = wd;
          const re = new RegExp(pattern);
          const walk = (dir) => {
            try {
              readdirSync(dir).forEach(f => {
                if (f.startsWith('.')) return;
                const fp = join(dir, f);
                try {
                  const stat = statSync(fp);
                  if (stat.isDirectory() && !['node_modules', '.git'].includes(f)) walk(fp);
                  else if (stat.isFile() && (!include || f.includes(include))) {
                    const content = readFileSync(fp, 'utf-8');
                    const lines = content.split('\n');
                    lines.forEach((l, i) => { if (re.test(l)) results.push(`${join(dir, f)}:${i + 1}: ${l.slice(0, 100)}`); });
                  }
                } catch {}
              });
            } catch {}
          };
          walk(searchDir);
          return { success: true, matches: results.slice(0, 50), count: results.length };
        },
      }),
      bash: tool({
        description: 'Execute a bash command',
        parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
        execute: async ({ command }) => {
          if (this.mode === 'plan') {
            this.pendingApproval = { type: 'bash', command };
            return { success: false, error: 'PLAN_MODE: Approval required', needsApproval: true, command };
          }
          return new Promise((resolve) => {
            const proc = spawn(command, [], { shell: true, cwd: wd });
            let out = '', err = '';
            proc.stdout.on('data', d => out += d);
            proc.stderr.on('data', d => err += d);
            proc.on('close', code => resolve({ success: code === 0, stdout: out.slice(0, 10000), stderr: err.slice(0, 2000), exitCode: code }));
          });
        },
      }),
      ...this.getMcpTools(),
    };
  }

  getMcpTools() {
    const mcpTools = this.mcp.getTools();
    const result = {};
    for (const [toolId, { server, tool: mcpTool }] of Object.entries(mcpTools)) {
      result[toolId] = tool({
        description: mcpTool.description || `MCP ${server} tool: ${mcpTool.name}`,
        parameters: mcpTool.inputSchema || { type: 'object', properties: {}, required: [] },
        execute: async (args) => {
          const res = await this.mcp.executeTool(server, mcpTool.name, args);
          if (res.success) {
            return res.result;
          }
          return { error: res.error };
        },
      });
    }
    return result;
  }

  systemPrompt() {
    let prompt = `You are maxi, an expert AI coding agent built by Taeyun. You help developers with coding tasks.

You have access to powerful tools: read, write, edit, glob, grep, bash`;

    const mcpToolNames = Object.keys(this.mcp.getTools());
    if (mcpToolNames.length > 0) {
      prompt += `\n\nMCP tools available: ${mcpToolNames.join(', ')}`;
    }

    prompt += `\n\nWorking directory: ${this.workingDirectory}
Mode: ${this.mode === 'build' ? 'BUILD mode (full access)' : 'PLAN mode (read-only, needs approval for commands)'}`;

    if (this.activeSkills.length > 0) {
      prompt += `\n\nActive Skills:`;
      for (const skillName of this.activeSkills) {
        const skillContent = this.skills.getSkill(skillName);
        if (skillContent) {
          const parsed = this.skills.parseSkillContent(skillContent);
          prompt += `\n\n## ${skillName}: ${parsed.description}\n${parsed.instructions}`;
        }
      }
    }

    prompt += `\n\nBe concise, focused, and helpful. Show your work through file operations.`;
    return prompt;
  }

  async streamResponse(messages) {
    this.isStreaming = true;
    this.currentResponse = '';
    const { streamText } = await import('ai');
    
    const result = await streamText({
      model: this.provider(this.model),
      messages,
      tools: this.tools,
      maxTokens: 8192,
    });

    let spinnerIndex = 0;
    let cursorIndex = 0;
    let thinkingShown = false;
    let loadingInterval = null;
    let cursorInterval = null;
    let responseStarted = false;
    
    const clearLoading = () => {
      if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
      }
      if (cursorInterval) {
        clearInterval(cursorInterval);
        cursorInterval = null;
      }
      process.stdout.write('\r' + '\x1b[K');
    };
    
    const showLoadingAndThinking = () => {
      process.stdout.write('\n');
      let thinkingLine = `\r  ${style.prefix.thinking} ${style.cyan('Thinking')} `;
      process.stdout.write(thinkingLine);
      thinkingShown = true;
      
      loadingInterval = setInterval(() => {
        const spinner = spinnerFrames[spinnerIndex % spinnerFrames.length];
        const dots = dotFrames[spinnerIndex % dotFrames.length];
        process.stdout.write(`\r  ${style.prefix.thinking} ${style.cyan('Thinking')} ${style.magenta(spinner)} `);
        spinnerIndex++;
      }, 80);
    };
    
    const startCursorAnimation = () => {
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
    
    showLoadingAndThinking();
    
    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        if (!responseStarted) {
          responseStarted = true;
          startCursorAnimation();
        }
        if (cursorInterval) {
          clearInterval(cursorInterval);
          cursorInterval = null;
        }
        this.print(chunk.delta);
        this.currentResponse += chunk.delta;
      } else if (chunk.type === 'tool-call') {
        if (cursorInterval) {
          clearInterval(cursorInterval);
          cursorInterval = null;
        }
        process.stdout.write('\n\n' + style.prefix.tool + ` ${style.yellow(chunk.toolName)} ${style.dim('(')}`);
        const argsStr = Object.entries(chunk.args).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 30)}`).join(', ');
        this.println(argsStr + style.dim(')'));
        
        const { join, isAbsolute } = await import('path');
        const args = chunk.args;
        const wd = this.workingDirectory;
        
        if (chunk.toolName === 'read') {
          const fullPath = isAbsolute(args.filePath) ? args.filePath : join(wd, args.filePath);
          const { readFileSync } = await import('fs');
          try {
            const content = readFileSync(fullPath, 'utf-8').slice(0, 5000);
            this.println(style.dim(`\n  [${content.slice(0, 200)}...]`));
          } catch (e) {
            this.println(style.red(`  [Error: ${e.message}]`));
          }
        } else if (chunk.toolName === 'bash') {
          this.println(style.dim(`\n  Executing: ${args.command}`));
        }
      }
    }

    clearLoading();
    this.println('\n');
    this.isStreaming = false;
    return this.currentResponse;
  }

  async handleCommand(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      this.mcp.stopAll();
      this.println(style.dim('\n👋 Goodbye! Happy coding!\n'));
      process.exit(0);
    }

    if (trimmed.toLowerCase() === 'help' || trimmed === '?') {
      this.showHelp = !this.showHelp;
      return;
    }

    if (trimmed.toLowerCase() === 'mode') {
      this.mode = this.mode === 'build' ? 'plan' : 'build';
      this.log('info', `Switched to ${style.bold(this.mode.toUpperCase())} mode`, 'cyan');
      return;
    }

    if (trimmed.toLowerCase() === 'tree') {
      this.showTree = !this.showTree;
      return;
    }

    if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'cls') {
      await this.clearScreen();
      return;
    }

    if (trimmed.startsWith('cd ')) {
      const dir = trimmed.slice(3).trim();
      const { isAbsolute, join } = await import('path');
      const newDir = isAbsolute(dir) ? dir : join(this.workingDirectory, dir);
      try {
        const { statSync } = await import('fs');
        const stat = statSync(newDir);
        if (stat.isDirectory()) {
          this.workingDirectory = newDir;
          this.sessions.updateSession({ workingDirectory: newDir });
          this.log('success', `Changed directory to ${newDir}`, 'green');
        } else {
          this.log('error', 'Not a directory', 'red');
        }
      } catch (e) {
        this.log('error', e.message, 'red');
      }
      return;
    }

    if (trimmed.toLowerCase() === 'new') {
      this.sessions.createSession();
      this.log('success', 'Started new session', 'green');
      return;
    }

    if (trimmed.toLowerCase() === 'continue') {
      if (this.sessions.history.length > 0) {
        const last = this.sessions.history[0];
        this.sessions.loadSession(last.id);
        this.log('success', `Continued session from ${new Date(last.created).toLocaleString()}`, 'green');
      } else {
        this.log('info', 'No previous sessions', 'yellow');
      }
      return;
    }

    if (trimmed.startsWith('/skill')) {
      return this.handleSkillCommand(trimmed);
    }

    if (trimmed.startsWith('/load ')) {
      const skillName = trimmed.slice(6).trim().toLowerCase();
      if (!skillName) {
        this.log('error', 'Usage: /load <skill-name>', 'red');
        return;
      }
      if (!this.skills.exists(skillName)) {
        this.log('error', `Skill '${skillName}' not found. Use /skill list to see available skills.`, 'red');
        return;
      }
      if (!this.activeSkills.includes(skillName)) {
        this.activeSkills.push(skillName);
        this.log('success', `Loaded skill: ${skillName}`, 'green');
      } else {
        this.log('info', `Skill '${skillName}' is already loaded`, 'yellow');
      }
      return;
    }

    if (trimmed.startsWith('/unload ')) {
      const skillName = trimmed.slice(8).trim().toLowerCase();
      const idx = this.activeSkills.indexOf(skillName);
      if (idx !== -1) {
        this.activeSkills.splice(idx, 1);
        this.log('success', `Unloaded skill: ${skillName}`, 'green');
      } else {
        this.log('info', `Skill '${skillName}' is not loaded`, 'yellow');
      }
      return;
    }

    if (trimmed.startsWith('/mcp')) {
      return this.handleMcpCommand(trimmed);
    }

    if (trimmed.startsWith('/connect')) {
      return this.handleConnectCommand(trimmed);
    }

    if (this.pendingApproval) {
      if (trimmed.toLowerCase() === 'y' || trimmed.toLowerCase() === 'yes') {
        const { command } = this.pendingApproval;
        this.pendingApproval = null;
        this.mode = 'build';
        const result = await this.executeBash(command);
        return result;
      } else {
        this.log('info', 'Command denied', 'yellow');
        this.pendingApproval = null;
        return;
      }
    }

    if (this.isStreaming) {
      this.log('warn', 'Already processing a request...', 'yellow');
      return;
    }

    const session = this.sessions.currentSession || this.sessions.createSession();
    const messages = session.messages.length > 0 ? session.messages : [
      { role: 'system', content: this.systemPrompt() },
    ];
    messages.push({ role: 'user', content: trimmed });

    this.println(style.dim(`\n${'─'.repeat(73)}\n`));
    this.log('user', trimmed, 'green');

    try {
      const response = await this.streamResponse(messages);
      messages.push({ role: 'assistant', content: response });
      this.sessions.updateSession({ messages });
    } catch (e) {
      this.log('error', e.message, 'red');
      if (e.message.includes('401')) {
        this.log('error', 'Invalid API key. Please check MINIMAX_API_KEY', 'red');
      }
    }
  }

  async executeBash(command) {
    return new Promise((resolve) => {
      const proc = spawn(command, [], { shell: true, cwd: this.workingDirectory });
      let out = '', err = '';
      proc.stdout.on('data', d => { this.print(d); out += d; });
      proc.stderr.on('data', d => { this.print(style.red(d.toString())); err += d; });
      proc.on('close', code => {
        this.println(style.dim(`\n[exit code: ${code}]\n`));
        resolve({ success: code === 0, stdout: out, stderr: err, exitCode: code });
      });
    });
  }

  async handleSkillCommand(input) {
    const parts = input.split(/\s+/);
    const cmd = parts[1]?.toLowerCase();

    this.skills.init();

    if (cmd === 'list' || !cmd) {
      this.println(style.bold('\n📦 Installed Skills:'));
      const installed = this.skills.listInstalled();
      if (installed.length === 0) {
        this.println('  ' + style.dim('No installed skills'));
      } else {
        for (const s of installed) {
          const loaded = this.activeSkills.includes(s.name) ? ' ' + style.green('(loaded)') : '';
          this.println(`  ${style.cyan(s.name)} - ${s.description}${loaded}`);
        }
      }

      this.println(style.bold('\n🔧 Built-in Skills:'));
      const builtin = this.skills.listBuiltin();
      if (builtin.length === 0) {
        this.println('  ' + style.dim('No built-in skills'));
      } else {
        for (const s of builtin) {
          const loaded = this.activeSkills.includes(s.name) ? ' ' + style.green('(loaded)') : '';
          this.println(`  ${style.cyan(s.name)} - ${s.description}${loaded}`);
        }
      }

      if (this.activeSkills.length > 0) {
        this.println(style.bold('\n✅ Currently Active:'));
        for (const s of this.activeSkills) {
          this.println(`  ${style.green(s)}`);
        }
      }
      this.println();
      return;
    }

    if (cmd === 'install') {
      const name = parts[2]?.toLowerCase();
      if (!name) {
        this.log('error', 'Usage: /skill install <name> <content>', 'red');
        this.log('info', 'Or: /skill install <name> (reads from clipboard)', 'yellow');
        return;
      }
      const content = parts.slice(3).join(' ');
      if (content) {
        this.skills.install(name, content);
        this.log('success', `Installed skill: ${name}`, 'green');
      } else {
        this.log('info', 'Please provide skill content', 'yellow');
      }
      return;
    }

    if (cmd === 'remove' || cmd === 'delete') {
      const name = parts[2]?.toLowerCase();
      if (!name) {
        this.log('error', 'Usage: /skill remove <name>', 'red');
        return;
      }
      if (this.skills.remove(name)) {
        this.activeSkills = this.activeSkills.filter(s => s !== name);
        this.log('success', `Removed skill: ${name}`, 'green');
      } else {
        this.log('error', `Skill '${name}' not found in installed skills`, 'red');
      }
      return;
    }

    if (cmd === 'search') {
      this.log('info', 'Searching ClawHub for skills...', 'cyan');
      this.log('info', 'ClawHub search coming soon!', 'yellow');
      this.println('  ' + style.dim('Use /skill list to see available skills'));
      this.println('  ' + style.dim('Or install from URL: /skill install <name> <content>'));
      return;
    }

    if (cmd === 'load') {
      const name = parts[2]?.toLowerCase();
      if (!name) {
        this.log('error', 'Usage: /skill load <name>', 'red');
        return;
      }
      if (!this.skills.exists(name)) {
        this.log('error', `Skill '${name}' not found`, 'red');
        return;
      }
      if (!this.activeSkills.includes(name)) {
        this.activeSkills.push(name);
        this.log('success', `Loaded skill: ${name}`, 'green');
      } else {
        this.log('info', `Skill '${name}' is already loaded`, 'yellow');
      }
      return;
    }

    if (cmd === 'unload') {
      const name = parts[2]?.toLowerCase();
      if (!name) {
        this.log('error', 'Usage: /skill unload <name>', 'red');
        return;
      }
      const idx = this.activeSkills.indexOf(name);
      if (idx !== -1) {
        this.activeSkills.splice(idx, 1);
        this.log('success', `Unloaded skill: ${name}`, 'green');
      } else {
        this.log('info', `Skill '${name}' is not loaded`, 'yellow');
      }
      return;
    }

    this.log('error', `Unknown skill command: ${cmd}`, 'red');
    this.println(style.dim('\nUsage:'));
    this.println('  /skill list              - List all skills');
    this.println('  /skill install <name>     - Install a skill');
    this.println('  /skill remove <name>     - Remove a skill');
    this.println('  /skill search            - Search ClawHub');
    this.println('  /skill load <name>       - Load a skill');
    this.println('  /skill unload <name>     - Unload a skill');
    this.println('  /load <name>             - Quick load a skill');
    this.println('  /unload <name>           - Quick unload a skill');
  }

  async handleMcpCommand(input) {
    const parts = input.split(/\s+/);
    const cmd = parts[1]?.toLowerCase();

    this.mcp.init();

    if (cmd === 'add') {
      const name = parts[2];
      const command = parts[3];
      if (!name || !command) {
        this.log('error', 'Usage: /mcp add <name> <command> [args...]', 'red');
        this.println(style.dim('Example: /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path'));
        return;
      }
      const args = parts.slice(4);
      this.mcp.add(name, command, args);
      this.log('success', `Added MCP server: ${name}`, 'green');
      return;
    }

    if (cmd === 'remove' || cmd === 'delete') {
      const name = parts[2];
      if (!name) {
        this.log('error', 'Usage: /mcp remove <name>', 'red');
        return;
      }
      if (this.mcp.remove(name)) {
        this.log('success', `Removed MCP server: ${name}`, 'green');
      } else {
        this.log('error', `MCP server '${name}' not found`, 'red');
      }
      return;
    }

    if (cmd === 'list' || !cmd) {
      this.println(style.bold('\n🔌 MCP Servers:'));
      const servers = this.mcp.list();
      if (servers.length === 0) {
        this.println('  ' + style.dim('No MCP servers configured'));
      } else {
        for (const s of servers) {
          const status = s.running ? style.green('(running)') : style.dim('(stopped)');
          this.println(`  ${style.cyan(s.name)} ${status}`);
          this.println(`    ${style.dim(s.command)} ${s.args.join(' ')}`);
        }
      }
      this.println();
      return;
    }

    if (cmd === 'start') {
      const name = parts[2];
      if (!name) {
        this.log('error', 'Usage: /mcp start <name>', 'red');
        return;
      }
      const result = await this.mcp.start(name);
      if (!result.success && result.error !== 'Already running') {
        this.log('error', `Failed to start ${name}: ${result.error}`, 'red');
      }
      return;
    }

    if (cmd === 'stop') {
      const name = parts[2];
      if (!name) {
        this.log('error', 'Usage: /mcp stop <name>', 'red');
        return;
      }
      const result = await this.mcp.stop(name);
      if (result.success) {
        this.log('success', `Stopped MCP server: ${name}`, 'green');
      } else {
        this.log('error', `MCP server '${name}' not running`, 'red');
      }
      return;
    }

    if (cmd === 'status') {
      this.println(style.bold('\n🔌 MCP Status:'));
      const servers = this.mcp.list();
      const running = servers.filter(s => s.running);
      if (running.length === 0) {
        this.println('  ' + style.dim('No MCP servers running'));
      } else {
        for (const s of running) {
          const tools = this.mcp.tools.get(s.name) || [];
          this.println(`  ${style.green(s.name)} - ${tools.length} tools`);
        }
      }
      this.println();
      return;
    }

    this.log('error', `Unknown mcp command: ${cmd}`, 'red');
    this.println(style.dim('\nUsage:'));
    this.println('  /mcp add <name> <command> [args...]  - Add an MCP server');
    this.println('  /mcp remove <name>                    - Remove an MCP server');
    this.println('  /mcp list                             - List MCP servers');
    this.println('  /mcp start <name>                     - Start an MCP server');
    this.println('  /mcp stop <name>                       - Stop an MCP server');
    this.println('  /mcp status                            - Show MCP status');
    this.println(style.dim('\nPopular MCP Servers:'));
    this.println('  filesystem  - npx -y @modelcontextprotocol/server-filesystem <path>');
    this.println('  fetch       - npx -y @modelcontextprotocol/server-fetch <url>');
    this.println('  slack       - npx -y @modelcontextprotocol/server-slack');
    this.println('  github      - npx -y @modelcontextprotocol/server-github');
  }

  async handleConnectCommand(input) {
    const parts = input.split(/\s+/);
    const service = parts[2]?.toLowerCase();

    const maxiconfigDir = join(process.env.HOME || '', '.maxi');
    const tokenDir = join(maxiconfigDir, 'tokens');

    if (!existsSync(maxiconfigDir)) {
      mkdirSync(maxiconfigDir, { recursive: true });
    }
    if (!existsSync(tokenDir)) {
      mkdirSync(tokenDir, { recursive: true });
    }

    if (!service) {
      this.log('error', 'Usage: /connect <service>', 'red');
      this.println(style.dim('\nAvailable services:'));
      this.println('  /connect notion   - Connect to Notion');
      this.println('  /connect github   - Connect to GitHub');
      this.println('  /connect slack     - Connect to Slack');
      return;
    }

    if (service === 'notion') {
      await this.connectNotion(tokenDir);
    } else if (service === 'github') {
      await this.connectGithub(tokenDir);
    } else if (service === 'slack') {
      await this.connectSlack(tokenDir);
    } else {
      this.log('error', `Unknown service: ${service}`, 'red');
      this.println(style.dim('\nAvailable services: notion, github, slack'));
    }
  }

  async connectNotion(tokenDir) {
    this.println(style.bold('\n🔗 Connecting to Notion...\n'));

    const tokenPath = join(tokenDir, 'notion-token');

    if (existsSync(tokenPath)) {
      this.log('info', 'Notion token already configured', 'yellow');
      const start = await this.prompt(`${style.dim('Start Notion MCP server? (y/n)')} ${style.dim('>')}`);
      if (start.toLowerCase() === 'y') {
        this.mcp.init();
        if (!this.mcp.servers.has('notion')) {
          this.mcp.add('notion', 'npx', ['-y', '@modelcontextprotocol/server-notion']);
        }
        const result = await this.mcp.start('notion');
        if (result.success) {
          this.log('success', 'Notion MCP server started!', 'green');
        } else if (result.error !== 'Already running') {
          this.log('error', `Failed to start: ${result.error}`, 'red');
        }
      }
      return;
    }

    this.println(style.bold('Step 1: Get your Notion Integration Token\n'));
    this.println('  1. Go to ' + style.cyan('https://www.notion.so/my-integrations'));
    this.println('  2. Click "New integration"');
    this.println('  3. Name it "maxi" and select your workspace');
    this.println('  4. Copy the "Internal Integration Token" (starts with secret_)\n');

    this.println(style.bold('Step 2: Enter your token\n'));
    const token = await this.prompt(`${style.prefix.user} Paste your token here ${style.dim('>')}`);

    if (!token || !token.trim()) {
      this.log('error', 'No token provided', 'red');
      return;
    }

    const trimmedToken = token.trim();

    try {
      writeFileSync(tokenPath, trimmedToken, { mode: 0o600 });
      this.log('success', 'Token saved securely!', 'green');
    } catch (e) {
      this.log('error', `Failed to save token: ${e.message}`, 'red');
      return;
    }

    this.println(style.bold('\n✓ Token saved! Starting Notion MCP server...\n'));

    this.mcp.init();
    if (!this.mcp.servers.has('notion')) {
      this.mcp.add('notion', 'npx', ['-y', '@modelcontextprotocol/server-notion']);
    }

    const result = await this.mcp.start('notion');
    if (result.success) {
      this.log('success', 'Notion MCP server started!', 'green');
    } else if (result.error === 'Already running') {
      this.log('info', 'Notion MCP server already running', 'yellow');
    } else {
      this.log('error', `Failed to start: ${result.error}`, 'red');
    }
  }

  async connectGithub(tokenDir) {
    this.println(style.bold('\n🔗 Connecting to GitHub...\n'));

    const tokenPath = join(tokenDir, 'github-token');

    if (existsSync(tokenPath)) {
      this.log('info', 'GitHub token already configured', 'yellow');
      const start = await this.prompt(`${style.dim('Start GitHub MCP server? (y/n)')} ${style.dim('>')}`);
      if (start.toLowerCase() === 'y') {
        this.mcp.init();
        if (!this.mcp.servers.has('github')) {
          this.mcp.add('github', 'npx', ['-y', '@modelcontextprotocol/server-github']);
        }
        const result = await this.mcp.start('github');
        if (result.success) {
          this.log('success', 'GitHub MCP server started!', 'green');
        } else if (result.error !== 'Already running') {
          this.log('error', `Failed to start: ${result.error}`, 'red');
        }
      }
      return;
    }

    this.println(style.bold('Step 1: Get your GitHub Personal Access Token\n'));
    this.println('  1. Go to ' + style.cyan('https://github.com/settings/tokens'));
    this.println('  2. Click "Generate new token (classic)"');
    this.println('  3. Name it "maxi" and set these scopes:');
    this.println('     • repo (full control of repositories)');
    this.println('     • workflow (manage workflows)');
    this.println('     • read:user (read user profile data)');
    this.println('  4. Click "Generate token" and copy it\n');

    this.println(style.bold('Step 2: Enter your token\n'));
    const token = await this.prompt(`${style.prefix.user} Paste your token here ${style.dim('>')}`);

    if (!token || !token.trim()) {
      this.log('error', 'No token provided', 'red');
      return;
    }

    const trimmedToken = token.trim();

    try {
      writeFileSync(tokenPath, trimmedToken, { mode: 0o600 });
      this.log('success', 'Token saved securely!', 'green');
    } catch (e) {
      this.log('error', `Failed to save token: ${e.message}`, 'red');
      return;
    }

    this.println(style.bold('\n✓ Token saved! Starting GitHub MCP server...\n'));

    this.mcp.init();
    if (!this.mcp.servers.has('github')) {
      this.mcp.add('github', 'npx', ['-y', '@modelcontextprotocol/server-github']);
    }

    const result = await this.mcp.start('github');
    if (result.success) {
      this.log('success', 'GitHub MCP server started!', 'green');
    } else if (result.error === 'Already running') {
      this.log('info', 'GitHub MCP server already running', 'yellow');
    } else {
      this.log('error', `Failed to start: ${result.error}`, 'red');
    }
  }

  async connectSlack(tokenDir) {
    this.println(style.bold('\n🔗 Connecting to Slack...\n'));

    const tokenPath = join(tokenDir, 'slack-token');

    if (existsSync(tokenPath)) {
      this.log('info', 'Slack token already configured', 'yellow');
      const start = await this.prompt(`${style.dim('Start Slack MCP server? (y/n)')} ${style.dim('>')}`);
      if (start.toLowerCase() === 'y') {
        this.mcp.init();
        if (!this.mcp.servers.has('slack')) {
          this.mcp.add('slack', 'npx', ['-y', '@modelcontextprotocol/server-slack']);
        }
        const result = await this.mcp.start('slack');
        if (result.success) {
          this.log('success', 'Slack MCP server started!', 'green');
        } else if (result.error !== 'Already running') {
          this.log('error', `Failed to start: ${result.error}`, 'red');
        }
      }
      return;
    }

    this.println(style.bold('Step 1: Get your Slack Bot Token\n'));
    this.println('  1. Go to ' + style.cyan('https://api.slack.com/apps'));
    this.println('  2. Click "Create New App" → "From scratch"');
    this.println('  3. Name it "maxi" and pick your workspace');
    this.println('  4. Go to "OAuth & Permissions" in the sidebar');
    this.println('  5. Under "User Token Scopes", add:');
    this.println('     • chat:write');
    this.println('     • channels:history');
    this.println('     • channels:read');
    this.println('     • groups:history');
    this.println('     • im:history');
    this.println('     • mpim:history');
    this.println('  6. Click "Install to Workspace" and copy the "User OAuth Token" (xoxp-...)\n');

    this.println(style.bold('Step 2: Enter your token\n'));
    const token = await this.prompt(`${style.prefix.user} Paste your token here ${style.dim('>')}`);

    if (!token || !token.trim()) {
      this.log('error', 'No token provided', 'red');
      return;
    }

    const trimmedToken = token.trim();

    try {
      writeFileSync(tokenPath, trimmedToken, { mode: 0o600 });
      this.log('success', 'Token saved securely!', 'green');
    } catch (e) {
      this.log('error', `Failed to save token: ${e.message}`, 'red');
      return;
    }

    this.println(style.bold('\n✓ Token saved! Starting Slack MCP server...\n'));

    this.mcp.init();
    if (!this.mcp.servers.has('slack')) {
      this.mcp.add('slack', 'npx', ['-y', '@modelcontextprotocol/server-slack']);
    }

    const result = await this.mcp.start('slack');
    if (result.success) {
      this.log('success', 'Slack MCP server started!', 'green');
    } else if (result.error === 'Already running') {
      this.log('info', 'Slack MCP server already running', 'yellow');
    } else {
      this.log('error', `Failed to start: ${result.error}`, 'red');
    }
  }

  setupKeyboardHandlers() {
    let ctrlCHandler = false;
    
    process.stdin.on('keypress', (chunk, key) => {
      if (key.ctrl && key.name === 'c') {
        if (ctrlCHandler) {
          this.mcp.stopAll();
          this.println(style.dim('\n\n👋 Goodbye!\n'));
          process.exit(0);
        }
        ctrlIHandler = true;
        this.println(style.dim('\n\n(Type "exit" to quit or press Ctrl+C again)\n'));
        setTimeout(() => { ctrlIHandler = false; }, 2000);
        return;
      }
      
      if (key.ctrl && key.name === 'l') {
        this.clearScreen();
        return;
      }
      
      if (key.ctrl && key.name === 'h') {
        this.showHelp = !this.showHelp;
        return;
      }
      
      if (key.ctrl && key.name === 't') {
        this.showTree = !this.showTree;
        return;
      }
      
      if (key.ctrl && key.name === 'm') {
        this.mode = this.mode === 'build' ? 'plan' : 'build';
        this.log('info', `Switched to ${style.bold(this.mode.toUpperCase())} mode`, 'cyan');
        return;
      }
      
      if (key.ctrl && key.name === 'n') {
        this.sessions.createSession();
        this.log('success', 'Started new session', 'green');
        return;
      }
    });

    process.stdin.setRawMode?.(true);
    process.stdin.resume?.();
  }

  async run() {
    if (!this.apiKey) {
      this.log('error', 'MINIMAX_API_KEY not set!', 'red');
      this.log('info', 'Set it with: export MINIMAX_API_KEY=your_key', 'yellow');
      process.exit(1);
    }

    this.sessions.init();
    this.mcp.init();
    
    if (this.sessions.history.length > 0) {
      const last = this.sessions.history[0];
      this.println(style.dim(`\n📜 Last session: ${new Date(last.created).toLocaleString()} (${last.messageCount} messages)\n`));
    }

    this.setupKeyboardHandlers();
    
    while (true) {
      this.printHeader();
      
      const promptStr = this.pendingApproval 
        ? `${style.yellow('?')} ${style.bold('Approve?')} (y/n) ${style.dim('>')}`
        : `${style.prefix.user} ${style.dim('>')}`;
      
      const input = await this.prompt(promptStr + ' ');
      
      if (this.pendingApproval) {
        await this.handleCommand(input);
        this.pendingApproval = null;
        continue;
      }
      
      await this.handleCommand(input);
    }
  }
}

const args = parseArgs({
  args: process.argv,
  options: {
    model: { type: 'string', default: 'MiniMax-M2.7' },
    dir: { type: 'string', default: process.cwd() },
    continue: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
});

if (args.values.help) {
  console.log(`
${Chalk.bold('maxi')} ${Chalk.cyan('— MiniMax AI Coding Agent')}

${Chalk.bold('Usage:')} maxi [options]

${Chalk.bold('Options:')}
  ${Chalk.cyan('-m, --model')} <name>   Model to use (default: MiniMax-M2.7)
  ${Chalk.cyan('-d, --dir')} <path>     Working directory
  ${Chalk.cyan('-c, --continue')}       Continue previous session
  ${Chalk.cyan('-h, --help')}           Show this help

${Chalk.bold('Commands in TUI:')}
  help, mode, tree, cd <dir>, new, continue, clear, exit

${Chalk.bold('Keyboard Shortcuts:')}
  Ctrl+C  Exit    Ctrl+L  Clear    Ctrl+H  Help
  Ctrl+T  Tree    Ctrl+M  Mode     Ctrl+N  New
`);
  process.exit(0);
}

const tui = new MaximTUI({
  model: args.values.model,
  dir: args.values.dir,
  apiKey: process.env.MINIMAX_API_KEY,
});

if (args.values.continue) {
  tui.sessions.init();
  if (tui.sessions.history.length > 0) {
    tui.sessions.loadSession(tui.sessions.history[0].id);
  }
}

tui.run().catch((e) => {
  console.error(style.red(`\n✗ ${e.message}\n`));
  process.exit(1);
});