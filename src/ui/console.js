import { createInterface } from 'readline';

export async function consoleUI(agent) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));

  console.log('╭───────────────────────────────────────────────────╮');
  console.log('│  maxi - AI Coding Agent (Powered by Maxim API)    │');
  console.log('│  Type your message or "exit" to quit              │');
  console.log('╰───────────────────────────────────────────────────╯\n');
  console.log(`Working directory: ${agent.workingDirectory}`);
  console.log(`Model: ${agent.model}\n`);

  while (true) {
    const input = await prompt('> ');

    if (!input || input.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      rl.close();
      process.exit(0);
    }

    if (!input.trim()) continue;

    console.log('\n');

    try {
      await agent.run(input);
      console.log('\n\n');
    } catch (error) {
      console.log(`Error: ${error.message}\n\n`);
    }
  }
}