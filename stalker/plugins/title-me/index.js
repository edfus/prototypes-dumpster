const commandPattern = /^title\s*me\s+/i;

export const command = commandPattern.source.concat("< new title >");

export default async function (ctx, next) {
  if(ctx.from !== "group" || !ctx["@me"]) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    const title = ctx.commandText.replace(commandPattern, "");
    if(!title || title.length > 40) {
      return ctx.respond("pardon?");
    }

    await ctx.respond(ctx.getReaction("accept"));
    try {
      await ctx.bot.setGroupSpecialTitle(ctx.groupID, ctx.senderID, title);
    } catch (err) {
      return ctx.respond("but can't");
    }
    return ;
  }

  return next();
}