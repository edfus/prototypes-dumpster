const commandPattern = /^(set\s+a(nonymous)?|a(nonymous)?)\s+(on|off)?\s*$/i;

export const command = commandPattern.source;

export default async function (ctx, next) {
  if(ctx.from !== "group" || !ctx["@me"]) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    await ctx.respond(ctx.getReaction("accept"));
    try {
      if(/off/i.test(ctx.commandText)) {
        await ctx.bot.setGroupAnonymous(ctx.groupID, false);
      } else {
        await ctx.bot.setGroupAnonymous(ctx.groupID, true);
      }
    } catch (err) {
      return ctx.respond("but can't");
    }
    return ;
  }

  return next();
}