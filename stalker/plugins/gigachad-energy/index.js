import quotes from 'inspirational-quotes';
import { promises as fsp } from "fs";
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const maxLength = 35;
const wordSplitRegEx = /(?<=\w+[^\w]+)/;

function withLineMaxLength (string, maxLength, seperator) {
  if(!string.length)
    return string;

  let str = "";
  let length = 0;
  for (const word of string.split(wordSplitRegEx)) {
    if(word?.length) {
      length += word.length;
      if(length >= maxLength) {
        length = word.length;
        str += seperator;
      }
      str += word;
    }
  }

  return str;
}

const quote = () => {
  const toSend = quotes.getQuote();
  let author = `ββ${toSend.author.replace(/,.+$/, "")}`;

  if(author.length >= maxLength - 10) {
    author = "ββthe Maine hermit";
  }

  return (
    `${
      withLineMaxLength(toSend.text, maxLength, "\r\n")
    }\r\n${" ".repeat(maxLength - author.length + 4)}${author}`
  )
};

function addPersonalityDomain(manager, context) {
  manager.assignDomain('en', 'fap', 'gigachad');
  [
    "Masturbation suits you better",
    "Do it yourself pls if a jerk-off is what you want",
    "Wish you a happy fapping",
    "Just don't cum on my face",
    "Really? Can't ejaculate without others' help? How lame",
    "Cross your legs for a little extra pressure on your clitoris",
    "Will the existence of others be too tame for you when masturbating?",
    "fap", "fapping", "I wanna masturbate", "jerking off is what i need now",
    "Watching porn to satisfy your sexual desire is like drinking salt water to satisfy your thirst.",
    "commit suicide", "kill yourself", "penis", "dick", "pornhub", "xvideo",
    "fetish", "tits", "pussy", "sexy", "hot amateur", "boobs", "anal",
    "blonde teen sex blowjob", "hentai", "cumming", "cum", "cock", "day 0"
  ].forEach(
    p => {
      manager.add("en", p, "fap");
    }
  );

  const process = reaction => {
    if(typeof reaction.gen === "function") {
      for (let i = 0; i < 15; i++) {
        manager.add("en", reaction.gen(), "fap");
      }
    } else if(typeof reaction === "string") {
      manager.add("en", reaction, "fap");
    }
  }

  for (const reaction of [ context.reactions.penisInsult ]) {
    if(Array.isArray(reaction)) {
      reaction.forEach(process);
    } else {
      process(reaction);
    }
  }
}

export const nlu = {
  domains: ["gigachad"],
  train: addPersonalityDomain
};

export const priority = 8;

const pornDetecters = [
  /(?<!δΈ)[ζ³θ¦](ηι»|[βπ§€ζ]?[ε²πθ«]|[θ·―ζΈ]η?‘)/u,
  /[θ·―ζΈε²θ«]δΊ(ε₯½ε |[δΈ€δΈεδΊε­])[η?‘ε?ε]/u, /εεθΊη/u, /(ζζ²‘ζ|ζ³η)θΏη»­ε°η²Ύ/u,
  /ζ¦¨η²Ύ(θ§ι’)?/u, /(?<!δΈ)ε―δ»₯?(ηι»|ζε²)ε?οΌ?/u, /(δ»ζ|ζδΈ|δΈθ΅·)ζε²ε?/u
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const imageDirectory = join(__dirname, "./images");

let loaded = false;
let images;
const gigachadPromises = fsp.readdir(
  imageDirectory, { withFileTypes: true }
).then(items => {
  loaded = true;
  return items.filter(
    item => {
      if(item.isFile() && /\.jpg$/.test(item.name)) {
        return true;
      }
    }
  ).map(item => join(imageDirectory, item.name))
});

export default async function (ctx, next) {
  if(!ctx.nlu.trained) {
    return next();
  }

  if(!loaded) {
    return next();
  } else {
    if(!images) {
      images = await gigachadPromises;
    }
  }

  const reply = () => ctx.reply(
    [
      ctx.toImage(images[Math.floor(Math.random() * images.length)]),
      quote()
    ]
  );

  if(nlu.domains.includes(ctx.nlu.actual.domain)) {
    if(ctx.nlu.actual.intent === "None")
      return next();

    if(ctx.nlu.actual.score > .6) {
      return reply();
    }
  }

  if(pornDetecters.some(p => p.test(ctx.commandText))) {
    return reply();
  }

  return next();
}
