import App from "./src/app.js";
import credentials from "./secrets/credentials.js";
import basicInfo from "./secrets/basic-info.js";
import { createBot } from "./src/create-bot.js";
import { loadPlugins } from "./src/load-plugins.js";

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
  process.once("uncaughtException", () => bot.logout());

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

  process.stdin.on("data", async data => {
    if(/(--)?reload|-r/i.test(data.toString().trim())) {
      console.info("Reloading plugins...");
      bot.removeListener("message", callback);

      callback = app.callback(bot, await loadPlugins(pluginsPath, true));
      bot.on("message", callback);
      console.info("Reloaded");
    }
  });

  process.once("SIGINT", () => process.stdin.unref());
})();
