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

const environment = "production";

class App extends EventEmitter {
  context = {
    app: this,
    throw(error, status) {
      const err = (
        error instanceof Error 
        ? error
        : new Error(error)
      );

      error.expose = true;

      if(status) {
        error.status = status;
      }

      throw err;
    },
    assert(shouldBeTruthy, error) {
      if (!shouldBeTruthy) {
        this.throw(error);
      }
    },
    environment,
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
        /[nN](o|ope)?|teehee|。{1,6}|waht|[fF]|OwO|👎|💩|[#$%^~fuck]{6}/
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

    const middlewares = plugins.map(p => p.middleware);
    const pluginCommands = (
      plugins.filter(p => Boolean(p.command))
             .map(p => ({
               plugin: p.name,
               command: p.command,
               filepath: p.filepath,
             }))
    );

    return async (qqData, type) => {
      const respondToClient = async message => {
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

      try {
        const ctx = {
          ...this.context,
          ...parseCommand(qqData),
          data: qqData, from: type,
          state: { 
            
          },
          bot,
          pluginCommands,
          respond: respondToClient
        };
  
        let index = 0;
        const next = async () => {
          if (index >= middlewares.length)
            return;
          return middlewares[index++](ctx, next);
        };

        await next();
      } catch (err) {
        this.emit("error", err);
        if(environment === "test") {
          return respondToClient(err);
        }
        if (err.expose) {
          return respondToClient(err.message);
        } else {
          return respondToClient(err.status || "Having an existential crisis right now, go eat your boots!");
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
  
      bot.login(credentials.password_md5 || credentials.password);

      return bot;
    } catch (err) {
      this.emit("error", err);
      return bot;
    }
  }
}

export default App;