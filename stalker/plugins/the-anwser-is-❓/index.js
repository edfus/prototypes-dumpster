import RandExp from "randexp";

const questionMark = new RandExp(/\?|¿|¡|⸘|？|‼|⁉|❓|❔|﹖/);
questionMark.defaultRange.add(0, 65535);

export const priority = Infinity;

export default async function (ctx) {
  return ctx.respond(questionMark.gen());
}