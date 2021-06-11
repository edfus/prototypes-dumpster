import crypto from "crypto";
import { IncomingMessage } from "http";

const privateMaps = new WeakMap();

class Authenticator {
  constructor (tokenKeysMap) {
    privateMaps.set(this, tokenKeysMap);
  }

  prefix = "WTFAuth ";
  seperator = ", ";
  keys = [
    "auth_token", "auth_nonce", "auth_timestamp",
    "auth_signature_method", "auth_signature"
  ];

  middleware = (ctx, next) => this._middleware(ctx, next);
  _middleware (ctx, next) {
    if(!ctx.secure) {
      return ctx.redirct(ctx.request.href.replace(/^https?:/, "https"));
    }

    const authorization = ctx.request.get("Authorization");
    if(!authorization || typeof authorization !== "string") {
      return ctx.throw("authorization required", 401);
    }

    if(!authorization.startsWith(this.prefix)) {
      return ctx.throw("incorrect authorization prefix", 400);
    }

    if(authorization.length > 1000) {
      return ctx.throw("too long", 400);
    }

    const authDataArray = (
      authorization.slice(this.prefix.length)
                   .split(this.seperator)
    );

    if(authDataArray.length !== this.keys.length) {
      return ctx.throw("insufficient auth keys", 400);
    }

    const authData = authDataArray.map(
      entry => {
        const parts = entry.split("=");
        if(parts.length !== 2) {
          return ctx.throw("more than one occurrence of char =", 400);
        }
        const key   = percentDecode(parts[0]);
        // remove the preceding & trailing ""
        const value = percentDecode(parts[1].slice(1, parts[1].length - 1));

        return [key, value];
      }
    ).reduce(
      (obj, [key, value]) => {
        // if(key === "__proto__")
        if(!this.keys.includes(key)) {
          return ctx.throw("unrecognizable key", 400);
        }
        if(key in obj) {
          return ctx.throw("duplicate key", 400);
        }
        obj[key] = value;
        return obj;
      }, {}
    );

    // become stale after 2 and a half minutes
    if(parseInt(Date.now() / 1000) >= authData.auth_timestamp + 150) {
      return ctx.throw("staled", 400);
    }

    if(authData.auth_signature_method !== "HMAC-SHA1") {
      return ctx.throw("incorrect signature method", 400);
    }

    const tokenKeysMap = privateMaps.get(this);

    if(!tokenKeysMap.has(authData.auth_token)) {
      return ctx.throw("unable to authenticate you", 401);
    }

    const method    = ctx.request.method.toUpperCase();
    const uriObject = new URL(ctx.request.URL);

    const userProvidedSignature = Buffer.from(authData.auth_signature, "base64");
    const tokenSecret = tokenKeysMap.get(authData.auth_token);

    delete authData.auth_signature;

    for (const key in authData) {
      uriObject.searchParams.append(key, authData[key]);
    }

    uriObject.searchParams.sort();

    const toBeSigned = [
      method.toUpperCase(),
      uriObject.toString()
    ].join(";");

    // signature
    const expectedSignture = (
      crypto
        .createHmac(
          "sha1",
          Buffer.from(tokenSecret, "base64")
        )
        .update(toBeSigned)
        .digest()
    );
  
    if(crypto.timingSafeEqual(expectedSignture, userProvidedSignature)) {
      ctx.state.id = authData.auth_token;
      return next();
    } else {
      return ctx.throw("unable to authenticate you", 401);
    }
  }
}

function percentDecode(str) {
  return decodeURIComponent(
    str
    .replace(/%21/g, "!")
    .replace(/%2A/g, "\*")
    .replace(/%27/g, "\"")
    .replace(/%28/g, "\(")
    .replace(/%29/g, "\)")
  );
};

async function generateTokens () {
  const key = crypto.randomBytes(48);
  const secret = await new Promise((resolve, reject) => {
    crypto.generateKey(
      "hmac", { length: 48 }, (err, key) => err ? reject(err) : resolve(key)
    ); // v15
  });

  return {
    key: key.toString("base64"),
    secret: secret.export({ format: "buffer" }).toString("base64")
  }
}

export { Authenticator, generateTokens };