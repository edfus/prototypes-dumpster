import { streamEdit } from "stream-editor";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { strictEqual } from "assert";
import { pipeline, Writable } from "stream";
import { createReadStream, existsSync, promises as fsp, createWriteStream } from "fs";

import cheerio from "cheerio";
import inlineCSS from "inline-css";
import svg2img from "svg2img";
import ProxyTunnel from "forward-proxy-tunnel";

import fallbackHost from "./secrets/fallback-uri.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const kAttributes = Symbol.for("attributes");
const kStrings = Symbol.for("strings");
const kPromises = Symbol.for("promises");

const proxy = new ProxyTunnel("http://127.0.0.1:7890");

const source = join(__dirname, "./resume.html");
const destination = join(__dirname, "resume-inlined.html");

const variableRegistry = {};
const svgRegistry = {};
const svgImgs = new class extends Array{
  [kPromises] = [];
  push(meta) {
    const url = meta.url;
    const filepath = join(__dirname, "./cache", replaceReservedChars(url));
    const promise = new Promise((resolve, reject) => {
      const buffers = [];
      proxy.fetch(url).then(
        res => {
          strictEqual(res.statusCode, 200, `${url} returned ${res.statusCode}`);
          pipeline(
            res,
            new Writable({
              write(chunk, enc, cb) {
                buffers.push(chunk);
                return cb();
              },
              async final(cb) {
                try {
                  await fsp.writeFile(
                    filepath,
                    Buffer.concat(buffers)
                  );
                } catch (err) {
                  return cb(err);
                }
                return cb();
              }
            }),
            error => error ? reject(err) : resolve(Buffer.concat(buffers).toString("utf-8"))
          );
        }
      ).catch(async err => {
        if(existsSync(filepath)) {
          console.info("access", url, "failed with", err.message);
          resolve(await fsp.readFile(filepath, "utf-8"));
        } else {
          throw err;
        }
      }).catch(reject);
    });

    this[kPromises].push(promise);
    return super.push({
      ...meta,
      promise
    });
  }
};

