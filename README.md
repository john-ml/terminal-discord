# terminal-discord

Discord client for Linux console.

![screenshot](https://raw.githubusercontent.com/johnli0135/terminal-discord/master/screenshot.png).

Requires [discord.js](https://discord.js.org/).

## Setup

Create a file called `config.json` in the same directory as `index.js` that includes your Discord token. It should look like this:

```json
{
    "token": "your token here"
}
```

## Usage

`node index.js` (or run the `discord` helper script).

This should give you a prompt like the following:
```
Logging in...
Logged in as <your username>.
Type 'help' for a list of available commands.
$ 
```

Commands are prefixed with `/` (e.g. `/help` displays the contents of
[help.md](https://github.com/johnli0135/terminal-discord/blob/master/help.md),
which contains a list of available commands/hotkeys and how to use them).

