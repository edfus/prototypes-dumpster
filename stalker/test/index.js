import { App, ProxyServer } from "@edfus/proxy-server";
import { Auth } from "../auth-client.js";
import { Authenticator, generateTokens } from "../auth-server.js";

import { createServer, get } from "http";
import { strictEqual } from "assert";

describe("auth", async () => {
  let auth, server, reverseProxyApp, reverseProxy;
  before(async () => {
    const tokens = await generateTokens();
    const tokensMap = new Map();
    tokensMap.set(tokens.key, tokens.secret);

    auth = new Auth(tokens);
    const authenticator = new Authenticator(tokensMap);
    const isValid = req => authenticator.check(req);

    server = createServer((req, res) => {
      if(isValid(req)) {
        res.writeHead(200).end();
      } else {
        res.writeHead(401).end();
      }
    });

    reverseProxyApp = new App();

    reverseProxyApp.prepend((ctx, next) => {
      ctx.req.headers["x-forwarded-proto"] = "http:";
      ctx.req.headers["x-forwarded-host"]  = ctx.req.headers.host;
      ctx.req.url = ctx.url = `http://${ctx.req.headers.host}${ctx.req.url}`;
      return next();
    });

    reverseProxy = reverseProxyApp.listen(0, "localhost");
  });

  xit("auth", async () => {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      reverseProxyApp.once("error", reject);

      reverseProxy.once("listening", async function () {
        try {
          const proxyAddress = `http://localhost:${this.address().port}`;
  
          server.listen(0, "localhost");
          server.once("listening", async function () {
            try {
              const serverOrigin = `http://localhost:${this.address().port}`;
              reverseProxyApp.use(new ProxyServer(serverOrigin).requestListener);  
              
              const url = new URL("/get/something?amount=2&quality=best", proxyAddress);
              const req = get(url, { headers: auth.get(url) });
      
              req.once("response", res => {
                res.resume();
                try {
                  strictEqual(res.statusCode, 200);
                  resolve();
                } catch (err) {
                  return reject(err);
                }
              }).once("error", reject)
                .end()
              ;
            } catch (err) {
              return reject(err);
            }
          });
        } catch (err) {
          return reject(err);
        }
      }).once("error", reject);
    });
  });

  after(() => {
    reverseProxy.close();
    server.close();
  });
});