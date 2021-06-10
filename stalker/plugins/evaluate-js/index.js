import { VM } from 'vm2';
const vm = new VM();

import { inspect } from "util";

export const priority = 6;
export const command = "expr( 1 + 1 ) [ can have multiple lines ]";

const commandPattern = /^\s*expr(?=[\s('"`{\[+\-!^])/i;

export default async function (ctx, next) {
  if(ctx.from === "group" && !ctx["@me"]) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    const toRun = ctx.commandText.replace(commandPattern, "");

    if(toRun.length > 80) {
      return ctx.respond(ctx.getReaction("reject"));
    }

    return ctx.respond("https://bellard.org/jslinux/vm.html?url=buildroot-x86.cfg");
    
    try {
      const result = await vm.run(toRun);
      if(result instanceof Error) {
        result.stack = "***";
      }
      return ctx.respond(inspect(result || ""));
    } catch (err) {
      return ctx.throw(err, "Errored, that's it.");
    }
  }

  return next();
};