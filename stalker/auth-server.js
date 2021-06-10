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

  check (req) {
    if(!(req instanceof IncomingMessage)) {
      return false;
    }
    
    const authorization = req.headers["authorization"];
    if(!authorization || typeof authorization !== "string") {
      return false;
    }

    if(!authorization.startsWith(this.prefix)) {
      return false;
    }

    if(authorization.length > 1000) {
      return false;
    }

    const authDataArray = (
      authorization.slice(this.prefix.length)
                   .split(this.seperator)
    );

    if(authDataArray.length !== this.keys.length) {
      return false;
    }

    try {
      const authData = authDataArray.map(
        entry => {
          const parts = entry.split("=");
          if(parts.length !== 2) {
            throw new Error("More than one occurrence of char =");
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
            throw new Error(`Unrecognizable key ${key}`);
          }
          if(key in obj) {
            throw new Error("Duplicate key");
          }
          obj[key] = value;
          return obj;
        }, {}
      );

      // become stale after 2 and a half minutes
      if(parseInt(Date.now() / 1000) >= authData.auth_timestamp + 150) {
        throw new Error("Staling now");
      }

      if(authData.auth_signature_method !== "HMAC-SHA1") {
        throw new Error("Incorrect signature method");
      }

      const tokenKeysMap = privateMaps.get(this);

      if(!tokenKeysMap.has(authData.auth_token)) {
        throw new Error("Non-existing user");
      }

      const protocol = req.headers["x-forwarded-proto"].replace(/([^:]$)/, "$1:");
      const host = req.headers["x-forwarded-host"];

      const method    = req.method.toUpperCase();
      const uriObject = new URL(req.url, `${protocol}//${host}`);

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
    
      return crypto.timingSafeEqual(expectedSignture, userProvidedSignature);
    } catch (err) {
      return false;
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