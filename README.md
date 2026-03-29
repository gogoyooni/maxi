# Maxi - AI Coding Agent CLI

A powerful AI coding agent CLI powered by MiniMax API, inspired by OpenCode.

![Maxi TUI](screenshot.png)

## Features

- 💻 **Terminal UI** - Beautiful ASCII art TUI
- 🤖 **AI Powered** - Uses MiniMax API (M2.7, M2.5, etc.)
- 📦 **Skills System** - Load coding skills to extend capabilities
- 🔌 **MCP Support** - Connect to MCP servers (Notion, GitHub, Slack, etc.)
- 🎨 **Dark Theme** - Beautiful terminal interface
- ⌨️ **Keyboard Shortcuts** - Navigate like a pro

## Installation

```bash
# Clone the repo
git clone https://github.com/gogoyooni/maxi.git
cd maxi

# Link globally
npm link

# Run
maxi
```

## Quick Start

```bash
# Set your API key
export MINIMAX_API_KEY="your-api-key"

# Run maxi
maxi

# Or with a task
maxi "Create a web server in Node.js"
```

## Commands

### General
- `help` - Show help
- `mode` - Toggle build/plan mode
- `tree` - Show file tree
- `cd <dir>` - Change directory
- `new` - New session
- `continue` - Continue previous session
- `clear` - Clear chat
- `exit` - Exit

### Skills
- `/skill list` - List all skills
- `/skill install <name>` - Install a skill
- `/skill remove <name>` - Remove a skill
- `/skill load <name>` - Load a skill
- `/load <name>` - Quick load

### MCP Servers
- `/mcp add <name> <cmd>` - Add MCP server
- `/mcp list` - List MCP servers
- `/mcp start <name>` - Start server
- `/mcp stop <name>` - Stop server

### Connect Services (OAuth)
- `/connect notion` - Connect to Notion
- `/connect github` - Connect to GitHub
- `/connect slack` - Connect to Slack

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Exit |
| `Ctrl+L` | Clear screen |
| `Ctrl+H` | Toggle help |
| `Ctrl+T` | Toggle file tree |
| `Ctrl+M` | Toggle mode |
| `Ctrl+N` | New session |

## Built-in Skills

- `default` - Base coding instructions
- `debug` - Debugging assistance
- `review` - Code review
- `stock` - Korean stock analysis

## Configuration

### API Key
```bash
export MINIMAX_API_KEY="your-minimax-api-key"
```

### Default Model
```
MiniMax-M2.7 (default)
MiniMax-M2.5
MiniMax-M2.7-highspeed
```

## Tech Stack

- **Node.js** - Runtime
- **chalk** - Terminal colors
- **ai SDK** - AI integration
- **MiniMax API** - AI backend

## License

MIT

---

Built with ❤️ using MiniMax API
