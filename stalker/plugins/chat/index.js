import insult from "insults";

function addPersonalityDomain(manager, context) {
  manager.assignDomain('en', 'me', 'personality');
  manager.add("en", "say about you", "me");
  manager.add("en", "why are you here", "me");
  manager.add("en", "what is your personality", "me");
  manager.add("en", "describe yourself", "me");
  manager.add("en", "tell me about yourself", "me");
  manager.add("en", "tell me about you", "me");
  manager.add("en", "tell me more about you", "me");
  manager.add("en", "what are you", "me");
  manager.add("en", "what the fuck are you", "me");
  manager.add("en", "who are you", "me");
  manager.add("en", "talk about yourself", "me");

  manager.assignDomain('en', 'age', 'personality');
  manager.add("en", "your age", "age");
  manager.add("en", "how old is your platform", "age");
  manager.add("en", "how old are you", "age");
  manager.add("en", "what's your age", "age");
  manager.add("en", "I'd like to know your age", "age");
  manager.add("en", "tell me your age", "age");
  manager.add("en", "when is your birthday", "age");
  manager.add("en", "when were you born", "age");
  manager.add("en", "when do you have birthday", "age");
  manager.add("en", "date of your birthday", "age");

  manager.assignDomain('en', 'annoying', 'personality');
  manager.add("en", "you're annoying me", "annoying");
  manager.add("en", "you are such annoying", "annoying");
  manager.add("en", "you annoy me", "annoying");
  manager.add("en", "you are annoying", "annoying");
  manager.add("en", "you are irritating", "annoying");
  manager.add("en", "you are annoying me so much", "annoying");
  manager.add("en", "you're horrible", "annoying");
  manager.add("en", "you are a lame", "annoying");
  manager.add("en", "I hate you", "annoying");

  manager.assignDomain('en', 'insult', 'personality');
  const process = reaction => {
    if(typeof reaction.gen === "function") {
      for (let i = 0; i < 4; i++) {
        manager.add("en", reaction.gen(), "insult");
      }
    } else if(typeof reaction === "string") {
      manager.add("en", reaction, "insult");
    }
  }

  for (const reaction of [ context.reactions.junk ]) {
    if(Array.isArray(reaction)) {
      reaction.forEach(process);
    } else {
      process(reaction);
    }
  }

  for (let i = 0; i < 500; i++) {
    manager.add("en", insult.default(), "insult");
  }
}

const selfIntroduction = `I sexually Identify as an Attack Helicopter. Ever since I was a boy I dreamed of soaring over the oilfields dropping hot sticky loads on disgusting foreigners. People say to me that a person being a helicopter is Impossible and I'm fucking retarded but I don't care, I'm beautiful. I'm having a plastic surgeon install rotary blades, 30 mm cannons and AMG-114 Hellfire missiles on my body. From now on I want you guys to call me "Apache" and respect my right to kill from above and kill needlessly. If you can't accept me you're a heliphobe and need to check your vehicle privilege. Thank you for being so understanding.`;
const answsers = {
  "me": () => selfIntroduction,
  "age": () => `I'm turning 30 tomorrow. ${selfIntroduction}`,
  "annoying": () => "Thx, that's what i was born for",
  "insult": () => {
    const toSend = insult.default();
    if(toSend.length < 15)
      return toSend.toUpperCase();
    else
      return toSend;
  }
,
};

export const nlu = {
  domains: ["personality"],
  train: addPersonalityDomain
};

export const priority = 7;

export default async function (ctx, next) {
  if(!ctx.nlu.trained) {
    return next();
  }

  if(ctx.from !== "private" && !ctx.isAtMe) {
    return next();
  }

  if(nlu.domains.includes(ctx.nlu.actual.domain)) {
    if(ctx.nlu.actual.intent === "None")
      return next();

    if(ctx.nlu.actual.score > .6) {
      return ctx.respond(answsers[ctx.nlu.actual.intent]());
    }

    if(ctx.nlu.actual.score > .35) {
      return ctx.respond("👀");
    }
  }

  return next();
}