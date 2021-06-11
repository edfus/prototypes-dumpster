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

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginsPath = join(__dirname, "./plugins");

const inputAgent = new InputAgent();
inputAgent.prefix = "> ";

const env = {
  STALKER_BASIC_INFO_PATH: process.env["STALKER_BASIC_INFO_PATH"],
  STALKER_CREDENTIALS_PATH: process.env["STALKER_CREDENTIALS_PATH"],
  STALKER_NOTIFY_PORT: process.env["STALKER_NOTIFY_PORT"],
  STALKER_SET_BASIC_INFO: process.env["STALKER_SET_BASIC_INFO"],
  REDIS_PORT: process.env["REDIS_PORT"],
  REDIS_HOSTNAME: process.env["REDIS_HOSTNAME"]
};

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
    basicInfo = (await import(
      env["STALKER_BASIC_INFO_PATH"] || "./secrets/basic-info.js"
    )).default;
  } catch (err) {
    basicInfo = {};
    credentials = {};
    setBasicInfo = false;
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

  const bot = createBot(credentials);

  process.once("SIGINT", () => bot.logout());
  process.once("SIGTERM", () => bot.logout());

  const master = Number(credentials.master);
  const notifyMaster = async message => {
    if(master) {
      return bot.sendPrivateMsg(master, "[meta] ".concat(message));
    }
  };

  const setStatus = async () => {
    await bot.setOnlineStatus(70); // do not disturb
    if(setBasicInfo) {
      basicInfo.nickname && await bot.setNickname(basicInfo.nickname);
      basicInfo.avatar && await bot.setPortrait(basicInfo.avatar);
      basicInfo.signature && await bot.setSignature(basicInfo.signature);
    }
  }

  let retriedCount = 0, lastReport = 0;
  bot.on("system.online", async () => {
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
    await inputAgent.throw(
      `[${new Date().toLocaleString()}] bot.system.offline #${++retriedCount}`
    );
  });

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
          `[${ctx.sender.nickname} ${ctx.sender.user_id} ${ctx.sender.role}]`,
          `costed ${(timeEnd - timeStart) / 1000}s`
        ];
        await inputAgent.warn(toBeReported);
        await notifyMaster(`[warn] ${toBeReported.join(" ")}`);
      }
    }
  });

  if(env["REDIS_PORT"]) {  
    const redis  = new Redis(Number(env["REDIS_PORT"]), env["REDIS_HOSTNAME"] || "localhost");
    
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

        if(!limit.remaining) {
          rateLimited.set(id, Date.now());
          await notifyMaster(
            `[warn] rate-limit reached for ${ctx.from}-${id}-${
              ctx.groupName || ctx.sender.nickname
            }`
          );
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

        if(master) {
          const message = toSend.join("");
          await bot.sendPrivateMsg(master, "[notify] ".concat(message));;
          await inputAgent.info(
            [
              `[${new Date().toLocaleString()}] Notified master about '${
                message.length > 50 ? message.slice(0, 50).concat("...") : message
              }'.`
            ],
            "yellow"
          );
        } else {
          throw new Error("An orphan, I am");
        }
      } catch (err) {
        return res.writeHead(400).end(err.message);
      }
      return res.writeHead(200).end("ok");
    }).listen(Number(env["STALKER_NOTIFY_PORT"]), () => {
      inputAgent.info(
        `Server is running at http://0.0.0.0:${env["STALKER_NOTIFY_PORT"]}`,
        "green"
      );
    });
  }

  app.on("respond", async (ctx, info) => {
    if(info.msg.length >= 40) {
      info.msg = info.msg.slice(0, 40).concat("...");
    }

    await inputAgent.info(
      [
        new Date().toLocaleString(),
        "Responding",
        info.type === "private" ? "to" : "in group",
        info.id
      ],
      "cyan"
    );

    await inputAgent.info(
      info.msg,
      "cyan"
    );

    await (
      info.plugin && inputAgent.info(
      `[ served by '${info.plugin}' ]`,
      "cyan"
      )
    );
  });

  app.on("error", async err => {
    err.time = new Date().toLocaleString();
    await inputAgent.throw(err);
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
              await inputAgent.prompt("Reloading plugins as required by master...");
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
})().then(() => inputAgent.listen());
