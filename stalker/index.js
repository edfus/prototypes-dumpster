import App from "./src/app.js";
import credentials from "./secrets/credentials.js";
import basicInfo from "./secrets/basic-info.js";

(async () => {
  const bot = await new App().listen({ credentials });

  process.once("SIGINT", () => bot.logout());
  process.once("SIGTERM", () => bot.logout());
  process.once("uncaughtException", () => bot.logout());

  bot.once("system.online", () => {
    bot.setOnlineStatus(70); // do not disturb
    // bot.setNickname(basicInfo.nickname);
    // bot.setPortrait(basicInfo.avatar);
    // bot.setSignature(basicInfo.signature);
  });
})();
