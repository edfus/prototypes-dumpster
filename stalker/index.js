import App from "./src/app.js";
import { createBot } from "./src/create-bot.js";
import { loadPlugins } from "./src/load-plugins.js";
import { InputAgent } from "./src/input-agent.js";

import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginsPath = join(__dirname, "./plugins");

const inputAgent = new InputAgent();
inputAgent.prefix = "> ";

const env = {
  STALKER_BASIC_INFO_PATH: process.env["STALKER_BASIC_INFO_PATH"],
  STALKER_CREDENTIALS_PATH: process.env["STALKER_CREDENTIALS_PATH"],
  STALKER_NOTIFY_PORT: process.env["STALKER_NOTIFY_PORT"],
  STALKER_SET_BASIC_INFO: process.env["STALKER_SET_BASIC_INFO"],
};

const setBasicInfo = env["STALKER_SET_BASIC_INFO"] === "true";

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
  }

  let retriedCount = 0, lastReport = 0;
  bot.on("system.online", async () => {
    await bot.setOnlineStatus(70); // do not disturb
    if(setBasicInfo) {
      await bot.setNickname(basicInfo.nickname);
      await bot.setPortrait(basicInfo.avatar);
      await bot.setSignature(basicInfo.signature);
    }
    if(lastReport < retriedCount) {
      await notifyMaster(
        "[system] just recovered from a panic attack,"
      );
      await notifyMaster(
        `[system] after system retried ${retriedCount - lastReport} times.`
      );
      lastReport = retriedCount;
    }
  });

  bot.on("system.offline", async () => {
    setTimeout(() => {
      bot.login(credentials.password_md5);
    }, 10000).unref();
    await inputAgent.throw(
      `[${new Date().toString()}] bot.system.offline #${++retriedCount}`
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

  app.on("respond", async info => {
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

  let callback = app.callback(bot, await loadPlugins(pluginsPath));

  bot.on("message", callback)
     .login(credentials.password_md5)
  ;

  if(env["STALKER_NOTIFY_PORT"]) {
    
  } else {
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
