#!/usr/bin/env node

import { parseArgs } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ANSI colors
const colors = { reset: '\x1b[0m', bright: '\x1b[1m', green: '\x1b[32m', blue: '\x1b[34m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m' };
const log = (sym, msg, c='blue') => console.log(`${colors[c]}${sym}${colors.reset} ${msg}`);

const args = parseArgs({ args: process.argv, options: { model: { type: 'string', default: 'MiniMax-M2.7' }, dir: { type: 'string', default: process.cwd() }, help: { type: 'boolean', short: 'h', default: false } }, allowPositionals: true });

if (args.values.help) {
  console.log(`\n${colors.bright}maxi${colors.reset} - Personal AI Coding Agent (MiniMax API)\n\nUsage: maxi [options] [task]\n  -m, --model <m>  Model (default: MiniMax-M2.7)\n  -d, --dir <p>    Working directory\n  -h               Help\n\nExample: maxi "Create a web server"`);
  process.exit(0);
}

const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = 'https://api.minimax.io/anthropic';
if (!API_KEY) { log('✗', 'MINIMAX_API_KEY not set!', 'red'); process.exit(1); }

const message = args.positionals.slice(2).join(' ') || '';
const cwd = args.values.dir;

async function callMinimax(messages, tools) {
  const response = await fetch(`${BASE_URL}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: args.values.model, max_tokens: 4096, messages, stream: false, ...(tools && { tools }) }),
  });
  return response.json();
}

const tools = [
  { name: 'Read', description: 'Read file', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }},
  { name: 'Write', description: 'Write file', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }},
  { name: 'Edit', description: 'Edit file', input_schema: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] }},
  { name: 'Bash', description: 'Run command', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }},
  { name: 'Glob', description: 'Find files', input_schema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] }},
  { name: 'Grep', description: 'Search files', input_schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }},
];

async function execTool(name, input) {
  const resolve = (p) => isAbsolute(p) ? p : join(cwd, p);
  switch (name) {
    case 'Read': return { content: readFileSync(resolve(input.path), 'utf-8').slice(0, 3000) };
    case 'Write': {
      const p = resolve(input.path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, input.content, 'utf-8');
      return { success: true, path: p };
    }
    case 'Edit': {
      const p = resolve(input.path);
      const c = readFileSync(p, 'utf-8');
      if (!c.includes(input.old_string)) return { error: 'Text not found' };
      writeFileSync(p, c.replace(input.old_string, input.new_string), 'utf-8');
      return { success: true };
    }
    case 'Bash': return new Promise(r => {
      const p = spawn(input.command, [], { shell: true, cwd });
      let out = '', err = '';
      p.stdout.on('data', d => out += d);
      p.stderr.on('data', d => err += d);
      p.on('close', code => r({ stdout: out, stderr: err, exit_code: code }));
    });
    case 'Glob': {
      const results = [];
      const re = new RegExp(input.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'));
      const walk = d => { try { readdirSync(d).forEach(f => { const fp = join(d, f); try { const s = statSync(fp); s.isDirectory() && !f.startsWith('.') ? walk(fp) : re.test(f) && results.push(relative(cwd, fp)); } catch(e) {} }); } catch(e) {} };
      walk(cwd);
      return { files: results.slice(0, 50) };
    }
    case 'Grep': {
      const results = [], dir = input.path ? resolve(input.path) : cwd;
      const walk = d => { try { readdirSync(d).forEach(f => { const fp = join(d, f); try { const s = statSync(fp); if (s.isDirectory() && !f.startsWith('.')) walk(fp); else if (s.isFile()) { const c = readFileSync(fp, 'utf-8'); if (c.includes(input.pattern)) results.push(`${relative(dir, fp)}: ${c.split('\n').findIndex(l => l.includes(input.pattern)) + 1}`); } } catch(e) {} }); } catch(e) {} };
      walk(dir);
      return { matches: results.slice(0, 30) };
    }
    default: return { error: `Unknown: ${name}` };
  }
}

async function main() {
  console.log(`\n${colors.bright}🔧 maxi${colors.reset} - ${args.values.model} @ ${cwd}\n`);
  
  const systemPrompt = `You are maxi, a coding agent. Tools: Read, Write, Edit, Bash, Glob, Grep. Use RELATIVE paths only (not absolute). cwd: ${cwd}`;
  const messages = [{ role: 'user', content: systemPrompt + '\n\n' + message }];

  try {
    const result = await callMinimax(messages, tools);
    for (const block of result.content) {
      if (block.type === 'tool_use') {
        log('⚡', `${block.name}(${JSON.stringify(block.input).slice(0, 80)}...)`, 'yellow');
        const res = await execTool(block.name, block.input);
        log('ℹ', JSON.stringify(res).slice(0, 150), 'blue');
        
        const followUp = await callMinimax([...messages, { role: 'assistant', content: `[${block.name}]` }, { role: 'user', content: `Result: ${JSON.stringify(res)}` }]);
        const txt = followUp.content.find(c => c.type === 'text');
        if (txt) console.log(`\n${colors.green}${txt.text}${colors.reset}\n`);
      } else if (block.type === 'text') {
        console.log(`\n${colors.green}${block.text}${colors.reset}\n`);
      }
    }
    log('✓', 'Done!', 'green');
  } catch (e) {
    log('✗', e.message, 'red');
    process.exit(1);
  }
}

main();
