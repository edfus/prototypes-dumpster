const commandPattern = /^who\s*am\s*i\s*$/i;

export const command = commandPattern.source;

export default async function (ctx, next) {
  if(ctx.from !== "private" && !ctx["@me"]) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    const title = ctx.sender.title || ctx.sender.card;

    return ctx.respond([
      ctx.sender.nickname.concat?.(title ? ` the ${title}` : ""),
      ctx.sender.sex !== "unknown" && ctx.sender.sex,
      ctx.sender.age && `${ctx.sender.age} years old`,
      ctx.sender.area !== "unknown" && `living in ${ctx.sender.area}`,
      ctx.sender.level && `with a level of ${"💩".repeat(parseInt(ctx.sender.level))}`,
      ["admin", "owner"].includes(ctx.sender.role)
      ? `and is the ${ctx.sender.role}`
      : [
        "pooping three times a day",
        "suffering from ureter stones",
        "jerking off every four hours"
      ][Math.floor(Math.random() * 3)]
    ].filter(Boolean).join(", ").concat("."), false);
  }

  return next();
}