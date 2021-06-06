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
  
  for (const { dir, name, filepath } of pluginFiles.filter(Boolean)) {
    promises.push(
      import(
        pathToFileURL(filepath).toString().concat(subfix)
      ).then(middlewareModule => {
        const command = middlewareModule.command;
        if(middlewareModule.default) {
          return {
            name,
            command,
            filepath,
            middleware: middlewareModule.default
          };
        }

        const keys = Object.keys(middlewareModule);

        if(keys.length === 1) {
          if(!("command" in middlewareModule)) {
            return {
              name,
              command,
              filepath,
              middleware: middlewareModule.default
            };
          } else {
            throw new Error(`Which should I import?? ${keys}`);
          }
        }

        if(keys.length === 2 && "command" in middlewareModule) {
          return {
            name,
            command,
            filepath,
            middleware: keys.filter(k => k !== "command")[0]
          };
        }

        if(keys.length === 0) {
          return false;
        }

        throw new Error(`confused over plugin ${name}'s multiple named imports ${keys}`);
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
              `a non-function middleware is exported by plugin '${p.name}'`
            );
          }
        }
      }

      console.info("Loaded plugins:");
      console.info(plugins.map(p => "- ".concat(p.name)).join("\r\n"));

      return plugins;
    }
  );
}