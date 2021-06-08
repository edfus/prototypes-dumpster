export const priority = 99;

const matchJ = /[一-龠]|[ぁ-ゔ]|[ァ-ヴー]|[々〆〤]/u;

export default async function (ctx, next) {
  if(ctx.from !== "private" && !ctx.isAtMe) {
    return next();
  }

  if(ctx.commandText.length < 25 && ctx.commandText.length > 3) {
    const spaceCount = ctx.commandText.split(/\s/).length;
    const japaneseCharCount = ctx.commandText.split(matchJ).length;
    if(japaneseCharCount >= 2 && spaceCount < japaneseCharCount) {
      return ctx.respond(ctx.commandText);
    }

    if(spaceCount === 0) {
      return ctx.respond(ctx.commandText);
    }
  } else if(ctx.commandText.length > 100) {
    const spaceCount = ctx.commandText.trim().split(/\s/).length;

    if(spaceCount * 1.5 > ctx.commandText.length) {
      if(ctx.commandText.trim().split(/(\r*\n)+/).length > 3)
        return ctx.respond(ctx.commandText);
    }
  }

  return next();
}