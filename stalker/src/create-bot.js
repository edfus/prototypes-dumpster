import oicq from "oicq";
const { createClient } = oicq;

import { InputAgent } from "./input-agent.js";

const inputAgent = new InputAgent();

export function createBot (credentials) {
  // account
  const uin = credentials.uin;

  const bot = createClient(uin, {
    log_level: "debug",
    platform: 1,        // Login device: Android phone
    ignore_self: true
  });

  const master = Number(credentials.master);
  const notifyMaster = async message => {
    if(master) {
      return bot.sendPrivateMsg(master, message);
    }
  }

  // slider CAPTCHA ticket
  bot.on(
    "system.login.slider",
    url => inputAgent.readline().then(
      input => bot.sliderLogin(input)
    )
  );

  // Device lock
  bot.on("system.login.device", async (url, phone) => {
    await inputAgent.prompt("Press Enter to continue once this device is unlocked.");
    bot.sendSMSCode();
    const code = await inputAgent.readline();
    if(code) {
      bot.submitSMSCode(code);
    } else {
      bot.login(credentials.password_md5);
    }
  });

  bot.on("request.friend.add", async data => {
    const result = await bot.setFriendAddRequest(data.flag);
    if(result.status !== "ok") {
      return bot.logger.error(`Confirm friend request ${data.flag} failed`, data, result);
    }

    bot.logger.info("Confirmed friend request with", data);
    await notifyMaster("Confirmed friend request with ".concat(JSON.stringify(data, null, 4)));
    await bot.sendPrivateMsg(data.user_id, "Hi dude, let's do a circle jerk at the sperm bank someday!");
  });

  bot.on("request.group.invite", async data => {
    const result = await bot.setGroupAddRequest(data.flag);
    if(result.status !== "ok") {
      return bot.logger.error(`Confirm group invitation ${data.flag} failed`, data, result);
    }

    bot.logger.info("Confirmed group invitation with", data);
    await notifyMaster("Confirmed group invitation with ".concat(JSON.stringify(data, null, 4)));
    await bot.sendGroupMsg(data.group_id, "Hello ladies!");
  });

  return bot;
}