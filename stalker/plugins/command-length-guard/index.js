let maxKeyStore = 12;
const maxLength = 200;
const spammers = [];

const responses = ["too long didnt read", "tldr"];

export const priority = 0;

export default async function (ctx, next) {
  if(ctx.commandText.length >= maxLength) {
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