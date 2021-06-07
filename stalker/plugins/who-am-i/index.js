const commandPattern = /^who\s*(am|is)\s*i\s*$/i;

export const command = commandPattern.source;

export default async function (ctx, next) {
  if(ctx.from !== "group" || !ctx["@me"]) {
    return next();
  }

  if(ommandPattern.test(ctx.commandText)) {
    await ctx.respond([
     `${ctx.sender.nickname} the ${title}`,
      ctx.sender.sex,
      `${ctx.sender.age} years old`,
      `living in ${ctx.sender.area}`,
      `with a level of ${"💩".repeat(parseInt(ctx.sender.level) || 1)}`,
      `and is the ${ctx.sender.role}`
    ].join(", "), false);

    if(ctx.sender.card) {
      return ctx.respond(ctx.sender.card, false);
    } else {
      return ;
    }
  }

  return next();
}