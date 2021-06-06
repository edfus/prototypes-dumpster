import Identicon from "identicon.js";
import { createHash } from "crypto";

const commandPattern = /^\s*(gen(erate)?\s+)?(avatar|identicon|icon)(\s+|\(|$)/;
export const command = commandPattern.source.concat(" [ input ]");

export default function (ctx, next) {
  if(ctx.from === "group" && !ctx.isAtMe) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    if(ctx.bot.canSendImage().status !== "ok") {
      return ctx.respond("Tencent image upload sucks");
    }

    return ctx.sendImage(
      "base64://".concat(
        new Identicon(
          createHash("sha1").update(
            ctx.commandText.replace(commandPattern, "") || String(Math.random())
          ).digest("hex"), 
          {
            size: 200,
            format: "png"
          }
        ).toString()
      )
    );
  }

  return next();
}