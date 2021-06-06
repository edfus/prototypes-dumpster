import { VM } from 'vm2';
const vm = new VM();

export const priority = 5;
export const command = "expr( 1 + 1 ) [ can have multiple lines ]";

export default async function (ctx, next) {
  if(ctx.from === "group" && !ctx["@me"]) {
    return next();
  }

  if(/^\s*expr\s|\(/i.test(ctx.commandText)) {
    const toRun = ctx.commandText.replace(/^\s*expr\s?/i, "");

    // if (ctx.environment !== "production") {
      if(toRun.length > 40) {
        return ctx.respond(ctx.getReaction("reject"));
      }
    // }
    
    try {
      const result = await vm.run(toRun);
      if(result instanceof Error) {
        result.stack = "***";
      }
      return ctx.respond(result);
    } catch (err) {
      return ctx.throw(err, toRun);
    }
  }

  return next();
};