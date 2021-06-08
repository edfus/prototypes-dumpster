let maxKeyStore = 12;
const maxLength = 200;
const spammers = [];

const responses = ["too long didnt read", "tldr"];

export const priority = 0;

let antiSplit = {
  lastTimestamp: 0,
  senderID: 0,
  from: "private",
  groupID: 0
};

export default async function (ctx, next) {
  if(Date.now() - antiSplit.lastTimestamp < 60) {
    if(antiSplit.senderID === ctx.senderID) {
      if(antiSplit.from === ctx.from) {
        if(antiSplit.groupID === ctx.groupID) {
          return ;
        }
      }
    }
  }

  if(ctx.commandText.length >= maxLength) {
    antiSplit = {
      lastTimestamp: Date.now(),
      senderID: ctx.senderID,
      from: ctx.from,
      groupID: ctx.groupID,
    }

    if(ctx.from !== "private" && !ctx.isAtMe) {
      return ctx.reply(ctx.getReaction("junk"));
    }

    if(spammers.includes(ctx.senderID)) {
      return ctx.respond("DON'T SPAM ME", false);
    }
    
    spammers.push(ctx.senderID);
    if(spammers.length > maxKeyStore) {
      spammers.shift();
    }

    return ctx.respond(r(), false);
  }

  return next();
}

function r () {
  return responses[Math.floor(Math.random() * responses.length)];
}