import nodemailer from "nodemailer";
import { createReadStream } from "fs";
import { streamEdit } from "stream-editor";
import { PassThrough } from "stream";
import { InputAgent } from "./input-agent.js";

import * as contacts from "./secrets/contacts.js";
import * as accounts from "./secrets/accounts.js";
import * as passphrases from "./secrets/app-keys.js";
import endpoint from "./secrets/endpoint.js";

const agent = new InputAgent();
const ansiRegEx = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;
const prefix = "- ";
const kRequired = Symbol("required");

(async () => {
  const question = async function (string, defaultValue, { fallback = true, sanitize } = {}) {
    string = string.startsWith(prefix) ? string : prefix.concat(string);
    
    const length = string.replace(ansiRegEx, "").length;
    const required = arguments.length === 1;

    await agent.prompt(string);

    if(typeof defaultValue !== "object") {
      if (required) {
        defaultValue = {
          "#Required": kRequired
        };
      } else {
        defaultValue = {
          "default": defaultValue
        };
      }
    }

    const defaultList = Object.entries(defaultValue);

    const defaultPrompts = defaultList.map(([key, value]) => {
      if(value === kRequired) {
        return {
          value: `${" ".repeat(length)}${key}`,
          color: "red"
        };
      }
      return {
        value: `${" ".repeat(length)}$${key}: ${sanitize ? "*".repeat(value.length) : value}`,
        color: "cyan"
      };
    });

    await defaultPrompts.reduce(
      async (pr, { value, color }) => {
        await pr;
        return agent.prompt(value, color);
      }, Promise.resolve()
    );

    await agent.cursor.prevLine(defaultPrompts.length + 1);
    await agent.cursor.to(length);
    
    return agent.readline().then(async answer => {
      const originalAnswer = answer;

      if(!answer) {
        if(required) {
          throw new Error("Unfulfilled requirements");
        }
        
        if (fallback) {
          answer = (
            "default" in defaultValue
            ? "$default" : `$${defaultList[0][0]}`
          );
        }
      }

      const result = answer.replace(
        /\${?([#A-z0-9_-]+)}?/g,
        (whole, variable) => (
          variable in defaultValue
          ? defaultValue[variable] : whole
        )
      );
      
      if(result !== originalAnswer) {
        await agent.cursor.prevLine(1);
        await agent.cursor.to(string.length);
        const output = sanitize ? answer : result;
        const trailingLength = originalAnswer.length - output.length;
        await agent.respond(
          output.concat(" ".repeat(trailingLength >= 0 ? trailingLength : 0))
        );
      }

      await agent.cursor.nextLine(defaultPrompts.length - 1);
      await agent.erase.lines(defaultPrompts.length);

      return result;
    }).catch(async err => {
      await agent.cursor.nextLine(defaultPrompts.length);
      await agent.erase.lines(defaultPrompts.length);
      throw err;
    });
  }

  const users = Object.entries(accounts).map(
    ([key, address]) => [key, address.replace(/.*?<(.+?)>/, "$1")]
  ).reduce(
    (users, [key, user]) => users[key] = user, {}
  );
  
  const service = await question("Transport.service: ", "gmail");
  const user    = await question("Transport.auth.user: ", users);
  const pass    = await question("Transport.auth.pass: ", passphrases, { sanitize: true });
  const proxy   = await question("Transport.proxy: ", "http://127.0.0.1:7890", { fallback: true });

  const transporter = nodemailer.createTransport({
    service: service,
    auth: {
      user: user,
      pass: pass
    },
    proxy: proxy
  });

  const from    = await question("sendMail.from: ", accounts);
  const to      = await question("sendMail.to: ", contacts);
  const cc      = await question("sendMail.cc: ", contacts, { fallback: false });
  const subject = await question("sendMail.subject: ", "Invoices due");
  
  const html      = await question("sendMail.html (path, relative to pwd): ");
  const checkRead = await question("Know when a recipient reads the email? ", "Yes");
  
  const htmlSource  = createReadStream(html);
  const passThrough = new PassThrough();

  if(!/no?|fa?l?s?e?/i.test(checkRead)) {
    const id = Math.random().toString(16).replace(/^0\./, "");
    const imgProbe = [
      `<img src="`,
      `https://${endpoint}/mx.png`,
      `?subject=${encodeURIComponent(subject)}`,
      `&to=${encodeURIComponent(to)}`,
      `&cc=${encodeURIComponent(cc)}`,
      `&from=${encodeURIComponent(from)}`,
      `&id=${id}`,
      `" alt="" style="position: absolute; opacity: 0;`,
      `z-index: -999; clip: rect(1px,1px,1px,1px); width: 1px; height: 1px;">`
    ].join("");

    let attached = false;
    streamEdit({
      from: htmlSource,
      to: passThrough,
      search: "</body>",
      replacement: () => {
        attached = true;
        return imgProbe.concat("</body>");
      },
      limit: 1
    }).then(() => {
      const notify = () => {
        if(!attached) {
          return agent.warn(
            [
              `${prefix}Unable to locate '</body>' in ${html},`,
              `the tracker remains unattached.`
            ].join(" "),
            "yellow"
          );
        } else {
          return agent.respond(`${prefix}TrackId: ${id}`, "yellow");
        }
      }

      if(agent.busy) {
        agent.once("free", notify);
      } else {
        notify();
      }
    });
  } else {
    htmlSource.pipe(passThrough);
    htmlSource.once("error", err => passThrough.destroy(err));
    passThrough.once("error", err => htmlSource.destroy(err));
  }

  const attachmentCount = await question("sendMail.attachments.length: ", "0");

  const attachments = new Array(parseInt(attachmentCount));
  const spaces = " ".repeat(4);
  const colors = ["green", "yellow", "blue", "magenta", "cyan"];
  const stylize = i => agent.style(i, colors[i]);
  for (let i = 0; i < attachmentCount; i++) {
    const filename    = await question(`${spaces}attachments[${stylize(i)}].filename: `);
    const path        = await question(`${spaces}attachments[${stylize(i)}].path: `);
    const contentType = await question(`${spaces}attachments[${stylize(i)}].contentType: `, "");
    attachments[i] = {
      filename, path, contentType
    };
  }

  try {
    agent.respond(`\nSending to ${to}...`, "magenta");
    const info = await new Promise((resolve, reject) => {
      transporter.sendMail(
        {
          from, to, cc, subject,
          html: passThrough,
          attachments
        },
        (error, info) => {
          if (error) {
            return reject(error);
          }
          
          if(info.accepted){
            resolve({ result: "Email sent", response: info.response });
          } else {
            resolve({ result: "Email not accepted", ...info });
          }
        }
      );
    });

    await agent.respond(info);
  } catch (err) {
    await agent.throw(err);
  }
})().catch(async err => {
  await agent.throw(err);
  process.exit(1);
});
