const banPattern = /^ban(\s|(?=me))/i;
const targerPattern = /^(me|ME)/;

export default function (ctx, next) {
  if(ctx.from !== "group") {
    return next();
  }

  if(banPattern.test(ctx.state.command)) {
    try {
      const commandContent = ctx.state.command.replace(banPattern, "").trim();
      if(!targerPattern.test(commandContent)) {
        return ctx.respond(ctx.getReaction("reject"));
      }

      const group_id = ctx.data.group_id;
      const user_id = ctx.data.user_id;
      const duration = parseInt(commandContent.replace(targerPattern, ""));

      return ctx.bot.setGroupBan(group_id, user_id, duration || 120);
    } catch (err) {
      err.expose = true;
      err.status = ctx.state.command;
      return ctx.throw(err);
    }
  }

  return next();
}