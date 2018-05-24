#!/usr/bin/env node

const Discord = require("discord.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("config.json"));
const token = config.token;
const prefix = "$ ";
const cont_prefix = "│ ";
const command_prefix = "/";
const author_size = 10;
const separator = "│";
const fuzzy_separator = ":";

// to get unicode escape codes
unicode_keylogger = false;

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
ansi = {};
ansi.move_up = "\033[1A";
ansi.move_down = "\033[1B";
ansi.move_right = "\033[1C";
ansi.move_left = "\033[1D";
ansi.beginning_of_line = n => "\033[" + n + "E";
class InputBuffer {
  constructor(prefix, cont_prefix) {
    if (prefix.length !== cont_prefix.length)
      throw "Prefix and continuation prefix must be of same length.";
    this.prefix = prefix;
    this.cont_prefix = cont_prefix;
    this.lines = [[]];
    this.row = 0;
    this.col = 0;
    this.max_rows = 1; // the longest the buffer's ever been over the course of a single edit
    this.max_extra_rows = 0; // the greatest number of overflowing lines over course of a single edit
    this.history = [];
    this.history_pos = -1;
  }

  value() {
    return this.lines.map(line => line.join("")).join("\n");
  }

  home() {
    this.col = 0;
  }

  end() {
    this.col = this.lines[this.row].length;
  }

  up() {
    if (this.row > 0)
      --this.row;
    this.col = Math.min(this.col, this.lines[this.row].length);
  }

  down() {
    if (this.row < this.lines.length - 1)
      ++this.row;
    this.col = Math.min(this.col, this.lines[this.row].length);
  }

  left() {
    if (this.col > 0)
      --this.col;
    else if (this.row > 0) {
      --this.row;
      this.end();
    }
  }

  right() {
    if (this.col < this.lines[this.row].length)
      ++this.col;
    else if (this.row < this.lines.length - 1) {
      ++this.row;
      this.home();
    }
  }

  history_add() {
    this.history.push(this.lines);
    this.history_pos = this.history.length - 1;
  }

  history_prev() {
    if (this.history.length === 0)
      return;

    this.lines = this.history[this.history_pos];
    this.row = this.lines.length - 1;
    this.end();

    if (this.history_pos > 0)
      --this.history_pos;
  }

  history_next() {
    if (this.history_pos + 1 >= this.history.length)
      return;

    this.lines = this.history[++this.history_pos];
    this.row = this.lines.length - 1;
    this.end();
  }

  insert(c) {
    if (this.lines[this.row] === undefined)
      this.lines[this.row] = [];

    if (c === "\n") {
      this.lines.splice(++this.row, 0, []);
      this.col = 0;
      ++this.max_rows;
    } else
      this.lines[this.row].splice(this.col++, 0, c);
  }

  backspace(c) {
    if (this.col > 0 && this.lines[this.row].length > 0)
      this.lines[this.row].splice(--this.col, 1);
    else if (this.col === 0 && this.row > 0) {
      let remaining = this.lines.splice(this.row, 1)[0];
      this.row--;
     
      this.col = this.lines[this.row].length;
      this.lines[this.row] = this.lines[this.row].concat(remaining);
    }
  }

  delete(c) {
    if (this.col === this.lines[this.row].length && this.row < this.lines.length - 1) {
      let remaining = this.lines.splice(this.row + 1, 1)[0];
      this.lines[this.row] = this.lines[this.row].concat(remaining);
    } else
      this.lines[this.row].splice(this.col, 1);
  }

  clear() {
    this.lines = [[]];
    this.row = 0;
    this.col = 0;
    this.max_rows = 1;
    this.max_extra_rows = 0;
  }

  put() {
    // move cursor to bottom of screen
    let bottom = ansi.beginning_of_line(process.stdout.rows);
    process.stdout.write(bottom);

    // - compute the number of extra rows required
    // - compute true row, col cursor position
    // - convert each overflowing line to multiple lines
    // - maintain an array is_extra where is_extra[i] is true if the ith line of lines
    //   is the result of overlow and not a "true" line
    let row = this.row;
    let col = this.col;
    let extra_rows = 0;
    let lines = [];
    let is_extra = [];
    for (let i = 0; i < this.lines.length; ++i) {
      let cols = process.stdout.columns - this.prefix.length;
      let overflow_rows = Math.floor(this.lines[i].length / cols);
      extra_rows += overflow_rows;
      if (i < this.row)
        row += overflow_rows;
      else if (i === this.row) {
        row += Math.floor(this.col / cols);
        col = this.col % cols;
      }

      let j;
      for (j = 0; j < overflow_rows; ++j) {
        lines.push(this.lines[i].slice(j * cols, (j + 1) * cols));
        is_extra.push(j !== 0); // only the first line is a true line
      }

      let len = this.lines[i].length;
      lines.push(this.lines[i].slice(len - len % cols));
      is_extra.push(j !== 0);
    }

    this.max_extra_rows = Math.max(this.max_extra_rows, extra_rows);

    // prepare a suitable number of rows
    let rows = this.max_rows + this.max_extra_rows;
    let line_clearer = "\r" + " ".repeat(process.stdout.columns) + "\r" + ansi.move_up;
    process.stdout.write(line_clearer.repeat(rows) + ansi.move_down);

    // convert lines to text
    for (let i = 0; i < lines.length; ++i) {
      let line = lines[i].join("");
      if (i === 0)
        lines[i] = line;
      else if (!is_extra[i])
        lines[i] = this.cont_prefix + line;
      else
        lines[i] = " ".repeat(this.prefix.length) + line;
    }
    print(this.prefix + lines.join("\n"));

    // move the cursor to the right place
    let right_offset = this.prefix.length;
    if (lines.length > 0) {
      // console.log(lines.length, row, col);
      process.stdout.write(ansi.move_up.repeat(lines.length - 1 - row) + "\r");
      process.stdout.write(ansi.move_right.repeat(right_offset + col));
    }
  }
}

// wrap server/channel navigation, DMs, etc
class Client {
  constructor(token) {
    this.state = Client.TOP;
    this.client = new Discord.Client();

    this.channel = undefined; // used when state = CHANNEL or DM
    this.scroll_offset = 0; // used when state = CHANNEL or DM

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

  // callback is a function that works with an array of messages
  // the messages array is in reverse chronological order
  fetch_messages(n, callback) {
    let self = this;
    let messages = [];
    let max_request_size = 100;

    let accumulate = function(ms) {
      if (messages === undefined)
        messages = ms;
      else
        messages = messages.concat(ms.array());

      if (ms.array().length === 0 || messages.length === n)
        callback(messages); // no more messages to load
      else {
        // load next batch of messages
        let options = {
          limit: max_request_size,
          before: messages[messages.length - 1].id
        };
        self.channel.fetchMessages(options).then(accumulate);
      }
    };

    return this.channel.fetchMessages({ limit: n % max_request_size }).then(accumulate);
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
    // time stamp
    let date = m.createdAt;
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let pad_time = s => pad(s, 2, "0");
    let stamp = pad_time(hours) + ":" + pad_time(minutes);
  
    // username
    let author = pad(m.author.username, author_size, " ");
    if (m.member !== null) {
      if (rgb2octal(m.member.displayHexColor) !== rgb2octal("#000000"))
        author = colorize_rgb(author, m.member.displayHexColor);
    }
  
    // stamp length = 5
    let indent = [5, author_size, 0].reduce((x, y) => x + y + 1);
    let prefix = " ".repeat(indent) + separator + " ";
    let fuzzy_prefix = " ".repeat(indent) + fuzzy_separator + " ";
 
    // convert main message to text, accounting for overflow
    let cols = process.stdout.columns - prefix.length;
    let denull = item => item === null ? [""] : item
    let split_line = line => denull(line.match(new RegExp(".{1," + cols + "}", "g")));
    let lines = m.cleanContent.split("\n").map(split_line);
    let text = lines[0][0];

    // message body
    let combine_overflow_lines = ls => ls.map(l => "\n" + fuzzy_prefix + l).join("");
    let combine_lines = ls => "\n" + prefix + ls[0] + combine_overflow_lines(ls.slice(1));
    if (lines[0].length > 1)
      text += combine_overflow_lines(lines[0].slice(1));
    if (lines.length > 1)
      text += lines.slice(1).map(combine_lines).join("");
    
    // attachments
    if (m.attachments.array().length > 0)
      text += m.attachments.array()[0].url; // don't handle overflow--easier to copy urls
    if (m.isMemberMentioned(this.client.user)) {
      stamp = colorize(stamp, "yellow");
      text = colorize(text, "yellow");
    }

    // print message
    let out = [stamp, author, separator, text].join(" ");
    println(out);
    
    // print reactions
    let reacts = m.reactions;
    if (reacts.size > 0) {
      let react2str = function(react) {
        let num = colorize(react.count, "cyan");
        let name = colorize(react.emoji.name, "blue");
        return num + " " + name;
      };
      println(prefix + reacts.map(react2str).join(" ")); // overflow?
    }
  }

  refresh() {
    let self = this;
    let print_messages = function(messages) {
      for (let i = messages.length - 1; i >= self.scroll_offset; --i) {
        let m = messages[i];
        self.print_message(m);
      }
      if (self.scroll_offset !== 0) {
        let remark = self.scroll_offset + " more...";
        let spaces = process.stdout.columns - remark.length;
        let spaces_left = Math.floor(spaces / 2);
        let spaces_right = Math.ceil(spaces / 2);
        
        let line = " ".repeat(spaces_left) + remark + " ".repeat(spaces_right);
        println(colorize(line, "black", "white"));
      }
      input.put(); // redraw the cursor (necessary since this happens synchronously)
    };

    let n;
    switch (this.state) {
      case Client.TOP:
        println("\nNo channels to view. Type 'help' for a list of available commands.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        n = process.stdout.rows + this.scroll_offset;
        this.fetch_messages(n, print_messages);
    }
  }

  set_scroll(n) {
    let new_offset;
    switch (this.state) {
     case Client.TOP:
        println("Currently not in a text channel.");
        break;
     case Client.CHANNEL:
     case Client.DM:
        new_offset = Math.max(0, n);
        if (this.scroll_offset !== new_offset) {
          this.scroll_offset = new_offset;
          this.refresh();
        }
        break;
    }
  }

  scroll_up() {
    this.set_scroll(this.scroll_offset + 1);
  }

  scroll_down() {
    this.set_scroll(this.scroll_offset - 1);
  }

  page_down() {
    this.set_scroll(this.scroll_offset - process.stdout.rows);
  }

  page_up() {
    this.set_scroll(this.scroll_offset + process.stdout.rows);
  }

  page_end() {
    this.set_scroll(0);
  }

  send(s) {
    switch (this.state) {
      case Client.TOP:
        println("\nCurrently not in a text channel.");
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

  delete(k = 1, max_search_limit = 10) {
    let self = this;
    let delete_messages = function(messages) {
      let hits = 0;
      for (let i = 0; i < messages.length; ++i) {
        let m = messages[i];
        if (m.author.id === self.client.user.id) {
          ++hits;
          if (hits == k) {
            m.delete();
            return;
          }
        }
      }
      println("Couldn't find a message to delete within the last " + max_search_limit + " messages.");
      input.put(); // needed since this operation is synchronous
    };

    switch (this.state) {
      case Client.TOP:
        println("Currently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        this.fetch_messages(max_search_limit, delete_messages);
        break;
    }
  }

  reply_to(name, message) {
    let self = this;
    let max_search_limit = 50;
    let send_mention = function(messages) {
      for (let i = 0; i < messages.length; ++i) {
        let m = messages[i];
        //console.log(m.author.username, name);
        if (m.author.username.includes(name)) {
          m.reply(message);
          return true;
        }
      }
      println("Couldn't find sender matching '" + name + "' within last " + max_search_limit + " messages.");
      input.put();
    }

    switch (this.state) {
      case Client.TOP:
        println("Currently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        this.fetch_messages(max_search_limit, send_mention);
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
let input = new InputBuffer(prefix, cont_prefix);

function handle_keypress(key) {
  switch (key) {
    case "\u0003": // ctrl-c
    case "\u0004": // ctrl-d
      process.exit();
      break;
    case "\u007f": // bksp
      input.backspace();
      break;
    case "\r": // enter
      handle_input();
      input.history_add();
      input.clear();
      break;
    case "\u001b;": // alt+;
      input.insert("\n");
      break;
    case "\u001b[A": // up
      input.history_prev();
      break;
    case "\u001bk": // alt+k
      input.up();
      break;
    case "\u001b[B": // down
      input.history_next();
      break;
    case "\u001bj": // alt+j
      input.down();
      break;
    case "\u001b[C": // right
    case "\u001bl": // alt+l
      input.right();
      break;
    case "\u001b[D": // left
    case "\u001bh": // alt+h
      input.left();
      break;
    case "\u001b[3~": // delete
      input.delete();
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
    case "\u0005": // ctrl+e
      client.scroll_down();
      break;
    case "\u0019": // ctrl+y
      client.scroll_up();
      break;
    case "\u0006": // ctrl+f
    case "\u001b[6~": // page-down
      client.page_down();
      break;
    case "\u0002": // ctrl+b
    case "\u001b[5~": // page-up
      client.page_up();
      break;
    case "\u0007": // ctrl+g
      client.page_end();
      break;
    case "\u001bw": // alt+w
      //input.next_word();
      break;
    case "\u001bb": // alt+b
      //input.prev_word();
      break;
    case "\u001bd": // alt+d
      //input.delete_word();
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
  println();
  client.send(s);
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
  let k, max_search_limit;
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
    case "d":
    case "delete":
      k = parseInt(arg.split(" ")[0]);
      max_search_limit = parseInt(arg.split(" ")[1]);
      if (isNaN(k))
        k = undefined;
      if (isNaN(max_search_limit))
        max_search_limit = undefined;
      client.delete(k, max_search_limit);
      break;
    case "p":
    case "pwd":
      client.print_current_path();
      break;
    case "a":
    case "at":
      name = arg.split(" ")[0];
      contents = arg.substring(arg.indexOf(" ") + 1);
      client.reply_to(name, contents);
      break;
    case "h":
    case "help":
      println(fs.readFileSync("README.md"));
      break;
    default:
      println("Unknown command '" + cmd + "'.");
      break;
  }
}
