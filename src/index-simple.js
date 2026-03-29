#!/usr/bin/env node

import { parseArgs } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
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

if (args.values.help) {
  console.log(`
maxi - Personal AI Coding Agent (Powered by MiniMax API)

Usage:
  maxi [options] [message...]

Options:
  -m, --model <model>    Model to use (default: MiniMax-M2.7)
  -d, --dir <path>       Working directory (default: current directory)
  -c, --continue          Continue last session
  -h, --help              Show this help

Examples:
  maxi "Explain this code"
  maxi --model MiniMax-M2.7 "Write a script"
  maxi --dir /path/to/project --continue
`);
  process.exit(0);
}

const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = 'https://api.minimax.io/anthropic';

if (!API_KEY) {
  console.error('❌ MINIMAX_API_KEY environment variable not set!');
  console.error('   Run: export MINIMAX_API_KEY="your-api-key"');
  process.exit(1);
}

const message = args.positionals.slice(2).join(' ') || '';

async function callMinimax(messages) {
  const response = await fetch(`${BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: args.values.model,
      max_tokens: 4096,
      messages: messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return await response.json();
}

async function main() {
  console.log(`🔧 maxi - MiniMax AI Coding Agent`);
  console.log(`   Model: ${args.values.model}`);
  console.log(`   Dir: ${args.values.dir}`);
  console.log();

  const systemPrompt = `You are maxi, an expert AI coding agent built by Taeyun. You help developers with coding tasks.

You have access to bash commands. When the user asks you to do something:
1. Read the relevant files to understand the codebase
2. Write or edit files as needed
3. Execute commands to test or verify

Be concise and focused. Show your work through file operations.`;

  const messages = [{ role: 'user', content: systemPrompt + "\n\n" + message }];

  try {
    console.log(`⏳ Calling MiniMax API...\n`);
    const result = await callMinimax(messages);
    // Extract text from response
    const textContent = result.content.find(c => c.type === 'text');
    console.log(textContent ? textContent.text : JSON.stringify(result.content));
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
