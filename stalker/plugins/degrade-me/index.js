const banPattern = /^degrade(\s|(?=me)|$)/i;
const targetPattern = /^(me|ME)/;

export const command = "degrade (me|@yourself)";

export default async function (ctx, next) {
  if(ctx.from !== "group" || !ctx["@me"]) {
    return next();
  }
  
  const command = ctx.command;

  if(command[0].type === "text" && banPattern.test(command[0].value)) {
    const textTarget = command[0].value.replace(banPattern, "").trim();

    const groupID = ctx.groupID;
    const senderID = ctx.senderID;

    if(!targetPattern.test(textTarget)) {
      if(command[1]?.type === "at" && Number(command[1].value) == senderID) {
        ;
      } else { 
        return ctx.respond("Nah.");
      }
    }

    switch (ctx.sender.role) {
      case "owner":
        return ctx.respond(`Aren't you the ${ctx.sender.role}?`);
      case "admin":
        // returns async...
        await ctx.bot.setGroupAdmin(groupID, senderID, false);
        return ctx.respond(ctx.getReaction("accept"));
      default:
        // returns async...
        await ctx.bot.setGroupKick(groupID, senderID, false);
        return ctx.respond(ctx.getReaction("accept"));
    }
  }

  return next();
}