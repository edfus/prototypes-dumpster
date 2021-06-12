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

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { containerBootstrap } = require('@nlpjs/core');
const { NluManager, NluNeural } = require('@nlpjs/nlu');
const { LangEn } = require('@nlpjs/lang-en-min');

class Context {
  constructor (baseContext) {
    for (const key of Object.getOwnPropertyNames(Context.prototype)) {
      if(typeof Context.prototype[key] === "function") {
        if(key.startsWith("__")) {
          this[key.replace(/^_+/, "")] = Context.prototype[key].bind(this, this);
        } else if(key.startsWith("_")) {
          this[key.replace(/^_+/, "")] = Context.prototype[key].bind(this);
        }
      }
    }

    return Object.assign(this, baseContext);
  }

  _toImage (image) {
    return oicq.segment.image(image);
  }

  async __send (context, message, auto_escape) {
    const reportInfo = { 
      type: context.from, 
      id:  context.from === "private" ? context.senderID : context.groupID, 
      msg: message,
      plugin: context.plugins[context.state.middlewareIndex]?.name
    };

    context.app.emit("respond", context, reportInfo);

    switch (context.from) {
      case "private":
        return context.bot.sendPrivateMsg(context.senderID, message, auto_escape);
      default: // group
        return context.bot.sendGroupMsg(context.groupID, message, auto_escape);
    }
  }

  async _respond (message) {
    const strMessage = (
      typeof message === "string"
        ? message
        : inspect(message)
    );

    return this.send(strMessage, false);
  };

  async __atAndRespond (context, toAt, body) {
    if(!Array.isArray(toAt)) {
      toAt = [ toAt ];
    }
  
    if(context.from === "private") {
      return this.send(body, false);
    }

    return this.send([
      ...toAt.map(atObj => oicq.segment.at(atObj.qq, atObj.text)),
      oicq.segment.text(body.replace(/^([^\s])/, " $1"))
    ]);
  };

  async _sendImage (image) {
    return this.send(this.toImage(image));
  };

  async __reply (context, message) {
    if(!Array.isArray(message)) {
      if(typeof message === "string") {
        message = [oicq.segment.text(message)];
      } else {
        message = [oicq.segment.text(message)];
      }
    } else {
      message = message.map(
        m => {
          if(typeof m === "string") {
            return oicq.segment.text(m);
          }
          return m;
        }
      );
    }
    return this.send([
      oicq.segment.reply(context.data.message_id),
      ...message
    ]);
  };
}

class App extends EventEmitter {
  context = {
    app: this,
    nlp: {
      container: null,
      loaded: false,
      loadPromise: null
    },
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
      if(typeof value?.gen === "function") {
        return value.gen();
      }

      if(Array.isArray(value)) {
        const got = value[Math.floor(value.length * Math.random())];
        return typeof got?.gen === "function" ? got.gen() : got;
      }

      return String(value || "");
    },
    reactions: {
      reject: new RandExp(
        /[nN](o|ope|ah)?|teehee|。{1,6}|waht|[fF]|OwO|👎|👀|💩|[#$%^~fuck]{6}/
      ),
      accept: new RandExp(
        /[0oOk]?k|»{1,9}|oh{1,7}|[oO]kay|cool\.|not bad|fair/
      ),
      fooled: new RandExp(
        /FUCK YOU|DON'T STALK ME|I HATE TROLLING/
      ),
      junk: [
        "useless", "pointless", "futile", "awkward",
        "junk", "trollishly poor quality", "cringy",
        new RandExp(/-?[0123]\/10 for spamming me/),
        new RandExp(
          /stop being a (creep|shitposter|dipstick|dunce|jackass|menace)/
        ),
        new RandExp(
          /stop (shitposting|trashposting|cringing) pls/
        ),
        "perfect substitute for toilet paper"
      ],
      penisInsult: (() => {
        const penis = new RandExp(/[ℙ][ℇ℮ℯℰⅇ][ℕ№][iℹ℩ⅈ]s|[ⅅⅆ⅁][ℹ️ℹ℩ⅈ][ℂ℃℄]K/i);
        penis.defaultRange.add(0, 65535);
        
        const emphasizeAdv = new RandExp(/(pathetically |inordinately )?/);
        const sadVerb = new RandExp(/hurt|feel sad|feel such pain/);
        const suicide = new RandExp(/committed suicide|died by suicide|died of humiliation/);
        const small = new RandExp(/small|tiny/);
        const too = new RandExp(/to{2,5}/);
        const parts = [
          { 
            start: () => "Isn't your",
            end:   () =>`${emphasizeAdv.gen()}${too.gen()} small?` 
          },
          { 
            start: () =>`You joking me?? How can one with such a ${small.gen()}`,
            end:   () =>`haven't ${suicide.gen()}` 
          },
          { 
            start: () => `I ${sadVerb.gen()} for your ${small.gen()}`,
            end:   () =>`size` 
          }
        ];

        const insult = () => {
          const part = parts[Math.floor(Math.random() * parts.length)];
          return `${part.start()} ${penis.gen()} ${part.end()}`;
        };

        return {
          gen: insult
        };
      })(),
    }
  };

  constructor () {
    super();
    this.context.nlp.loadPromise = (async () => {
      const container = await containerBootstrap();
      container.use(NluNeural);
      container.use(LangEn);
   
      this.context.nlp.container = container;
      this.context.nlp.loaded = true;
    })();
  }

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

    const nlu = {
      manager: null,
      trained: false,
      domains: [],
      actual: null
    };

    const manageAndTrain = async () => {
      nlu.manager = new NluManager(
        { 
          container: this.context.nlp.container,
          locales: ['en'],
          trainByDomain: false
        }
      );

      for (const { nlu: pluginNlu } of pluginsMeta) {
        if(typeof pluginNlu?.train === "function") {
          await pluginNlu.train(nlu.manager, this.context);
          if(Array.isArray(pluginNlu.domains)) {
            nlu.domains = nlu.domains.concat(pluginNlu.domains);
          }
          if(pluginNlu.domain) {
            nlu.domains.push(pluginNlu.domain);
          }
        }
      }
      await nlu.manager.train();
      nlu.trained = true;
    };

    if(this.context.nlp.loaded) {
      manageAndTrain();
    } else {
      this.context.nlp.loadPromise.then(manageAndTrain);
    }

    return async qqData => {
      let middlewareIndex = 0;

      const parsedContext = parseCommand(qqData);

      if(nlu.trained) {
        if(parsedContext.commandText) {
          nlu.actual = await nlu.manager.process(parsedContext.commandText);
        } else {
          nlu.actual = {
            locale: 'en',
            utterance: '',
            domain: 'None',
            languageGuessed: true,
            localeIso2: 'en',
            language: 'English',
            nluAnswer: {
              classifications: [],
              entities: undefined,
              explanation: undefined
            },
            classifications: [],
            intent: 'None',
            score: 0
          };
        }
      } 

      const ctx = new Context({
        ...this.context,
        ...parsedContext,
        nlu,
        data: qqData, from: qqData.message_type,
        state: {},
        bot,
        plugins: pluginsMeta
      });

      try {
        const next = async () => {
          if (middlewareIndex >= middlewares.length)
            return ;
          ctx.state.middlewareIndex = middlewareIndex;
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
            await ctx.respond(err);
          } else if (err.expose && !err.message.toString().match(/[\u3400-\u9FBF]/)) {
            await ctx.respond(err.message);
          } else {
            await ctx.respond(err.status || "Having an existential crisis right now, go eat your boots!");
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