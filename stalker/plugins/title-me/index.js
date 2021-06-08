const commandPattern = /^title\s*me\s+/i;

export const command = commandPattern.source.concat("< new title >");

const trollers = new Map();

export default async function (ctx, next) {
  if(ctx.from !== "group" || !ctx["@me"]) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    const title = ctx.commandText.replace(commandPattern, "");
    if(!title || title.length > 30) {
      return ctx.respond("pardon?");
    }

    switch (ctx.sender.role) {
      case "owner":
        if(trollers.has(ctx.senderID)) {
          const trollHistory = trollers.get(ctx.senderID);
          const lastTroll = trollHistory.last;
          const dateNow = Date.now();

          trollHistory.last = dateNow;

          if(trollHistory.blocked) {
            return ctx.respond(ctx.getReaction("fooled"));
          }

          if(dateNow - lastTroll > 1000 * 60 * 60 * 24 * 10) {
            await ctx.respond("?... i'll give it a go anyway");
            try {
              await ctx.bot.setGroupCard(ctx.groupID, ctx.senderID, title);
              return trollHistory.delete(ctx.senderID);
            } catch (err) {
              trollHistory.times++;
              trollHistory.blocked = true;
              return ctx.respond("...and failed miserably");
            }
          }

          switch (trollHistory.times++) {
            case 1:
              return ctx.respond("ugh i cant bro");
            case 2:
              return ctx.respond("...");
            default:
              return ctx.respond(ctx.getReaction("fooled"));
          }
        } else {
          if(trollers.size > 50) {
            trollers.clear();
          }

          trollers.set(ctx.senderID, {
            times: 1,
            last: Date.now(),
            blocked: false
          });
        }
        return ctx.respond("i cant");
      default:
        break;
    }

    await ctx.respond(ctx.getReaction("accept"));
    try {
      await ctx.bot.setGroupCard(ctx.groupID, ctx.senderID, title);
    } catch (err) {
      return ctx.respond("but can't");
    }
    return ;
  }

  return next();
}