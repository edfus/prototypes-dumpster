import parseDuration from "parse-duration";
import RandExp from "randexp";

// https://en.wikipedia.org/wiki/Letterlike_Symbols
const emoji = new RandExp(/👎|👀|(💩|💩💩|💩💩💩)|👊/);
const exclamation = new RandExp(/[Ww]ow|LOL|lol|LMAO|lmao|GOSH|gosh|w[ah]{2}t/);

let i = 0;
const banPattern = /^ban(\s|(?=me)|$)/i;
const targetPattern = /^(me|ME)/;

export const command = "ban (me|@yourself) [ duration (in English) ]";

export default async function (ctx, next) {
  if(ctx.from !== "group" || !ctx["@me"]) {
    return next();
  }

  const command = ctx.command;

  if(command[0].type === "text" && banPattern.test(command[0].value)) {
    const textTarget = command[0].value.replace(banPattern, "").trim();

    const groupID  = ctx.groupID;
    const senderID = ctx.senderID;

    if(!targetPattern.test(textTarget)) {
      if(command[1]?.type === "at" && Number(command[1].value) == senderID) {
        ;
      } else { 
        return ctx.respond("Go fuck yourself");
      }
    }

    let durationInSeconds = 120;
    const durationSources = (
      targetPattern.test(textTarget)
        ? [ 
            {
              type: "text",
              value: textTarget.replace(targetPattern, "")
            },
            ...command.slice(1)
          ]
        : command.slice(2)
    );

    const digitsOnly = /^\s*\d*\.?\d+\s*$/;

    for (const commandNode of durationSources) {
      if(commandNode?.type === "text") {
        if(digitsOnly.test(commandNode.value)) {
          const duration = parseInt(parseDuration(
            commandNode.value.trimEnd().concat("s")
          ));

          durationInSeconds = Math.ceil(duration / 1000 + .1);
          break;
        }
        const duration = parseInt(parseDuration(commandNode.value));
        if(duration) {
          durationInSeconds = Math.ceil(duration / 1000 + .1);
          break;
        }
      }
    }

    if (durationInSeconds <= 0) {
      return ctx.respond(ctx.getReaction("fooled"));
    }

    if (durationInSeconds <= 5) {
      if(durationInSeconds == 1) {
        await ctx.respond(exclamation.gen());
      } else {
        await ctx.respond(`Oh, ${durationInSeconds}cm`);
      }

      return ctx.respond(`${ctx.getReaction("penisInsult")} ${emoji.gen()}`);
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
    await ctx.bot.setGroupBan(groupID, senderID, durationInSeconds);

    if(durationInSeconds > 300) {
      return ctx.respond(`Based. [${++i}] ${durationInSeconds}s`);
    } else {
      return ctx.respond(ctx.getReaction("accept"));
    }
  }

  return next();
}