import { streamEdit } from "stream-editor";
import { EventEmitter } from "events";
import { inspect } from "util";
import { PassThrough, Writable } from "stream";

class InputAgent extends EventEmitter {
  middlewares = [];
  styles = {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",

    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m",
  }

  constructor (stdin = process.stdin, stdout = process.stdout, stderr = process.stderr) {
    super();
    this.stdin  = stdin;
    this.stdout = stdout;
    this.stderr = stderr;
    this.prefix = "";

    const busy = () => {
      this.busy = true;
      this.emit("busy");
    }

    const free = () => {
      this.busy = false;
      this.emit("free");
    }

    this.on("reading", busy);
    this.on("userInput", free);
    this.on("writing", busy);
    this.on("agentAnswer", free);
  }

  prepend (middleware) {
    this.middlewares.unshift(middleware);
    return this;
  }

  use (middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  _checkIsColorEnabled (tty) {
    return (
      "FORCE_COLOR" in process.env
        ? [1, 2, 3, "", true, "1", "2", "3", "true"].includes(process.env.FORCE_COLOR)
        : !(
          "NO_COLOR" in process.env ||
          process.env.NODE_DISABLE_COLORS == 1 // using == by design
        ) && tty.isTTY
    );
  }

  style (str, style) {
    return `${style.split(/\s/).map(c => this.styles[c]).join("")}${str}\x1b[0m`;
  }

  _format (str, tty, style) {
    if(this._checkIsColorEnabled(tty)) {
      const ansiColors = style && (
        style.startsWith("\x1b")
          ? style
          : style.split(/\s/).map(c => this.styles[c]).join("")
      );
      return `${ansiColors || ""}${this.prefix}${str}\x1b[0m\n`;
    }
    return `${this.prefix}${str}\n`;
  }

  _convertToString (message) {
    return (
      typeof message === "string"
      ? message
      : inspect(message)
    );
  }

  async write (message, style) {
    this.emit("writing");

    if(Array.isArray(message)) {
      message = message.map(this._convertToString).join(" ");
    }

    const strMessage = this._convertToString(message);

    return new Promise((resolve, reject) => {     
      this.stdout.write(
        this._format(strMessage, this.stdout, style).replace(/\n$/, ""),
        err => err ? reject(err) : resolve(
          this.emit("agentAnswer", { name: "respond", message: strMessage })
        )
      );
    });
  }

  async respond (message, style) {
    this.emit("writing");

    if(Array.isArray(message)) {
      message = message.map(this._convertToString).join(" ");
    }

    const strMessage = this._convertToString(message);

    return new Promise((resolve, reject) => {     
      this.stdout.write(
        this._format(strMessage, this.stdout, style),
        err => err ? reject(err) : resolve(
          this.emit("agentAnswer", { name: "respond", message: strMessage })
        )
      );
    });
  }

  async warn (message, style = "yellow", emitWarning = false) {
    this.emit("writing");

    if(Array.isArray(message)) {
      message = message.map(this._convertToString).join(" ");
    }

    const strMessage = this._convertToString(message);

    if(emitWarning && this.stdout === process.stdout) {
      if(typeof process.emitWarning === "function") {
        const output = (
          message instanceof Error
            ? message
            : strMessage
        );
        process.emitWarning(output);
        return this.emit("agentAnswer", { name: "warn", message: output })
      }
    }

    return new Promise((resolve, reject) => {     
      this.stdout.write(
        this._format(strMessage, this.stdout, style),
        err => err ? reject(err) : resolve(
          this.emit("agentAnswer", { name: "warn", message: strMessage })
        )
      );
    });
  }

  async throw (err, style = "red") {
    this.emit("writing");

    if(Array.isArray(err)) {
      err = err.map(this._convertToString).join(" ");
    }

    const error = (
      err instanceof Error
        ? err
        : new Error(err)
    );

    let message = error.stack || error.message;
    if(message.includes("\n")) {
      message = message.replace(
        /.*\n/,
        match => this._format(match.replace(/\r?\n$/, ""), this.stderr, style)
      );
    } else {
      message = this._format(message, this.stderr, style)
    }

    if(!message.endsWith("\n"))
      message = message.concat("\n");

    return new Promise((resolve, reject) => {     
      this.stderr.write(message, err => err ? reject(err) : resolve(
        this.emit("agentAnswer", { name: "throw", message })
      ));
    });
  }

  callback () {
    if (!this.listenerCount('error')) {
      this.respond(
        [
          "InputAgent: No listener attached for 'error' event,",
          "forwarding all errors to console..."
        ].join(" "), 
        "bright black" 
      );
      this.on('error', this.throw.bind(this));
    }

    return async string => {
      const ctx = {
        input: string,
        state: {},
        agent: this
      };

      let index = 0;
      const next = async () => {
        if(index >= this.middlewares.length)
          return ;
        return this.middlewares[index++](ctx, next);
      };

      let answered = false;
      const listener = () => {
        answered = true;
        this.removeListener("agentAnswer", listener);
      };

      this.emit("userInput", string);
      this.prependOnceListener("agentAnswer", listener);

      try {
        await next();
      } catch (err) {
        if(err.expose) {
          this.respond(err.message);
        }
        this.emit("error", err);
      } finally {
        if(!answered) {
          listener();
          this.respond(`unrecognized input: '${string}' (..)`);
        }
      }
    };
  }

  listen () {
    this.emit("reading");
    const callback = this.callback();

    streamEdit({
      from: this.stdin,
      to: new Writable({
        write: (chunk, encoding, cb) => cb()
      }),
      separator: /[\r\n]+/,
      search: /[^\r\n]+/,
      replacement: callback
    });

    if(this.stdin === process.stdin && !process.listenerCount("SIGINT")) {
      this.respond(
        [
          "InputAgent: No listener attached for 'SIGINT' event,",
          "binding default handler..."
        ].join(" "),
        "bright black"
      );

      process.on("SIGINT", () => this.stdin.unref());
    }

    return this.stdin;
  }

  async readline () {
    this.emit("reading");
    const stdin = this.stdin;
    const passThrough = new PassThrough();
    
    stdin.pipe(passThrough);

    return new Promise((resolve, reject) => {
      const interruptHandler = () => {
        stdin.unref();
        stdin.unpipe(passThrough);
        reject("Keyboard Interrupt");
      };

      if(stdin === process.stdin)
        process.once("SIGINT", interruptHandler);

      streamEdit({
        from: passThrough,
        to: new Writable({
          write: (chunk, encoding, cb) => cb()
        }),
        separator: /(?=[\r\n])/,
        search: /.*/,
        replacement: string => {
          stdin.unpipe(passThrough);
          if(stdin === process.stdin)
            process.removeListener("SIGINT", interruptHandler);
          this.emit("userInput", string.trim());
          return resolve(string.trim());
        },
        limit: 1,
        truncate: true
      }).then(reject, reject);
    });
  }

  async prompt () {
    return this.respond.apply(this, arguments);
  }

  async info () {
    return this.respond.apply(this, arguments);
  }

  async question (message, style) {
    await this.prompt(message, style);
    return this.readline();
  }
}

export { InputAgent };