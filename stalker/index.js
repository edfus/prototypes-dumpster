import App from "./src/app.js";
import { createBot } from "./src/create-bot.js";
import { loadPlugins } from "./src/load-plugins.js";
import { InputAgent } from "./src/input-agent.js";

import { dirname, join } from "path";
import { fileURLToPath } from "url";

import RateLimiter from "async-ratelimiter";
import Redis from "ioredis";

import { inspect } from "util";
import { createServer } from "http";
import { pipeline, Writable } from "stream";

import log4js from "log4js";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginsPath = join(__dirname, "./plugins");

const inputAgent = new InputAgent();

const env = {
  STALKER_BASIC_INFO_PATH: process.env["STALKER_BASIC_INFO_PATH"],
  STALKER_CREDENTIALS_PATH: process.env["STALKER_CREDENTIALS_PATH"],
  STALKER_NOTIFY_PORT: process.env["STALKER_NOTIFY_PORT"],
  STALKER_SET_BASIC_INFO: process.env["STALKER_SET_BASIC_INFO"],
  REDIS_PORT: process.env["REDIS_PORT"],
  REDIS_HOSTNAME: process.env["REDIS_HOSTNAME"],
  REDIS_PASSWORD: process.env["REDIS_PASSWORD"]
};

log4js.addLayout('json', config => {
  return logEvent => {
    if(logEvent && typeof logEvent === "object") {
      if(logEvent.startTime) {
        logEvent.timestamp = new Date().toLocaleString(
          "en-US", { timeZone: "Asia/Shanghai" }
        );
        delete logEvent.startTime;
      }
      if(logEvent.categoryName) {
        logEvent.name = logEvent.categoryName;
        delete logEvent.categoryName;
      }
      if(logEvent.level && typeof logEvent.level === "object") {
        logEvent.level = logEvent.levelStr?.toLowerCase?.();
      }
      if(logEvent.context && typeof logEvent.context === "object") {
        let isEmpty = true;
        for (const key in logEvent.context) {
          isEmpty = true;
          break;
        }
        if(isEmpty) {
          delete logEvent.context;
        }
      }
    }

    const json = JSON.stringify(logEvent).replace(/\d{6,}/g, inputAgent.mask);

    return json.concat(config.separator);
  };
});

log4js.configure({
  appenders: {
    out: { type: 'stdout', layout: { type: 'json', separator: '' } }
  },
  categories: {
    default: { appenders: ['out'], level: 'info' }
  }
});

let setBasicInfo = (
  env["STALKER_SET_BASIC_INFO"] === undefined
  ? true : ["true", "0"].includes(env["STALKER_SET_BASIC_INFO"])
);

