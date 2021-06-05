import { EventEmitter } from "events";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { inspect } from "util";

import { createBot } from "./create-bot.js";
import { loadPlugins } from "./load-plugins.js";
import { parseCommand } from "./parse-command.js";

import RandExp from "randexp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(__dirname, "..");
const pluginsPath = join(rootDirectory, "./plugins");

class App extends EventEmitter {
  context = {
    app: this,
    throw(status, message) {
      const err = new Error(message || status);
      err.status = status;
      err.expose = true;
      throw err;
    },
    assert(shouldBeTruthy, status, message) {
      if (!shouldBeTruthy) {
        this.throw(status, message);
      }
    },
    getReaction (name) {
      const value = this.reactions[name];
      if(value instanceof RandExp) {
        return value.gen();
      }

      if(Array.isArray(value)) {
        return value[parseInt(value.length * Math.random())] || "ඞ";
      }

      return String(value || "");
    },
    reactions: {
      reject: new RandExp(
        /[nN](o|ope)?|teehee|my (pp|\w{2,5}) goes b[rR]{3}|。{1,6}|waht|[fF]|OwO|👎|💩|[#$%^~fuck]{6}/
      ),
      accept: new RandExp(
        /[0oOk]?k|»{1,9}|oh{1,7}/i
      )
    }
  };

  callback(bot, plugins) {
    if (!this.listenerCount('error')) {
      console.info(
        "\x1b[1m\x1b[30mNo listener attached for 'error' event,",
        "forwarding all errors to console...\x1b[0m"
      );
      this.on('error', console.error);
    }

    const respondToClient = async (message) => {
      const strMessage = (
        typeof message === "string"
          ? message
          : inspect(message)
      );

      switch (type) {
        case "private":
          this.emit("respond", { type, id: qqData.user_id, msg: strMessage });
          return bot.sendPrivateMsg(qqData.user_id, strMessage);
        default: // group
          this.emit("respond", { type, id: qqData.group_id, msg: strMessage });
          return bot.sendGroupMsg(qqData.group_id, strMessage);
      }
    };

    const middlewares = plugins.map(p => p.middleware);

    return async (qqData, type) => {
      const ctx = {
        ...this.context,
        data: qqData, from: type,
        state: {
          command: parseCommand(qqData.message[0].type, qqData.raw_message),
          pluginCommands: (
            plugins.filter(p => Boolean(p.command))
                   .map(p => ({
                     plugin: p.name,
                     command: p.command,
                     filepath: p.filepath,
                   }))
          )
        },
        bot,
        respond: respondToClient
      };

      let index = 0;
      const next = async () => {
        if (index >= middlewares.length)
          return;
        return middlewares[index++](ctx, next);
      };

      try {
        await next();
      } catch (err) {
        this.emit("error", err);
        if (err.expose) {
          await respondToClient(err);
        } else {
          await respondToClient(err.status || "Having an existential crisis right now, go eat your boots!");
        }
      }
    };
  }

  async listen({ credentials, bot, plugins }) {
    if(!plugins) {
      plugins = await loadPlugins(pluginsPath);
    }

    if(!bot) {
      bot = createBot(credentials);
    }

    try {
      const callback = this.callback(bot, plugins);

      bot.on("message.private", data => callback(data, "private"));
      bot.on("message.group", data => callback(data, "group"));
  
      bot.login(credentials.password);

      return bot;
    } catch (err) {
      this.emit("error", err);
      return bot;
    }
  }
}

export default App;