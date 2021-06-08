import RandExp from "randexp";

const questionMark = new RandExp(/\?|¿|¡|⸘|？|⁉|❓|❔|﹖/);
questionMark.defaultRange.add(0, 65535);

export const priority = Infinity;

export default async function (ctx, next) {
  if(ctx.from !== "private" && !ctx.isAtMe) {
    return next();
  }
  return ctx.respond(questionMark.gen());
}