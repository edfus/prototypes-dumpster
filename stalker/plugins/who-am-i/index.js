const commandPattern = /^who\s*(am|is)\s*i\s*$/i;

export const command = commandPattern.source;

export default async function (ctx, next) {
  if(ctx.from !== "private" && !ctx["@me"]) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    await ctx.respond([
      ctx.sender.nickname,
      ctx.sender.title && `the ${ctx.sender.title}`,
      ctx.sender.age && `${ctx.sender.age} years old`,
      ctx.sender.sex,
      ctx.sender.area !== "unknown" && `living in ${ctx.sender.area}`,
      ctx.sender.level && `with a level of ${"💩".repeat(parseInt(ctx.sender.level))}`,
      ctx.sender.role && `and is the ${ctx.sender.role}`
    ].filter(Boolean).join(", ").concat("."), false);

    if(ctx.sender.card) {
      return ctx.respond(ctx.sender.card, false);
    } else {
      return ;
    }
  }

  return next();
}