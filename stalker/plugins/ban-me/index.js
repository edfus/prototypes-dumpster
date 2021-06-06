import parseDuration from "parse-duration";
import RandExp from "randexp";

// https://en.wikipedia.org/wiki/Letterlike_Symbols
const emoji = new RandExp(/👎|👀|💩|👊/);
const penis = new RandExp(/[ℙ][ℇ℮ℯℰⅇ][ℕ№][iℹ℩ⅈ]s|[ⅅⅆ⅁][ℹ️ℹ℩ⅈ][ℂ℃℄]K/i);
penis.defaultRange.add(0, 65535);

const exclamation = new RandExp(/wow|lol|lmao|\?/i);
const emphasizeAdv = new RandExp(/(pathetically|inordinately)?/);
const sadVerb = new RandExp(/hurt|feel sad|feel such pain/);
const small = new RandExp(/small|tiny/);
const too = new RandExp(/to{2,5}/);
const parts = [
  { 
    start: () => "Isn't your",
    end:   () =>`${emphasizeAdv.gen()} ${too.gen()} small?` 
  },
  { 
    start: () =>`${exclamation.gen()}, is that the size of your`,
    end:   () =>`?` 
  },
  { 
    start: () => `I ${sadVerb.gen()} for your ${small.gen()}`,
    end:   () =>`size` 
  }
];

const insult = (p, e) => {
  const part = parts[Math.floor(Math.random() * parts.length)];
  return `${part.start()} ${p} ${part.end()} ${e}`;
};

let i = 0;
const banPattern = /^ban(\s|(?=me))/i;
const targetPattern = /^(me|ME)/;

export const command = "/ban (me|@yourself) [ duration (in English) ]/i";

export default async function (ctx, next) {
  if(ctx.from !== "group" || !ctx["@me"]) {
    return next();
  }

  const command = [ ...ctx.command ];

  if(command[0].type === "text" && banPattern.test(command[0].value)) {
    try {
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

      const digitsOnly = /^\s*\d+\.?\d+\s*$/;

      for (const commandNode of durationSources) {
        if(commandNode?.type === "text") {
          if(digitsOnly.test(commandNode.value)) {
            durationInSeconds = parseInt(parseDuration(
              commandNode.value.concat("s")
            ));
            break;
          }
          const duration = parseInt(parseDuration(commandNode.value));
          if(duration) {
            durationInSeconds = (duration / 1000).toFixed(0);
            break;
          }
        }
      }

      if(durationInSeconds < 2) {
        const p = penis.gen();
        const e = emoji.gen();
        return ctx.respond(insult(p, e));
      }

      try {
        await ctx.bot.setGroupBan(groupID, senderID, durationInSeconds);
      } catch (err) {
        return ctx.respond("Can a sheep beat a wolf?"); //NOTE
      }

      if(durationInSeconds > 300) {
        return ctx.respond(`Based. [${++i}] ${durationInSeconds}s`);
      } else {
        return ctx.respond(ctx.getReaction("accept"));
      }
    } catch (err) {
      return ctx.throw(err, ctx.commandText);
    }
  }

  return next();
}