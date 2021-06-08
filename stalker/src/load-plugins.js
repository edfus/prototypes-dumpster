import { promises as fsp, constants } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

const jsFilePattern = /\.[cm]?js$/;
const indexJSFilePattern = /index\.[cm]?js$/;

export async function loadPlugins(baseDir, noCache) {
  const items = await fsp.readdir(baseDir, { withFileTypes: true });
  
  const pluginFiles = await Promise.all(
    items.map(async dirent => {
      if(dirent.isDirectory()) {
        const dirPath = join(baseDir, dirent.name);
        const packagePath = join(dirPath, 'package.json');

        try {
          const plugin = await fsp.readFile(packagePath).then(async content => {
            const filepath = JSON.parse(content).main;

            if(typeof filepath !== "string") {
              throw new TypeError(`malformed main field ${filepath} in package.json`);
            }

            if( !( await fsp.access(join(dirPath, filepath), constants.R_OK) ) ) {
              throw new Error(`inaccessible file ${filepath} in package.json`);
            }

            return {
              dir: dirPath,
              name: filepath,
              filepath: filepath
            };
          });

          return plugin;
        } catch (err) {
          const subItems = await fsp.readdir(dirPath, { withFileTypes: true });
          const subFiles = subItems.filter(item => item.isFile());

          if(subFiles.length === 1 && jsFilePattern.test(subFiles[0].name)) {
            return {
              dir: dirPath,
              name: dirent.name,
              filepath: join(dirPath, subFiles[0].name)
            };
          } else {
            for (const file of subFiles) {
              if(indexJSFilePattern.test(file.name)) {
                return {
                  dir: dirPath,
                  name: dirent.name,
                  filepath: join(dirPath, file.name)
                };
              }
            }
            return false;
          }
        }
      } else if (dirent.isFile() && jsFilePattern.test(dirent.name)) {
        return {
          dir: dirPath,
          name: dirent.name,
          filepath: join(baseDir, dirent.name)
        };
      } else {
        return false;
      }
    })
  );

  const promises = [];
  const subfix = noCache ? `?v=${Math.random()}` : "";

  const metaTemplate = {
    command: "",
    priority: 5,
    nlu: null
  };
  
  const metaKeys = Object.keys(metaTemplate);

  for (const { dir, name, filepath } of pluginFiles.filter(Boolean)) {
    promises.push(
      import(
        pathToFileURL(filepath).toString().concat(subfix)
      ).then(middlewareModule => {
        const meta = metaKeys.reduce(
          (metaObj, key) => {
            if(key in middlewareModule) {
              metaObj[key] = middlewareModule[key];
            } else {
              metaObj[key] = metaTemplate[key];
            }
            return metaObj;
          },
          {
            name,
            filepath
          }
        );

        if(middlewareModule.default) {
          return {
            meta,
            middleware: middlewareModule.default
          };
        }

        const possibleMiddlewareKeys = Object.keys(
          middlewareModule
        ).filter(k => !metaKeys.includes(k));

        if(possibleMiddlewareKeys.length === 0) {
          return false;
        }

        if(possibleMiddlewareKeys.length === 1) {
          return {
            meta,
            middleware: middlewareModule[possibleMiddlewareKeys[0]]
          };
        }

        throw new Error(
          `Confused over plugin ${name}'s multiple named exports ${possibleMiddlewareKeys}`
        );
      })
    );
  }

  return Promise.all(promises).then(
    plugins => {
      plugins = plugins.filter(p => Boolean(p));

      if (plugins.some(p => typeof p.middleware !== "function")) {
        for (const p of plugins) {
          if(typeof p.middleware !== "function") {
            throw new Error (
              `A non-function middleware is exported by plugin '${p.name}'`
            );
          }
        }
      }

      plugins = plugins.sort(
        (pA, pB) => {
          if(pA.meta.priority > pB.meta.priority) {
            return 1;
          } else {
            return -1
          }
        }
      );

      console.info("Loaded plugins:");
      console.info(plugins.map(
        p => `- ${p.meta.priority}: `.concat(p.meta.name)
      ).join("\r\n"));

      return plugins;
    }
  );
}