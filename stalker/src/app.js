import { EventEmitter } from "events";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { inspect } from "util";

import { createBot } from "./create-bot.js";
import { loadPlugins } from "./load-plugins.js";
import { parseCommand } from "./parse-command.js";
import { functions } from "./one-bot-async-functions.js";

import RandExp from "randexp";
import oicq from "oicq";

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
        /[nN](o|ope|ah)?|teehee|。{1,6}|waht|[fF]|OwO|👎|💩|[#$%^~fuck]{6}/
      ),
      accept: new RandExp(
        /[0oOk]?k|»{1,9}|oh{1,7}/i
      ),
      fooled: new RandExp(
        /\?|DON'T STALK ME|I HATE TROLLING/
      )
    }
  };

  builtIn = {
    meta: [],
    middleware: []
  };

  prepend ({ meta, middleware }) {
    this.builtIn.meta.push(meta);
    this.builtIn.middleware.push(middleware);
    return this;
  }

  callback(bot, plugins) {
    if (!this.listenerCount('error')) {
      console.info(
        "\x1b[1m\x1b[30mNo listener attached for 'error' event,",
        "forwarding all errors to console...\x1b[0m"
      );
      this.on('error', console.error);
    }

    const middlewares = this.builtIn.middleware.concat(
      plugins.map(p => p.middleware)
    );
    const pluginsMeta = this.builtIn.meta.concat(
      plugins.map(p => p.meta)
    );

    bot = new Proxy(bot, {
      get(target, property, receiver) {
        const func = Reflect.get(target, property, receiver);
  
        if(
            typeof func === "function" &&
            functions.includes(property)
          ) {
          return new Proxy(func, {
            async apply (target, thisArg, argv) {
              const result = await func.apply(bot, argv);
  
              if(result.status === "failed") { // async, ok, failed
                const error = new Error(
                  result.error
                   ? result.error.message || inspect(result.error)
                   : `${result.retcode} ${result.status}`
                );
                error.raw  = inspect(result);
                error.argv = inspect(argv);
                error.func = func.name;
                throw error;
              }
  
              return result.data || result;
            }
          });
        }
  
        return func;
      }
    });
    
    return async (qqData) => {
      let middlewareIndex = 0;

      const type = qqData.message_type;
      const respond = async (message, auto_escape) => {
        const reportInfo = { 
          type, 
          id:  type === "private" ? qqData.user_id : qqData.group_id, 
          msg: message,
          plugin: pluginsMeta[middlewareIndex - 1]?.name
        };

        this.emit("respond", reportInfo);

        switch (type) {
          case "private":
            return bot.sendPrivateMsg(qqData.user_id, message, auto_escape);
          default: // group
            return bot.sendGroupMsg(qqData.group_id, message, auto_escape);
        }
      }

      const respondToClient = async message => {
        const strMessage = (
          typeof message === "string"
            ? message
            : inspect(message)
        );
  
        return respond(strMessage);
      };

      const atAndRespond = async (toAt, body) => {
        if(!Array.isArray(toAt)) {
          toAt = [ toAt ];
        }
      
        if(type === "private") {
          return respond(body);
        }

        return respond([
          ...toAt.map(atObj => oicq.segment.at(atObj.qq, atObj.text)),
          oicq.segment.text(body.replace(/^([^\s])/, " $1"))
        ]);
      };

      const sendImage = async image => {
        return respond(oicq.segment.image(image));
      };

      try {
        const ctx = {
          ...this.context,
          ...parseCommand(qqData),
          data: qqData, from: type,
          state: { 
            
          },
          bot,
          plugins: pluginsMeta,
          respond: respondToClient,
          atAndRespond,
          sendImage: sendImage
        };
  
        const next = async () => {
          if (middlewareIndex >= middlewares.length)
            return ;
          return middlewares[middlewareIndex++](ctx, next);
        };

        await next();
      } catch (err) {
        if(middlewareIndex >= 1) {
          err.meta = pluginsMeta[middlewareIndex - 1];
        }

        middlewareIndex = -1;
        
        this.emit("error", err);
        try {
          if(environment === "test") {
            await respondToClient(err);
          } else if (err.expose && !err.message.toString().match(/[\u3400-\u9FBF]/)) {
            await respondToClient(err.message);
          } else {
            await respondToClient(err.status || "Having an existential crisis right now, go eat your boots!");
          }
        } catch (error) {
          this.emit("error", { panic: "Report to client failed", error });
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

      bot.on("message", callback);
      bot.login(credentials.password_md5 || credentials.password);

      return bot;
    } catch (err) {
      this.emit("error", err);
      return bot;
    }
  }
}

export default App;