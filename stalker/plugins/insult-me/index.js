import insult from "insults";
import shakespeareInsult from "shakespeare-insult";

const commandPattern = /[^\w]?insult\s*me[\s\.\!\?;]*/i;
export const command = commandPattern.source;

export default async function (ctx, next) {
  if(ctx.from === "group" && !ctx["@me"]) {
    return next();
  }

  if (commandPattern.test(ctx.commandText)) {
    let text;
    if(Math.random() > .75) {
      text = shakespeareInsult.random();
    } else {
      text = insult.default();
    }

    if (!text)
      return ctx.respond(ctx.getReaction("reject"));

    if (!/[A-Z]|[^\w]/.test(text[0])) {
      text = text[0].toUpperCase() + text.slice(1);
    }

    return ctx.atAndRespond(
      {
        qq: ctx.sender.user_id,
        text: ctx.sender.title
      }, 
      text
    );
  }

  return next();
}