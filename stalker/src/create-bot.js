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
      if(code.toString()) {
        bot.submitSMSCode(code.toString());
      } else {
        bot.login(credentials.password_md5 || credentials.password);
      }
    });
  });

  bot.on("system.online", function () {
    console.info(`Logged in as ${this.nickname}!`);
  });

  bot.on("system.offline", function () {
    console.error(arguments);
  });

  bot.on("request.friend.add", async data => {
    const result = await bot.setFriendAddRequest(data.flag);
    if(result.status !== "ok") {
      return bot.logger.error(`Confirm friend request ${data.flag} failed`, data, result);
    }

    bot.logger.info("Confirmed friend request with", data);
    await bot.sendPrivateMsg(data.user_id, "Hey, dude, let's do a circle jerk at the sperm bank!");
  });

  bot.on("request.group.invite", async data => {
    const result = await bot.setGroupAddRequest(data.flag);
    if(result.status !== "ok") {
      return bot.logger.error(`Confirm group invitation ${data.flag} failed`, data, result);
    }

    bot.logger.info("Confirmed group invitation with", data);
    await bot.sendPrivateMsg(data.user_id, "Hello ladies!");
  });

  return bot;
}