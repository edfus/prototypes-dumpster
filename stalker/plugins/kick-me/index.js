let i = 0;
const banPattern = /^kick(\s|(?=me)|$)/i;
const targetPattern = /^(me|ME)/;

export const command = "kick (me|@yourself)";

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
        return ctx.respond("Go fuck yourself");
      }
    }

    switch (ctx.sender.role) {
      case "owner":
        return ctx.respond("Can a sheep beat a wolf?");
      case "admin":
        const trashes = [
          "Masturbation suits you better",
          "Do it yourself pls if a jerk-off is what you want",
          "Wish you a happy fapping",
          "Just don't cum on my face",
          "Really? Can't ejaculate without others' help? How lame",
          "Cross your legs for a little extra pressure on your clitoris",
          "Will the existence of others be too tame for you when masturbating?"
        ];

        return ctx.respond(
          trashes[Math.floor(Math.random() * trashes.length)]
        );
      default:
        break;
    }

    // returns async...
    await ctx.bot.setGroupKick(groupID, senderID, false);

    return ctx.respond(ctx.getReaction("accept"));
  }

  return next();
}