;(async () => {
  const app = new App();

  let basicInfo, credentials;
  try {
    credentials = (await import(
      env["STALKER_CREDENTIALS_PATH"] || "./secrets/credentials.js"
    )).default;
  } catch (err) {
    log4js.getLogger(`app-stalker-loader`).warn(`Loading credentials ${
      env["STALKER_CREDENTIALS_PATH"] || "./secrets/credentials.js"
    } failed with error ${err.message}`);
    credentials = {};
    credentials.uin = (
      await inputAgent.question("Enter the qq id of the bot: ")
    );
    credentials.password_md5 = (
      await inputAgent.question("Enter the MD5ed password in hex: ")
    );
    credentials.master = (
      await inputAgent.question("The master account to be binded: ")
    );
  }

  try {
    basicInfo = (await import(
      env["STALKER_BASIC_INFO_PATH"] || "./secrets/basic-info.js"
    )).default;
  } catch (err) {
    log4js.getLogger(`app-stalker-loader`).warn(`Loading basicInfo ${
      env["STALKER_BASIC_INFO_PATH"] || "./secrets/basic-info.js"
    } failed with error ${err.message}`);
    basicInfo = {};
    setBasicInfo = false;
  }

  const bot = createBot(credentials);

  const botId = createHash("sha1").update(
    String(credentials.uin)
  ).digest("base64").slice(0, 6);

  bot.logger = log4js.getLogger(`OICQ-S-A-${botId}`);
  inputAgent.logger = log4js.getLogger(`app-stalker-${botId}`);

  process.once("SIGINT", () => bot.logout());
  process.once("SIGTERM", () => bot.logout());

  const master = Number(credentials.master);
  const masterId = createHash("sha1").update(
    String(master)
  ).digest("base64").slice(0, 6);
  const notifyMaster = async message => {
    if(master) {
      try {
        await bot.sendPrivateMsg(master, "[meta] ".concat(message));
      } catch (err) {
        return inputAgent.logger.error(
          `sending message to master ${masterId} failed with`, err
        );
      }
      
      return inputAgent.logger.info(`sent message to master ${masterId}`);
    }

    return inputAgent.logger.warn(`master not binded, sending`, message, "failed");
  };

  const setStatus = async () => {
    await bot.setOnlineStatus(70); // do not disturb
    if(setBasicInfo) {
      basicInfo.nickname && await bot.setNickname(basicInfo.nickname);
      basicInfo.avatar && await bot.setPortrait(basicInfo.avatar);
      basicInfo.signature && await bot.setSignature(basicInfo.signature);
    }

    return inputAgent.logger.info(`status set successfully.`);
  };

  let retriedCount = 0, lastReport = 0;
  bot.on("system.online", async () => {
    inputAgent.logger.info(`back online.`);
    await setStatus();

    if(lastReport < retriedCount) {
      await notifyMaster(
        `[system] just recovered from a panic attack, which took ${
          retriedCount - lastReport
        } retries.`
      );
      lastReport = retriedCount;
    }
  });

  bot.on("system.offline", async () => {
    setTimeout(() => {
      bot.login(credentials.password_md5);
    }, 10000).unref();
    return inputAgent.logger.warn(`bot.system.offline #${++retriedCount}`);
  });

  const mask = inputAgent.mask;

  app.prepend({
    meta: {
      name: "performance-measurement"
    },
    middleware: async (ctx, next) => {
      const timeStart = Date.now();
      await next();
      const timeEnd = Date.now();

      if(timeEnd - timeStart > 600) {
        const toBeReported = [
          `Answering ${ctx.from} message to`,
          `[${ctx.sender.nickname} ${mask(ctx.sender.user_id)} ${ctx.sender.role}]`,
          `costed ${(timeEnd - timeStart) / 1000}s`
        ];
        inputAgent.logger.warn(toBeReported);
        await notifyMaster(`[warn] ${toBeReported.join(" ")}`);
      }
    }
  });

  if(env["REDIS_PORT"]) {  
    const redis  = new Redis(
      Number(env["REDIS_PORT"]),
      env["REDIS_HOSTNAME"] || "localhost",
      {
        password: env["REDIS_PASSWORD"]
      }
    );
    
    const limitDuration = 60000; // 1 minute
    const rateLimiter = new RateLimiter({
      db: redis,
      max: 60,
      duration: limitDuration,
      namespace: "limit-bot-messaging"
    });
    
    const globalLimit = {
      totoal: 120,
      remaining: 120,
      duration: 80000,
      reported: false,
      lastReset: Date.now()
    };

    const rateLimited = new Map();
    
    setInterval(() => {
      const now = Date.now();
      if(now - globalLimit.lastReset >= globalLimit.duration) {
        globalLimit.remaining = globalLimit.totoal;
        globalLimit.reported  = false;
        globalLimit.lastReset = now;
      }
      
      for (const [id, lastReset] of rateLimited.entries()) {
        if(now - lastReset >= limitDuration) {
          rateLimited.delete(id);
        }
      }
    }, limitDuration / 2).unref();

    app.on("respond", async (ctx, info) => {
      if(--globalLimit.remaining < 0) {
        globalLimit.remaining = 0;
      }
      ctx.from === "private"
        ? await rateLimiter.get({ id: ctx.senderID, max: 20, decrease: true })
        : await rateLimiter.get({ id: ctx.groupID, decrease: true })
      ;
    });

    app.prepend({
      meta: {
        name: "rate-limit"
      },
      middleware: async (ctx, next) => {
        if(!globalLimit.remaining) {
          if(globalLimit.reported) {
            return ;
          } else {
            await notifyMaster(
              `[warn] global ${globalLimit.totoal} rate-limit reached.`
            );
            inputAgent.logger.warn(`global ${globalLimit.totoal} rate-limit reached.`);
            globalLimit.reported = true;
            await ctx.bot.setOnlineStatus(31); // away
          }
        }

        const id = ctx.from === "private" ? ctx.senderID : ctx.groupID;
        if(rateLimited.has(id)) {
          return ;
        }

        const limit = (
          ctx.from === "private"
            ? await rateLimiter.get({ id: id, max: 20, decrease: false })
            : await rateLimiter.get({ id: id, decrease: false })
        );

        if(!limit.remaining && !rateLimited.has(id)) { // lock
          rateLimited.set(id, Date.now());
          const toWarn = `rate-limit reached for ${ctx.from}-${id}-${
            ctx.groupName || ctx.sender.nickname
          }`;
          inputAgent.logger.warn(toWarn);
          await notifyMaster(`[warn] ${toWarn}`);
          return ctx.respond("Ratelimited, staying low for a while, cya");
        }

        return next();
      }
    });
  }

  if(env["STALKER_NOTIFY_PORT"]) {
    createServer(async (req, res) => {
      if(req.method !== "PUT") {
        return res.writeHead(405).end();
      }
      
      const toSend = [];
      try {
        let length = 0;
        const textDecoder = new TextDecoder();
        await new Promise((resolve, reject) => {
          pipeline(
            req,
            new Writable({
              write(chunk, enc, cb) {
                const part = textDecoder.decode(chunk, { stream: true });
                length += part.length;
                if(length > 500) {
                  inputAgent.logger.warn(
                    "notifier posted a message",
                    message.slice(0, 50).concat("..."),
                    "with a length more than 500",
                    {
                      headers: req.rawHeaders,
                      ip: req.headers["x-forwarded-for"],
                      host: req.headers["x-forwarded-host"],
                      proto: req.headers["x-forwarded-proto"],
                      uuid: req.headers["x-request-id"]
                    }
                  );
                  return cb(new Error("Length too long"));
                }
                toSend.push(part);
                return cb();
              },
              final (cb) {
                const lastPart = textDecoder.decode();
                toSend.push(lastPart);
                return cb();
              }
            }),
            err => err ? reject(err) : resolve()
          )
        });

        const message = toSend.join("");
        if(master) {
          await bot.sendPrivateMsg(master, "[notify] ".concat(message));;
          inputAgent.logger.info(
            `Notified master about '${
              message.length > 50 ? message.slice(0, 50).concat("...") : message
            }'.`, {
              ip: req.headers["x-forwarded-for"],
              host: req.headers["x-forwarded-host"],
              uuid: req.headers["x-request-id"]
            }
          );
        } else {
          inputAgent.logger.warn(
            `master not binded, sending`,
            message.length > 50 ? message.slice(0, 50).concat("...") : message,
            "failed", {
              ip: req.headers["x-forwarded-for"],
              host: req.headers["x-forwarded-host"],
              uuid: req.headers["x-request-id"]
            }
          );
          throw new Error("An orphan, I am");
        }
      } catch (err) {
        return res.writeHead(400).end(err.message);
      }

      return res.writeHead(200).end("ok");
    }).listen(Number(env["STALKER_NOTIFY_PORT"]), () => {
      inputAgent.logger.info(
        `Server is running at http://0.0.0.0:${env["STALKER_NOTIFY_PORT"]}`
      );
    });
  }

  app.on("respond", async (ctx, info) => {
    if(info.msg.length >= 40) {
      info.msg = info.msg.slice(0, 40).concat("...");
    }

    inputAgent.logger.info(
      [
        "Responding",
        info.type === "private" ? "to" : "in group",
        mask(info.id).concat(":"),
        info.msg,
        "<==>",
        `[served by '${info.plugin}']`
      ].join(" ")
    );
  });

  app.on("error", async err => {
    inputAgent.logger.error(err);
    await notifyMaster(`[error] ${inspect(err)}`);
  });

  let callback;
  const commandIdentified = "!command ";
  app.prepend(
    {
      meta: {
        name: "commands-4-master"
      },
      middleware: async (ctx, next) => {
        if(ctx.senderID === master && ctx.from === "private") {
          const command = ctx.commandText.trim();
          if(command.startsWith(commandIdentified)) {
            const cmd = command.slice(commandIdentified.length);
            if(/^[Rr]eload$/.test(cmd)) {
              inputAgent.logger.info("Reloading plugins as required by master...");
              bot.removeListener("message", callback);
        
              callback = app.callback(bot, await loadPlugins(pluginsPath, true));
              bot.on("message", callback); 
              return ctx.respond("[meta] reloaded");
            }
          }
        }
    
        return next();
      }
    }
  );

  callback = app.callback(bot, await loadPlugins(pluginsPath));

  bot.on("message", callback)
     .login(credentials.password_md5)
  ;
  
  inputAgent.use(async (ctx, next) => {
    const data = ctx.input.trim();
    if(/(--)?reload|-r/i.test(data)) {
      await ctx.agent.respond("Reloading plugins...");
      bot.removeListener("message", callback);

      callback = app.callback(bot, await loadPlugins(pluginsPath, true));
      bot.on("message", callback);
      await ctx.agent.respond("Reloaded");
      return ;
    }

    return next();
  });

  inputAgent.use(async (ctx, next) => {
    const data = ctx.input.trim();
    if(/(--)?login|-l/i.test(data)) {
      await ctx.agent.respond("Login...");
      return bot.login(credentials.password_md5);
    }

    return next();
  });
})().then(() => process.stdin.isTTY && inputAgent.listen());
