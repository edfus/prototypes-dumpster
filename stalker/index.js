import App from "./src/app.js";
import credentials from "./secrets/credentials.js";
import basicInfo from "./secrets/basic-info.js";
import { createBot } from "./src/create-bot.js";
import { loadPlugins } from "./src/load-plugins.js";
import { InputAgent } from "./src/input-agent.js";

import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginsPath = join(__dirname, "./plugins");

const setBasicInfo = false;

(async () => {
  const app = new App();
  const bot = createBot(credentials);

  process.once("SIGINT", () => bot.logout());
  process.once("SIGTERM", () => bot.logout());
  // process.once("uncaughtException", () => bot.logout());

  bot.once("system.online", () => {
    bot.setOnlineStatus(70); // do not disturb
    if(setBasicInfo) {
      bot.setNickname(basicInfo.nickname);
      bot.setPortrait(basicInfo.avatar);
      bot.setSignature(basicInfo.signature);
    }
  });

  let callback = app.callback(bot, await loadPlugins(pluginsPath));

  bot.on("message", callback)
     .login(credentials.password_md5 || credentials.password)
  ;

  const inputAgent = new InputAgent();

  inputAgent.prefix = "> ";

  inputAgent.use(async (ctx, next) => {
    const data = ctx.input.trim();
    if(/(--)?reload|-r/i.test(data)) {
      ctx.agent.respond("Reloading plugins...");
      bot.removeListener("message", callback);

      callback = app.callback(bot, await loadPlugins(pluginsPath, true));
      bot.on("message", callback);
      ctx.agent.respond("Reloaded");
      return ;
    }

    return next();
  });

  inputAgent.use((ctx, next) => {
    const data = ctx.input.trim();
    if(/(--)?login|-l/i.test(data)) {
      ctx.agent.respond("Login...");
      return bot.login(credentials.password_md5 || credentials.password);
    }

    return next();
  });

  inputAgent.listen();
})();
