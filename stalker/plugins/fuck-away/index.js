const commandPattern = /^fuck\s*away\s*$/i;

export const command = commandPattern.source;

export default async function (ctx, next) {
  if(ctx.from !== "group" || !ctx["@me"]) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    await ctx.respond(ctx.getReaction("accept"));
    try {
      await ctx.bot.setGroupLeave(ctx.groupID, true);
    } catch (err) {
      ctx.app.emit("error", err, ctx);
      try {
        await ctx.bot.setGroupLeave(ctx.groupID, false);
      } catch (err) {
        ctx.app.emit("error", err, ctx);
        await ctx.respond("But can't");
      }
    }
    return ;
  }

  return next();
}