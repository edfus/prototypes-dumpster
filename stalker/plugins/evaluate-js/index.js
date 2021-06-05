import { VM } from 'vm2';
const vm = new VM();

export default async function (ctx, next) {
  if(/^expr\s|\(/i.test(ctx.state.command)) {
    const toRun = ctx.state.command.replace(/^expr\s?/i, "");
    try {
      return ctx.respond(await vm.run(toRun));
    } catch (err) {
      err.expose = true;
      err.status = toRun;
      return ctx.throw(err);
    }
  }

  return next();
};