const extractNamePattern = /var\((.+?)\)/;
const extractAttrPattern = /(?<=\s*)(.+?)="(.+?)"/g;
const extractCSSValuePattern = /(?<=[;\s]*)(.+?):\s*(.+?)[;"']/g;

streamEdit({
  from: createReadStream(source),
  to: createWriteStream(destination),
  separator: /(?=<\/head>)/,
  join: "",
  replace: [
    {
      // rem to px
      match: /(?<=[\s:\()])([\d\.]+)rem(?=\s|;)/,
      replacement: (whole, x_rem) => {
        const result = parseFloat(x_rem) * 16;
        strictEqual(isNaN(result), false, "result is NaN");
        return `${result}px`;
      },
      isFullReplacement: true
    },
    {
      // add css variables to registry
      match: /:root \{((.|\r|\n)+?)\}/,
      replacement: (_, cssText) => {
        const cssStatements = cssText.split(/\n\s+/);
        const cssValues = cssStatements.filter(s => s && s.includes(":")).map(
          statement => {
            const parts = statement.split(/:\s*/);
            strictEqual(parts.length, 2);
            const { 0: name, 1: value } = parts;
            return {
              name: name.trim(),
              value: value.trim().replace(/;$/, "")
            };
          }
        );

        for (const { name, value } of cssValues) {
          if(name.startsWith("--")) {
            if(extractNamePattern.test(value)) {
              const variable = value.replace(extractNamePattern, "$1");

              if(!variableRegistry[variable])
                throw new Error(`${variable} does not exist in variableRegistry`);

              strictEqual(variable in variableRegistry, true);
              variableRegistry[name] = variableRegistry[variable];
            } else {
              variableRegistry[name] = value;
            }
          } else {
            throw new TypeError(`in :root - ${name}: ${value}`);
          }
        }

        return "";
      },
      maxTimes: 2,
      isFullReplacement: true
    },
    {
      // substitute css variables with their values
      match: extractNamePattern,
      replacement: (whole, variableName) => {
        const result = variableRegistry[variableName];

        if(!result)
          throw new Error(`${variableName} does not exist in variableRegistry`);

        return result;
      },
      isFullReplacement: true
    },
    {
      // add svg templates to registry
      match: /<svg id="template" style="display: none" (.+?)>((.|\r|\n)+?)<\/svg>/,
      replacement: (whole, attributes, symbolsText) => {
        svgRegistry[kAttributes] = attributes;
        const idExtractPattern = /.*id="(.+?)".*/;
        const idRemovePattern = /id="(.+?)"/;
        const idNotValidPattern = /=|"/;

        symbolsText.replace(
          /<symbol (.+?)>((.|\r|\n)+?)<\/symbol>/g,
          (whole, symbolAttributes, svgText) => {
            const id = symbolAttributes.replace(idExtractPattern, "$1");
            if(idNotValidPattern.test(id)) {
              throw new Error(`invalid id ${id}.`);
            }

            svgRegistry[id] = {
              [kAttributes]: symbolAttributes.replace(idRemovePattern, "").trim(),
              innerHTML: svgText.trim()
            };
          }
        );
        
        for (const whatever in svgRegistry) {
          if(whatever !== attributes)
            return "";
        }

        throw new Error("zero symbols added to registry");
      },
      isFullReplacement: true,
      maxTimes: 1
    },
    {
      // substitute svg templates
      match: /<svg (.+?)>(.|\r|\n)+?<use\s+href="#(.+?)"\s*\/>(.|\r|\n)+?<\/svg>/,
      replacement: (whole, attributes, _, id) => {
        const svg = svgRegistry[id];

        if(!svg)
          throw new Error(`${id} does not exist in svgRegistry`);

        const resultAttributes = mergeAttributes(
          svgRegistry[kAttributes],
          svg[kAttributes],
          attributes
        );

        const svgString = [
          `<svg ${resultAttributes}>`,
          svg.innerHTML,
          `</svg>`
        ].join("");

        const result = {
          outerHTML: svgString,
          innerHTML: svg.innerHTML,
          attr: resultAttributes,
          id,
          type: "svg"
        };

        Array.isArray(svgRegistry[kStrings])
         ? svgRegistry[kStrings].push(result)
         : svgRegistry[kStrings] = [result]
        ;
        return svgString;
      },
      isFullReplacement: true
    },
    {
      // fetch and embed images
      match: /<img(.|\r|\n)*?src="((https?:)?\/\/[^"]+?)"[^>]*?>/,
      replacement: (whole, __, url) => {
        svgImgs.push({
          element: whole,
          url,
          type: "img"
        });
        return whole;
      },
      isFullReplacement: true
    },
  ]
})
.then(
  // svg to image
  async () => {
    await Promise.all(svgImgs[kPromises]);

    const results = await Promise.all(
      (svgRegistry[kStrings] || [])
        .concat(svgImgs)
        .map(
          async meta => {
            const outerHTML = await (meta.outerHTML || meta.promise);

            let base64Data;
            if(meta.attr && meta.innerHTML) {
              let innerHTML = meta.innerHTML;
              let purgedAttrs = [];
              for (const { name, value } of extractAttr(meta.attr)) {
                if(name.startsWith("xml:")) {
                  purgedAttrs.push(`${name}="${value}"`);
                  continue;
                }
                switch (name) {
                  case "viewBox":
                  case "xmlns":
                  case "version":
                    purgedAttrs.push(`${name}="${value}"`);
                    continue;
                  case "enable-background":
                  case "class":
                    continue;
                  case "style":
                    let styles = [];
                    for (const { name: styleName, value: styleValue } of extractCSSValue(value)) {
                      switch (styleName) {
                        // properties, inclusive
                        case "enable-background":
                        case "position":
                        case "left":
                        case "top":
                          continue;
                        case "color":
                          styles.push(`color: ${styleValue}`);
                          innerHTML = innerHTML.split(`fill="currentColor"`).join(`fill="${styleValue}"`);
                          break;
                        default:
                          throw new Error(`do not know how to handle ${name}: ${value}`);
                      }
                    }
                    if(styles.length)
                      purgedAttrs.push(`style="${styles.join("; ")}"`);
                    continue;
                  default:
                    throw new Error(`do not know how to handle ${name}="${value}"`);
                }
              }

              if(innerHTML.includes(`fill="currentColor"`))
                console.info(meta.id || meta.url)

              base64Data = Buffer.from(
                `<svg ${purgedAttrs.join(" ")}>${innerHTML}</svg>`
              ).toString("base64");
            } else {
              base64Data = Buffer.from(outerHTML).toString("base64");
            }


            return {
              ...meta,
              element: meta.element || meta.outerHTML,
              base64URI: "data:image/svg+xml;base64,".concat(base64Data),
              base64Data
            };
          }
        )
    );

    const purgePattern = /\s*(viewBox|xmlns|version)=".+?"/g;

    return streamEdit({
      file: destination,
      separator: null,
      replace: await Promise.all(results.map(
        async ({ element, base64URI, base64Data, attr, id, type, url }) => {
          const contentType = "image/svg+xml";
          const fallbackURI = `https://${fallbackHost}/api/atob?d=${
            encodeURIComponent(base64Data)
          }&t=${encodeURIComponent(contentType)}`;
          const sources = [
            // `<source srcset="${fallbackURI}" type="${contentType}">`
          ];

          if(url) {
            sources.unshift(`<source srcset="${url}" type="${contentType}">`);
          }

          sources.unshift(`<source srcset="${base64URI}" type="${contentType}">`);

          let image;
          const pngURI = await new Promise((resolve, reject) => {
            svg2img(base64URI, (err, buf) => err ? reject(err) : resolve(
              "data:image/png;base64,".concat(buf.toString("base64"))
            ));
          });

          sources.push(`<source srcset="${pngURI}" type="image/png">`);

          switch (type) {
            case "img":
              image = element.replace(/src=".+?"/, `src="${fallbackURI}"`);
              break;
            case "svg":
              image = `<img src="${fallbackURI}" ${id ? `alt="${id}" ` : ""}${attr.replace(purgePattern, "")}></img>`;
              break;
            default:
              throw new Error(`unrecognized type ${type}`);
          }

          return {
            match: element,
            replacement: [
              `<picture>`,
                sources.join(""),
                image,
              `</picture>`
            ].join(""),
            isFullReplacement: true
          }
        }
      ))
    });
  }
)
.then(
  // inline CSS & cheerio special treatment
  async () => {
    const inlined = await inlineCSS(
      await fsp.readFile(destination, "utf-8"),
      {
        removeStyleTags: false,
        url: "http://localhost:1232324323423"
      }
    );

    const $ = cheerio.load(inlined);
    
    // ...

    return fsp.writeFile(destination, $.html());
  }
).then(
  () => streamEdit({
    file: destination,
    replace: [
      // replace reserved tags
      {
        match: /<html.*?>/,
        replacement: "<html>",
        maxTimes: 1
      },
      {
        match: /<\/?(nav)/,
        replacement: "div",
        maxTimes: 2
      },
      {
        match: /<\/?(main)/,
        replacement: "section",
        maxTimes: 2
      },
      {
        match: /<body\s*(.*?)>/,
        replacement: (whole, attr) => {
          attr = mergeAttributes(
            attr,
            `class="body--a"`
          );
          return [
            `<body>`,
            `<div style="width: 100%; height: 100%; margin: 0; padding: 0">`,
            `<section ${attr}>`
          ].join("");
        },
        maxTimes: 1,
        isFullReplacement: true
      },
      {
        match: "</body>",
        replacement: "</section></div></body>",
        maxTimes: 1
      },
      {
        // preserve some style tags, if needed (e.g. a:hover)
        match: /<style\s*(.*?)>((.|\r|\n)+?)<\/style>/,
        replacement: (whole, attr, content) => {
          const pattern = /onemailoutput="(.+?)"/i;
          const matchResult = pattern.exec(attr);
          if(matchResult !== null) {
            const _attr = attr.replace(pattern, "").trim();
            switch (matchResult[1]) {
              case "keep":
                return `<style${_attr.length ? " ".concat(_attr) : ""}>${content}</style>`;
              default:
                throw new Error(`unrecognized onemailoutput="${matchResult[1]}"`);
            }
          }
          return "";
        },
        isFullReplacement: true
      },
      {
        match: /(\r?\n)\s*(?=(\r?\n))/,
        replacement: "",
        isFullReplacement: true
      }
    ],
    separator: /(?=<\/head)/
  })
);

