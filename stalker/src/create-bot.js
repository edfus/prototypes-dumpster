import oicq from "oicq";
const { createClient } = oicq;

export function createBot (credentials) {
  // account
  const uin = credentials.uin;

  const bot = createClient(uin, {
    log_level: "debug",
    platform: 1,        // Login device: Android phone
    ignore_self: true
  });

  // slider CAPTCHA ticket
  bot.on("system.login.slider", url => process.stdin.once("data", input => bot.sliderLogin(input)));

  // Device lock
  bot.on("system.login.device", (url, phone) => {
    console.info("Press Enter to continue once this device is unlocked.");
    bot.sendSMSCode();
    process.stdin.once("data", code => {
      if(code) {
        bot.submitSMSCode(code);
      } else {
        bot.login();
      }
    });
  });

  bot.on("system.online", function () {
    console.info(`Logged in as ${this.nickname}!`);
  });

  bot.on("system.offline", function () {
    console.error(arguments);
  });

  bot.on("request.friend.add", data => {
    bot.setFriendAddRequest(data.flag);
    bot.logger.info("Confirmed friend request with", data);
  });

  bot.on("request.group.invite", data => {
    bot.setGroupAddRequest(data.flag);
    bot.logger.info("Confirmed group invitation with", data);
  });

  return bot;
}