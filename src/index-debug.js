// Debug version - add logging to Write tool
import { parseArgs } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = 'https://api.minimax.io/anthropic';

if (!API_KEY) {
  console.error('MINIMAX_API_KEY not set!');
  process.exit(1);
}

const message = args.positionals.slice(2).join(' ') || '';
const cwd = args.values.dir;

async function callMinimax(messages, tools = null) {
  const requestBody = {
    model: args.values.model,
    max_tokens: 4096,
    messages: messages,
    stream: false,
  };
  if (tools) requestBody.tools = tools;

  const response = await fetch(`${BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });
  return await response.json();
}

const tools = [
  { name: 'Read', description: 'Read contents of a file', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }},
  { name: 'Write', description: 'Write content to a file', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }},
  { name: 'Edit', description: 'Edit a specific part of a file', input_schema: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] }},
  { name: 'Bash', description: 'Execute a bash command', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }},
  { name: 'Glob', description: 'Find files matching a pattern', input_schema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] }},
  { name: 'Grep', description: 'Search for text in files', input_schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }},
];

async function executeTool(toolName, toolInput) {
  const basePath = cwd;
  
  // Resolve path - if absolute use as-is, if relative join with cwd
  const resolvePath = (p) => isAbsolute(p) ? p : join(basePath, p);
  
  console.log(`[DEBUG] ${toolName} called with:`, JSON.stringify(toolInput).slice(0, 200));
  
  switch (toolName) {
    case 'Read': {
      const content = readFileSync(resolvePath(toolInput.path), 'utf-8');
      return { content: content.slice(0, 3000), truncated: content.length > 3000 };
    }
    case 'Write': {
      const targetPath = resolvePath(toolInput.path);
      console.log(`[DEBUG] Writing to: ${targetPath}`);
      const dir = dirname(targetPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(targetPath, toolInput.content, 'utf-8');
      console.log(`[DEBUG] Written, exists: ${existsSync(targetPath)}`);
      return { success: true, path: targetPath };
    }
    case 'Edit': {
      const targetPath = resolvePath(toolInput.path);
      const content = readFileSync(targetPath, 'utf-8');
      if (!content.includes(toolInput.old_string)) return { error: 'old_string not found' };
      writeFileSync(targetPath, content.replace(toolInput.old_string, toolInput.new_string), 'utf-8');
      return { success: true };
    }
    case 'Bash': {
      return new Promise((resolve) => {
        const proc = spawn(toolInput.command, [], { shell: true, cwd: basePath });
        let stdout = '', stderr = '';
        proc.stdout.on('data', (d) => stdout += d.toString());
        proc.stderr.on('data', (d) => stderr += d.toString());
        proc.on('close', (code) => resolve({ stdout, stderr, exit_code: code }));
      });
    }
    case 'Glob': {
      const results = [];
      const regex = new RegExp(toolInput.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'));
      function walk(dir) {
        try {
          for (const file of readdirSync(dir)) {
            const full = join(dir, file);
            try {
              const stat = statSync(full);
              if (stat.isDirectory() && !file.startsWith('.')) walk(full);
              else if (regex.test(file)) results.push(relative(basePath, full));
            } catch (e) {}
          }
        } catch (e) {}
      }
      walk(basePath);
      return { files: results.slice(0, 50) };
    }
    case 'Grep': {
      const results = [];
      const searchDir = toolInput.path ? resolvePath(toolInput.path) : basePath;
      function walk(dir) {
        try {
          for (const file of readdirSync(dir)) {
            const full = join(dir, file);
            try {
              const stat = statSync(full);
              if (stat.isDirectory() && !file.startsWith('.')) walk(full);
              else if (stat.isFile()) {
                const content = readFileSync(full, 'utf-8');
                if (content.includes(toolInput.pattern)) {
                  results.push(`${relative(searchDir, full)}: ${content.split('\n').findIndex(l => l.includes(toolInput.pattern)) + 1}`);
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
      walk(searchDir);
      return { matches: results.slice(0, 30) };
    }
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function main() {
  console.log(`\nmaxi - AI Coding Agent (${args.values.model})`);
  console.log(`Dir: ${cwd}\n`);

  const systemPrompt = `You are maxi, an AI coding agent. You have access to tools: Read, Write, Edit, Bash, Glob, Grep.
Working directory: ${cwd}

When using Write tool, use RELATIVE paths only (e.g., "hello.js" not "/tmp/test-maxi/hello.js").`;

  const messages = [{ role: 'user', content: systemPrompt + "\n\n" + message }];

  try {
    const result = await callMinimax(messages, tools);
    
    for (const block of result.content) {
      if (block.type === 'tool_use') {
        console.log(`\n⚡ Calling ${block.name}`);
        const toolResult = await executeTool(block.name, block.input);
        console.log(`Result:`, JSON.stringify(toolResult).slice(0, 300));
        
        const followUp = await callMinimax([
          ...messages,
          { role: 'assistant', content: `[Called ${block.name}]` },
          { role: 'user', content: `Tool result: ${JSON.stringify(toolResult)}` }
        ]);
        const text = followUp.content.find(c => c.type === 'text');
        console.log(`\nResponse: ${text ? text.text : ''}\n`);
      } else if (block.type === 'text') {
        console.log(`\n${block.text}\n`);
      }
    }
    console.log('✓ Done!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