function * extractCSSValue (attr) {
  let arr;

  while ((arr = extractCSSValuePattern.exec(attr)) !== null) {
    yield {
      name: arr[1].trim(),
      value: arr[2].trim(),
    }
  }
}

function * extractAttr (attr) {
  let arr;

  while ((arr = extractAttrPattern.exec(attr)) !== null) {
    yield {
      name: arr[1].trim(),
      value: arr[2].trim(),
    }
  }
}

function mergeAttributes (...attrGroups) {
  const result = {};
  for (const attrText of attrGroups) {
    if(typeof attrText !== "string")
      throw new TypeError(`expected attrText but ${attrText} is received`);
    
    for (const { name, value } of extractAttr(attrText)) {
      if(result[name]) {
        switch (name) {
          case "class":
            result[name] = `${result[name]} ${value}`;
            break;
          case "style":
            result[name] = `${result[name].replace(/;?\s*$/, ";")} ${value}`;
            break;
          default:
            throw new Error(`do not know how to flat ${name} for ${value}`);
        }
      } else {
        result[name] = value;
      }
    }
  }

  return Object.entries(result).map(([key, value]) => `${key}="${value}"`).join(" ")
}

function replaceReservedChars(filename) {
  return filename.replace(/<|>|:|"|\/|\\|\||\?|\*/g, "-");
}
