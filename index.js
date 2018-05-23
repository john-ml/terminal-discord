#!/usr/bin/env node

const Discord = require("discord.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync(process.env.HOME + "/AURs/terminal-discord/config.json"));
const token = config.token;
const prefix = "> ";
const command_prefix = "/";
const author_size = 10;
const separator = "│";

// to get unicode escape codes
unicode_keylogger = true;

// helper printing functions
function clear_line() {
  process.stdout.write("\r" + " ".repeat(process.stdout.columns) + "\r");
}

function println(s = "") {
  process.stdout.write(s + "\n");
}

function print(s = "") {
  process.stdout.write(s);
}

function rgb2octal(hex) {
  hex = hex.substring(1); // drop the leading #

  let r = hex.substring(0, 2);
  let g = hex.substring(2, 4);
  let b = hex.substring(4, 6);

  r = parseInt(r, 16);
  g = parseInt(g, 16);
  b = parseInt(b, 16);

  r = +(r >= 128) + "";
  g = +(g >= 128) + "";
  b = +(b >= 128) + "";

  return parseInt(b + g + r, 2);
}

function colorize_octal(string, foreground = 0b111, background = 0b000) {
  let set = "\033[3" + foreground + ";4" + background + "m";
  let reset = "\033[0m";
  return set + string + reset;
}

function colorize_rgb(string, foreground = "#ffffff", background = "#000000") {
  return colorize_octal(string, rgb2octal(foreground), rgb2octal(background));
}

function colorize(string, foreground = "white", background = "black") {
  let colors = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  let fg = colors.indexOf(foreground);
  let bg = colors.indexOf(background);

  if (fg !== -1 && bg !== -1)
    return colorize_octal(string, fg, bg);
}

function pad(str, len, pad_char) {
  if (str.length >= len)
    return str.substring(0, len);

  let s = pad_char.repeat(len) + str;
  return s.substring(s.length - len);
}

// manually mantain the input buffer
class InputBuffer {
  constructor(prefix) {
    this.prefix = prefix;
    this.chars = [];
    this.position = 0;
  }

  value() {
    return this.chars.join("");
  }

  left() {
    if (this.position > 0)
      --this.position;
  }

  right() {
    if (this.position < this.chars.length)
      ++this.position;
  }

  home() {
    this.position = 0;
  }

  end() {
    this.position = this.chars.length;
  }

  next_word() {
    // skip non-whitespace
    while (this.position < this.chars.length
        && !/\s/.test(this.chars[this.position]))
      ++this.position;
    // skip whitespace and stop at first non-whitespace
    while (this.position < this.chars.length
        && /\s/.test(this.chars[this.position]))
      ++this.position;
  }

  prev_word() {
    // skip whitespace
    while (this.position > 0
        && /\s/.test(this.chars[this.position - 1]))
      --this.position;
    // skip non-whitespace and stop one character after next whitespace
    while (this.position > 0
        && !/\s/.test(this.chars[this.position - 1]))
      --this.position;
  }

  delete_word() {
    // delete non-whitespace
    while (this.position < this.chars.length
        && !/\s/.test(this.chars[this.position]))
      this.delete();
    // delete whitespace
    while (this.position < this.chars.length
        && /\s/.test(this.chars[this.position]))
      this.delete();
  }

  insert(c) {
    this.chars.splice(this.position++, 0, c);
  }

  backspace(c) {
    if (this.position > 0 && this.chars.length > 0)
      this.chars.splice(--this.position, 1);
  }

  delete(c) {
    if (this.chars.length > 0)
      this.chars.splice(this.position, 1);
  }

  clear() {
    this.chars = [];
    this.position = 0;
  }

  put() {
    clear_line();
    print(this.prefix + this.value());
    process.stdout.write("\b".repeat(this.chars.length - this.position));
  }
}

// wrap server/channel navigation, DMs, etc
class Client {
  constructor(token) {
    this.state = Client.TOP;
    this.client = new Discord.Client();

    this.channel = undefined; // used when state = CHANNEL or DM

    // hook up discord.js events
    println("Logging in...");
    this.client.login(token);
    this.client.on("ready", () => {
      println("Logged in as " + this.client.user.username + ".");
      println("Type 'help' for a list of available commands.");
      input.put();
      stdin = process.openStdin();
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.on("data", handle_keypress);
    });
  }

  servers() {
    return this.client.guilds.array();
  }

  channels(server) {
    let channels = server.channels.array();
    return channels.filter(c => c.type === "text");
  }

  list_servers() {
    let ss = this.servers();
    switch (this.state) {
      case Client.TOP:
      case Client.DM:
        println(ss.map(s => "  " + s.name).join("\n"));
        break;
      case Client.CHANNEL:
        println(ss.map(s => (s.id == this.channel.guild.id ? "* " : "  ") + s.name).join("\n"));
        break;
    }
  }

  list_channels() {
    let cs;
    switch (this.state) {
      case Client.TOP:
        println("No channels to view (currently not in a server).");
        break;
      case Client.DM:
        println("No channels to view (currently viewing DMs).");
        break;
      case Client.CHANNEL:
        cs = this.channels(this.channel.guild);
        println(cs.map(c => (c.id == this.channel.id ? "* " : "  ") + c.name).join("\n"));
        break;
    }
  }

  print_current_path() {
    switch (this.state) {
      case Client.TOP:
        println("/");
        break;
      case Client.DM:
        println("not implemented yet"); // TODO
        break;
      case Client.CHANNEL:
        println("/" + this.channel.guild.name + "/" + this.channel.name);
        break;
    }
  }

  view_channel(channel_query, server) {
    if (server === undefined) {
      switch (this.state) {
        case Client.TOP:
          println("No channels to view (currently not in a server).");
          return;
        case Client.DM:
          println("No channels to view (currently viewing DMs).");
          return;
        case Client.CHANNEL:
          server = this.channel.guild;
      }
    } 
    let cs = this.channels(server);
    cs = cs.filter(c => c.name.includes(channel_query));
    if (cs.length > 0) {
      this.channel = cs[0];
      this.state = Client.CHANNEL;
      this.refresh();
      return true;
    }
    println("No channel matching '" + channel_query + "'.");
    return false;
  }

  view_server(server_query, channel_query) {
    let ss = this.servers();
    ss = ss.filter(s => s.name.includes(server_query));
    if (ss.length > 0)
      for (let i = 0; i < ss.length; ++i)
        if (this.view_channel(channel_query, ss[i]))
          return;
    println("No server matching '" + server_query + "' with channel matching '" + channel_query + "'.");
  }

  print_message(m) {
    let text = m.cleanContent;
  
    let date = m.createdAt;
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let pad_time = s => pad(s, 2, "0");
    let stamp = pad_time(hours) + ":" + pad_time(minutes);
  
    let author = pad(m.author.username, author_size, " ");
    if (m.member !== null) {
      if (rgb2octal(m.member.displayHexColor) !== rgb2octal("#000000"))
        author = colorize_rgb(author, m.member.displayHexColor);
    }
  
    if (m.attachments.array().length > 0)
      text += m.attachments.array()[0].url;
    if (m.isMemberMentioned(this.client.user)) {
      stamp = colorize(stamp, "yellow");
      text = colorize(text, "yellow");
    }

    let out = [stamp, author, separator, text].join(" ");
    println(out);
    
    let reacts = m.reactions;
    if (reacts.size > 0) {
      // stamp length = 5
      let indent = [5, author_size, separator.length, 0].reduce((x, y) => x + y + 1);
      let prefix = " ".repeat(indent);
      let react2str = function(react) {
        let num = colorize(react.count, "cyan");
        let name = colorize(react.emoji.name, "blue");
        return num + " " + name;
      };
      println(prefix + reacts.map(react2str).join(" "));
    }
  }

  refresh() {
    let self = this;
    let print_messages = function(messages) {
      for (let i = messages.size - 1; i >= 0; --i) {
        let m = messages.array()[i];
        self.print_message(m);
      }
      input.put(); // redraw the cursor (necessary since this happens synchronously)
    };
    switch (this.state) {
      case Client.TOP:
        println("No channels to view. Type 'help' for a list of available commands.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        this.channel.fetchMessages({ limit: process.stdout.rows })
          .then(print_messages);
    }
  }

  send(s) {
    switch (this.state) {
      case Client.TOP:
        println("Currently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        this.channel.send(s);
        break;
    }
  }

  send_image(path) {
    switch (this.state) {
      case Client.TOP:
        println("Currently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        this.channel.send({
          files: [{ attachment: path, name: "image.png" }]
        });
        break;
    }
  }
}
// "state enum"
Client.TOP = 0;
Client.DM = 1;
Client.CHANNEL = 2;

let stdin;
let client = new Client(token);
let input = new InputBuffer(prefix);

function handle_keypress(key) {
  switch (key) {
    case "\u0003": // ctrl-c
    case "\u0004": // ctrl-d
      process.exit();
      break;
    case "\u007f": // bksp
      input.backspace();
      input.put();
      break;
    case "\r": // enter
      handle_input();
      input.clear();
      break;
    case "\u001b[A": // up
    case "\u001bbk": // alt+k
      // TODO: history
      break;
    case "\u001b[B": // down
    case "\u001bj": // alt+j
      // TODO: history
      break;
    case "\u001b[C": // right
    case "\u001bl": // right
      input.right();
      break;
    case "\u001b[D": // left
    case "\u001bh": // left
      input.left();
      break;
    case "\u001b[3~": // delete
      input.delete();
      break;
    case "\u001bw": // alt+w
      input.next_word();
      break;
    case "\u001bb": // alt+b
      input.prev_word();
      break;
    case "\u001bd": // alt+d
      input.delete_word();
      break;
    case "\u001b[1~": // home
      input.home();
      break;
    case "\u001b[4~": // end
      input.end();
      break;
    case "\u001b": // esc
      input.clear();
      break;
    default:
      if (unicode_keylogger) {
        print(JSON.stringify(key));
        return;
      }
      input.insert(key);
      break;
  }
  input.put();
}

function handle_input() {
  let s = input.value();
  if (s.startsWith(command_prefix)) {
    handle_command(s.substring(command_prefix.length));
    return;
  }
  client.send(s)
}

function handle_command(command) {
  let i = command.indexOf(" ");
  let cmd, arg;
  if (i === -1) {
    cmd = command;
    arg = "";
  } else {
    cmd = command.substring(0, i);
    arg = command.substring(i + 1);
  }

  switch (cmd) {
    case "r":
    case "refresh":
      break;
    default:
      println();
      break;
  }

  let server_query, channel_query;
  switch (cmd) {
    case "q":
    case "quit":
      process.exit();
      break;
    case "r":
    case "refresh":
      client.refresh();
      break;
    case "ss":
    case "servers":
      client.list_servers();
      break;
    case "cs":
    case "channels":
      client.list_channels();
      break;
    case "c":
    case "channel":
      client.view_channel(arg);
      break;
    case "s":
    case "server":
      server_query = arg.split(" ")[0];
      channel_query = arg.split(" ")[1];
      if (channel_query === undefined)
        channel_query = "";
      client.view_server(server_query, channel_query);
      break;
    case "i":
    case "image":
      client.send_image(arg);
      break;
    case "pwd":
      client.print_current_path();
      break;
    default:
      println("Unknown command '" + cmd + "'.");
      break;
  }
}
