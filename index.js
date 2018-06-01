#!/usr/bin/env node

const Discord = require("discord.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("config.json"));
const save_file = "saved_tabs.json";
const token = config.token;
const prefix = "$ ";
const cont_prefix = "│ ";
const command_prefix = "/";
const author_size = 15;
const separator = "│";
const fuzzy_separator = ":";
const auto_refresh = true;

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

function color2octal(name) {
  let colors = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  return colors.indexOf(name);
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
  let fg = color2octal(foreground);
  let bg = color2octal(background);

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
ansi.to_pos = (m, n) => "\033[" + m + ";" + n + "H";
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

  load_string(s) {
    this.clear();
    this.lines = s.split("\n").map(line => line.split(""));
    this.row = this.lines.length - 1;
    this.end();
    this.max_rows = this.lines.length;
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
    let bottom = ansi.to_pos(process.stdout.rows, 0);
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
    this.client = new Discord.Client();
    // array of {
    //   channel: Channel,
    //   scroll_offset: int,
    //   edit_stack: [Message],
    //   last_read: Date,
    //   latest: Date,
    // }
    this.tabs = []; 
    this.current_tab = -1;

    // hook up discord.js events
    let self = this;
    async function on_ready() {
      println("Logged in as " + self.client.user.username + ".");
      println("Checking for saved tabs...");
      stdin = process.openStdin();
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.on("data", handle_keypress);
      if (fs.existsSync(save_file)) {
        print("Loading saved tabs ");
        let json = JSON.parse(fs.readFileSync(save_file));
        let candidates = self.client.channels.array();
        let get_latest_date = function(c) {
          return c.fetchMessages({ limit: 1 }).then(msgs => {
            let ms = msgs.array();
            if (ms.length === 0)
              return 0;
            return ms[0].createdTimestamp.valueOf();
          });
        };
        self.tabs = [];
        for (let i = 0; i < json.tabs.length; ++i) {
          let tab = json.tabs[i];
          for (let i = 0; i < candidates.length; ++i) {
            let c = candidates[i];
            if (c.id === tab.channel.id) {
              let latest = await get_latest_date(c);
              self.tabs.push({
                channel: c,
                scroll_offset: tab.scroll_offset,
                edit_stack: [],
                last_read: tab.last_read,
                latest: latest
              });
              break;
            }
          }
          print("\rLoading saved tabs (" + i + " of " + json.tabs.length + ")");
        }
        println();
        self.current_tab = json.current_tab;
        self.refresh();
      } else 
        println("Type 'help' for a list of available commands.");

      input.put();

      if (auto_refresh) {
        let update = m => {
          if (self.state() === Client.TOP)
            return;
          if (m.channel.id === self.channel().id)
            self.refresh();
          else {
            for (let i = 0; i < self.tabs.length; ++i)
              if (m.channel.id === self.tabs[i].channel.id)
                self.tabs[i].latest = Date.now();
            self.print_tabs();
            input.put(); // restore cursor position
          }
        }; 
        self.client.on("message", update);
        self.client.on("messageDelete", update);
        self.client.on("messageUpdate", update);
      }
    }

    println("Logging in...");
    this.client.login(token);
    this.client.on("ready", on_ready);
  }

  servers() {
    return this.client.guilds.array();
  }

  channels(server) {
    let channels = server.channels.array();
    channels = channels.filter(c => c.type === "text");
    channels = channels.sort((a, b) => a.name.localeCompare(b.name));
    return channels;
  }

  tab() {
    return this.tabs[this.current_tab];
  }

  channel() {
    return this.tab().channel;
  }

  scroll_offset() {
    return this.tab().scroll_offset;
  }

  set_scroll_offset(n) {
    this.tab().scroll_offset = n;
  }

  edit_stack() {
    return this.tab().edit_stack;
  }

  mark_as_read(number = this.current_tab) {
    console.log(this.tabs[number].last_read, Date.now());
    this.tabs[number].last_read = Date.now();
  }

  state() {
    if (this.current_tab === -1)
      return Client.TOP;
    switch (this.channel().type) {
      case "text": return Client.CHANNEL;
      case "dm": return Client.DM;
    }
  }

  // callback is a function that works with an array of messages
  // the messages array is in reverse chronological order
  fetch_messages(n, callback, before, after) {
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
        if (after !== undefined) // need to propagate this
          options.after = after;
        self.channel().fetchMessages(options).then(accumulate);
      }
    };

    let options = { limit: n % max_request_size };
    if (before !== undefined)
      options.before = before;
    if (after !== undefined)
      options.after = after;
    return this.channel().fetchMessages(options).then(accumulate);
  }

  list_servers() {
    let ss = this.servers();
    let highlighter = s => s.id === this.channel().guild.id
                        ? colorize(s.name, "black", "white")
                        : colorize(s.name, "white", "black");
    let compare_names = (a, b) => a.name.localeCompare(b.name);
    switch (this.state()) {
      case Client.TOP:
      case Client.DM:
        println(ss.map(s => s.name).join("\n"));
        break;
      case Client.CHANNEL:
        println(ss.sort(compare_names).map(highlighter).join("\n"));
        break;
    }
  }

  list_channels() {
    let cs;
    let highlighter = s => s.id === this.channel().id
                        ? colorize(s.name, "black", "white")
                        : colorize(s.name, "white", "black");
    let compare_names = (a, b) => a.name.localeCompare(b.name);
    switch (this.state()) {
      case Client.TOP:
        println("No channels to view (currently not in a server).");
        break;
      case Client.DM:
        println("No channels to view (currently viewing DMs).");
        break;
      case Client.CHANNEL:
        cs = this.channels(this.channel().guild);
        println(cs.sort(compare_names).map(highlighter).join("\n"));
        break;
    }
  }

  print_current_path() {
    switch (this.state()) {
      case Client.TOP:
        println("/");
        break;
      case Client.DM:
        println("/" + this.channel().recipient.username);
        break;
      case Client.CHANNEL:
        println("/" + this.channel().guild.name + "/" + this.channel().name);
        break;
    }
  }

  view_one_of(channels, new_tab = false) {
    let namify = c => c.type === "dm" ? c.recipient.username : c.name;
    let channel = channels.sort((a, b) => namify(a).length - namify(b).length)[0];

    let i;
    for (i = 0; i < this.tabs.length; ++i)
      if (this.tabs[i].channel.id === channel.id)
        break;

    if (i !== this.tabs.length) {
      this.current_tab = i;
      return;
    }

    new_tab = new_tab || this.tabs.length === 0;
    let new_metadata = { channel: channel, scroll_offset: 0, edit_stack: [], read: false };
    if (new_tab) {
      this.tabs.push(new_metadata);
      this.current_tab = this.tabs.length - 1;
    } else {
      this.tabs[this.current_tab] = new_metadata;
    }
    this.mark_as_read();
  }

  view_direct_messages(name_query, new_tab = false) {
    let satisfactory = c => c.type === "dm" && c.recipient.username.includes(name_query);
    let channels = this.client.channels;
    channels = channels.filterArray(satisfactory);
    channels = channels.sort((a, b) => a.recipient.username.localeCompare(b.recipient.username));

    if (channels.length > 0) {
      this.view_one_of(channels, new_tab);
      this.refresh();
      return;
    }
    println("No DM channel matching '" + name_query + "'.");
  }

  view_channel(channel_query, server, new_tab = false) {
    if (server === undefined) {
      switch (this.state()) {
        case Client.TOP:
          println("No channels to view (currently not in a server).");
          return;
        case Client.DM:
          println("No channels to view (currently viewing DMs).");
          return;
        case Client.CHANNEL:
          server = this.channel().guild;
      }
    } 
    let cs = this.channels(server);
    cs = cs.filter(c => c.name.includes(channel_query));
    if (cs.length > 0) {
      this.view_one_of(cs, new_tab);
      this.refresh();
      return true;
    }
    println("No channel matching '" + channel_query + "'.");
    return false;
  }

  view_server(server_query, channel_query, new_tab = false) {
    let ss = this.servers();
    ss = ss.filter(s => s.name.includes(server_query));
    if (ss.length > 0)
      for (let i = 0; i < ss.length; ++i)
        if (this.view_channel(channel_query, ss[i], new_tab))
          return;
    println("No server matching '" + server_query + "' with channel matching '" + channel_query + "'.");
  }

  switch_to(tab_number) {
    if (this.state() === Client.TOP) {
      println("No tabs open.");
      return;
    }
    if (tab_number < 1 || tab_number > this.tabs.length) {
      println("Tab " + tab_number + " does not exist.")
      return;
    }
    this.current_tab = tab_number - 1;
    this.mark_as_read();
    this.refresh();
  }

  close(tab_number = this.current_tab + 1) {
    if (this.state() === Client.TOP) {
      println("No tabs to close.");
      return;
    }
    if (tab_number < 1 || tab_number > this.tabs.length) {
      println("Tab " + tab_number + " does not exist.")
      return;
    }
    this.tabs.splice(tab_number - 1, 1);
    this.current_tab = Math.min(this.current_tab, this.tabs.length - 1);
    if (this.tabs.length > 0)
      this.refresh();
  }

  print_message(m) {
    let is_editing = this.editing() && m.id === this.edit_message().id;
    let bg_color = is_editing ? color2octal("white") : color2octal("black");
    let fg_color = is_editing ? color2octal("black") : color2octal("white");
    let colorize_octal_ = function(string, octal) {
      if (is_editing)
        return colorize_octal(string, fg_color, octal);
      else
        return colorize_octal(string, octal, bg_color);
    }
    let colorize_ = (string, color) => colorize_octal_(string, color2octal(color));
    let colorize_default = (string) => colorize_octal(string, fg_color, bg_color);

    let space = colorize_default(" ");
    let sep = colorize_default(separator);
    let fuzzy_sep = colorize_default(fuzzy_separator);
 
    // time stamp
    let date = m.createdAt;
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let pad_time = s => pad(s, 2, "0");
    let stamp = pad_time(hours) + ":" + pad_time(minutes);
  
    // username
    let author = pad(m.author.username, author_size, " ");
    if (m.member !== null) {
      let color = rgb2octal(m.member.displayHexColor);
      color = color === color2octal("black") ? color2octal("white") : color;
      author = colorize_octal_(author, color);
    }
  
    // stamp length = 5
    let indent = [5, author_size, 0].reduce((x, y) => x + y + 1);
    let prefix = space.repeat(indent) + sep + space;
    let fuzzy_prefix = space.repeat(indent) + fuzzy_sep + space;
 
    // number of columns available for each line of message
    let cols = process.stdout.columns - indent - separator.length - 1;
    let line_number_size = 3; // assume no fenced code blocks > 1000 lines in length
    let fenced_space = "  ";
    let fenced_cols = cols - line_number_size - fenced_space.length;

    // helpers for text2lines and fenced2lines
    let denull = item => item === null ? [""] : item;
    let split_text = cols => text => denull(text.match(new RegExp(".{1," + cols + "}", "g")));

    // functions to convert a message (that may contain fenced code blocks) into multiple lines
    // where each line is gauranteed not to overflow
    let text2lines = function(text) {
      let fence = text.indexOf("```");

      if (fence === -1)
        return text.split("\n").map(split_text(cols));

      let texts = [];
      if (fence !== 0)
        texts = text2lines(text.substring(0, fence));

      return texts.concat(fenced2lines(text.substring(fence + "```".length)));
    };
    let fenced2lines = function(text) {
      let fence = text.indexOf("```");

      let number_line = function(line, number) {
        let line_number = colorize_(pad(number + "", line_number_size, " "), "yellow") + fenced_space;
        let spaces = " ".repeat(line_number_size + fenced_space.length);

        let first = line_number + line[0];
        let rest = line.slice(1).map(l => spaces + l);
        return [first].concat(rest);
      }

      if (fence === -1)
        return text.split("\n").map(split_text(fenced_cols)).map(number_line);
  
      let fenced = [];
      if (fence !== 0)
        fenced = fenced2lines(text.substring(0, fence));

      return fenced.concat(text2lines(text.substring(fence + "```".length)));
    };
    let lines = text2lines(m.cleanContent);
    let text = lines[0][0];

    // message body
    let combine_overflow_lines = ls => ls.map(l => "\n" + fuzzy_prefix + l).join("");
    let combine_lines = ls => "\n" + prefix + ls[0] + combine_overflow_lines(ls.slice(1));
    if (lines[0].length > 1)
      text += combine_overflow_lines(lines[0].slice(1));
    if (lines.length > 1)
      text += lines.slice(1).map(combine_lines).join("");
    
    // attachments
    // don't handle overflow--easier to copy urls
    if (m.attachments.array().length > 0) {
      let attachments = m.attachments.array();
      attachments = attachments.map(a => "\n" + prefix + colorize_(a.url, "magenta"));
      text += attachments;
    }

    // mentions
    if (m.isMemberMentioned(this.client.user)) {
      stamp = colorize_(stamp, "yellow");
      text = colorize_(text, "yellow");
    } else {
      stamp = colorize_default(stamp);
      text = colorize_default(text);
    }

    // print message
    let out = [stamp, author, sep, text].join(space);
    println(out);
    
    // print reactions
    let reacts = m.reactions;
    if (reacts.size > 0) {
      let react2str = function(react) {
        let num = colorize_(react.count, "cyan");
        let name = colorize_(react.emoji.name, "blue");
        return num + space + name;
      };
      println(prefix + reacts.map(react2str).join(space)); // overflow?
    }
  }

  save_tabs() {
    fs.writeFileSync(save_file, JSON.stringify({
      tabs: this.tabs,
      current_tab: this.current_tab
    }));
  }

  print_tabs() {
    if (this.state() === Client.TOP)
      return;

    let self = this;

    print(ansi.to_pos(0, 0));
    clear_line();

    let channel2str = function(tab, number, max_name_length = 1 << 30) {
      let num, len;
      let is_read = function(tab) {
        return tab.last_read >= tab.latest;
      };

      num = (number + 1).toString();
      len = num.length;
      if (number !== self.current_tab && is_read(self.tabs[number]))
        num = colorize(num, "cyan");

      let name;
      if (tab.channel.type === "dm")
        name = "@" + tab.channel.recipient.username;
      else if (tab.channel.type === "text")
        name = tab.channel.name + " @ " + tab.channel.guild.name;
      name = name.substring(0, max_name_length - len);
      len += name.length;

      name = " " + num + " " + name + " ";
      len += 3;

      if (number === self.current_tab)
        name = colorize(name, "black", "white");
      else if (!is_read(self.tabs[number]))
        name = colorize(name, "black", "cyan");

      return [name, len];
    };

    let string_lens = this.tabs.map((e, i) => channel2str(e, i));
    let strings = string_lens.map(packed => packed[0]);
    let lengths = string_lens.map(packed => packed[1]);
    let sum = list => list.reduce((x, y) => x + y);
    let argmax = function (list) {
      let a, max = -Infinity;
      for (let i = 0; i < list.length; ++i) {
        if (list[i] > max) {
          max = list[i];
          a = i;
        }
      }
      return a;
    };

    let max_name_length = Math.floor(process.stdout.columns / this.tabs.length) - 3;
    if (max_name_length <= 1) {
    } else while (sum(lengths) > process.stdout.columns) {
      let a = argmax(lengths);
      [strings[a], lengths[a]] = channel2str(this.tabs[a], a, max_name_length);
    } 

    print(strings.join(""));
  }

  refresh() {
    let self = this;
    let print_messages = function(messages) {
      for (let i = messages.length - 1; i >= self.scroll_offset(); --i) {
        let m = messages[i];
        self.print_message(m);
      }
      if (self.scroll_offset() !== 0) {
        let remark = self.scroll_offset() + " more...";
        let spaces = process.stdout.columns - remark.length;
        let spaces_left = Math.floor(spaces / 2);
        let spaces_right = Math.ceil(spaces / 2);
        
        let line = " ".repeat(spaces_left) + remark + " ".repeat(spaces_right);
        println(colorize(line, "black", "white"));
      }

      self.print_tabs();
      input.put(); // redraw the cursor (necessary since this happens synchronously)
    };

    let n;
    switch (this.state()) {
      case Client.TOP:
        println("\nNo channels to view. Type 'help' for a list of available commands.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        n = process.stdout.rows + this.scroll_offset();
        this.fetch_messages(n, print_messages);
        break;
    }
  }

  set_scroll(n) {
    let new_offset;
    switch (this.state()) {
     case Client.TOP:
        println("Currently not in a text channel.");
        break;
     case Client.CHANNEL:
     case Client.DM:
        new_offset = Math.max(0, n);
        if (this.scroll_offset() !== new_offset) {
          this.set_scroll_offset(new_offset);
          this.refresh();
        }
        break;
    }
  }

  scroll_up() {
    this.set_scroll(this.scroll_offset() + 1);
  }

  scroll_down() {
    this.set_scroll(this.scroll_offset() - 1);
  }

  page_down() {
    this.set_scroll(this.scroll_offset() - process.stdout.rows);
  }

  page_up() {
    this.set_scroll(this.scroll_offset() + process.stdout.rows);
  }

  page_end() {
    this.set_scroll(0);
  }

  send(s) {
    switch (this.state()) {
      case Client.TOP:
        println("\nCurrently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        if (this.editing()) {
          this.edit_message().edit(s);
          this.stop_editing();
        } else
          this.channel().send(s);
        break;
    }
  }

  send_image(path) {
    switch (this.state()) {
      case Client.TOP:
        println("Currently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        this.channel().send({
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

    switch (this.state()) {
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
        if (m.author.username.includes(name)) {
          m.reply(message);
          return true;
        }
      }
      println("Couldn't find sender matching '" + name + "' within last " + max_search_limit + " messages.");
      input.put();
    }

    switch (this.state()) {
      case Client.TOP:
        println("Currently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        this.fetch_messages(max_search_limit, send_mention);
        break;
    }
  }

  edit_select(mode = "latest", id) {
    let self = this;
    let max_search_limit = 10;
    let select_for_editing = function(messages) {
      for (let i = 0; i < messages.length; ++i) {
        let m = messages[i];
        if (m.author.id === self.client.user.id) {
          self.edit_stack().push(m);
          input.load_string(m.cleanContent);
          self.refresh();
          return;
        }
      }
      println("Couldn't find message sent by '" + self.client.user.username +
              "' within last " + max_search_limit + " messages.");
    }
    
    switch (this.state()) {
      case Client.TOP:
        println("Currently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        switch (mode) {
          case "latest": this.fetch_messages(max_search_limit, select_for_editing); break;
          case "before": this.fetch_messages(max_search_limit, select_for_editing, id); break;
        }
        break;
    }
  }

  start_editing() {
    this.edit_select();
  }

  edit_prev() {
    this.edit_select("before", this.edit_message().id);
  }

  edit_next() {
    switch (this.state()) {
      case Client.TOP:
        println("Currently not in a text channel.");
        break;
      case Client.CHANNEL:
      case Client.DM:
        this.edit_stack().pop();
        if (this.editing())
          input.load_string(this.edit_message().cleanContent);
        this.refresh();
        break;
    }
  }

  editing() {
    if (this.state() === Client.TOP)
      return false;
    return this.edit_stack().length > 0;
  }

  edit_message() { return this.edit_stack()[this.edit_stack().length - 1]; }

  stop_editing() {
    this.tabs[this.current_tab].edit_stack = [];
    this.refresh();
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
  let chars;
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
      client.print_tabs();
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
      if (client.editing())
        client.stop_editing();
      break;
    case "\u0005": // ctrl+e
      client.scroll_down();
      break;
    case "\u0019": // ctrl+y
      client.scroll_up();
      break;
    case "\u0006": // ctrl+f
      if (client.editing())
        client.edit_next();
      else
        client.page_down();
      break;
    case "\u001b[6~": // page-down
      client.page_down();
      break;
    case "\u0002": // ctrl+b
      if (client.editing())
        client.edit_prev();
      else
        client.page_up();
      break;
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
      // if pasting, need to feed in 1 char at a time
      chars = key.replace(/\r/g, "\n").split("");
      for (c of chars)
        input.insert(c);
      break;
  }

  input.put(); 
}

function handle_input() {
  let s = input.value();
  if (s === "")
    return;
  if (!client.editing() && s.startsWith(command_prefix)) {
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
  let number;
  let new_tab;
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
    case "tc":
    case "tab-channel":
      new_tab = cmd[0] === "t";
      client.view_channel(arg, undefined, new_tab);
      break;
    case "s":
    case "server":
    case "t":
    case "tab-server":
      new_tab = cmd[0] === "t";
      server_query = arg.split(" ")[0];
      channel_query = arg.split(" ")[1];
      if (channel_query === undefined)
        channel_query = "";
      client.view_server(server_query, channel_query, new_tab);
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
    case "e":
    case "edit":
       client.start_editing();
       break;
    case "dm":
    case "direct-message":
    case "tm":
    case "tab-message":
      new_tab = cmd[0] === "t";
      client.view_direct_messages(arg, new_tab);
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
    case "x":
    case "close":
      number = parseInt(arg.split(" ")[0]);
      if (isNaN(number))
        number = undefined;
      client.close(number);
      break;
    case "g":
    case "goto":
      number = parseInt(arg.split(" ")[0]);
      if (isNaN(number))
        number = undefined;
      client.switch_to(number);
      break;
    case "sv":
    case "save":
      client.save_tabs();
      break;
    case "h":
    case "help":
      println(fs.readFileSync("help.md"));
      break;
    default:
      number = parseInt(cmd);
      if (isNaN(number))
        println("Unknown command '" + cmd + "'.");
      else
        client.switch_to(number);
      break;
  }

  client.print_tabs();
}
