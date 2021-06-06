const commandPattern = /^commands|help$/i;
export const command = commandPattern.source;

const newline = "\r\n";
const indent = " ".repeat(2);
const prefix = "- ";
const maxLength = 27;

export default async function (ctx, next) {
  if(ctx.from === "group" && !ctx["@me"]) {
    return next();
  }

  if(commandPattern.test(ctx.commandText)) {
    return ctx.respond(
      `Plugins List:${newline.repeat(2)}`.concat(
        ctx.pluginCommands.map(
          c => `${capitalize(c.plugin)}:${newline}${indent}${prefix}${
            withLineMaxLength(
              c.command,
              maxLength,
              newline + indent + " ".repeat(prefix.length)
            )
          }`
        ).join(newline.repeat(2))
      ),
      false
    );
  }

  return next();
}

const wordSplitRegEx = /(?<=\w+[^\w]+)/;
function capitalize (string) {
  if(!string.length)
    return string;

  let str = "";
  for (const word of string.split(wordSplitRegEx)) {
    if(word?.length) {
      str += word[0].toUpperCase() + word.slice(1);
    }
  }

  return str;
}

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