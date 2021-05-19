class Meta {
  constructor (url) {
    try {
      this.url = new URL(url);
    } catch {}
  }

  get id () {
    try {
      return this.url.searchParams.get("id");
    } catch {
      return "";
    }
  }

  get subject () {
    try {
      return decodeURIComponent(this.url.searchParams.get("subject"));
    } catch {
      return "";
    }
  }

  get addresses () {
    try {
      return decodeURIComponent([
        `to=${this.url.searchParams.get("to")}`,
        `cc=${this.url.searchParams.get("cc")}`,
        `from=${this.url.searchParams.get("from")}`
      ].join("-"));
    } catch {
      return "";
    }
  }
}

const stubImage = (
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII="
);

self.addEventListener("fetch", async event => {
  const stubResponse = new Response(stubImage, { status: 200, headers: { 
    "Content-Type": "image/png",
    "Content-Length": stubImage.length,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Request-Headers": "*",
    "Access-Control-Request-Method": "GET"
  }});

  event.respondWith(
    (async () => {
      const NAMESPACE = EMAIL_READ_OR_NOT_PROBE;
      const request = event.request;
      
      if(request.url.length > 1000) {
        return ;
      }

      const metadata = new Meta(request.url);

      if(!metadata.id || !metadata.subject) {
        return ;
      }

      const key      = getKey(request, metadata);
      const preValue = await NAMESPACE.get(metadata.id);
      const preValueParsed = preValue ? parseJSON(preValue) : null;

      const value = preValueParsed ? logInfo(request) : stringifyJSON([
        logInfo(request), ...(Array.isArray(preValueParsed) ? preValueParsed: [preValueParsed])
      ]);

      event.waitUntil(NAMESPACE.put(key, value,
        {
          expirationTtl: 60 * 60 * 24 * 30 * 6, // in seconds
          metadata: {
            date: new Date().toLocaleString(),
            referer: request.referrer && request.referrer.slice(0, 900),
            ip: request.headers.get("cf-connecting-ip"),
          }
        }
      ));
    })().then(() => stubResponse, () => stubResponse)
  );
});

function getKey (request, metadata) {
  const ip = request.headers.get("cf-connecting-ip");
  const country = request.headers.get("Cf-Ipcountry");
  const subfix = ip ? "" : `-${Date.now()}`;

  return `${metadata.subject}-${country || "unknown"}-${ip || "unknown"}-${
    metadata.addresses
  }-${metadata.id}${subfix}`;
}

function logInfo (request) {
  const ray = request.headers.get("cf-ray") || "";
  return stringifyJSON({
    "timestamp":  Date.now(),
    "date":       new Date().toLocaleString(), 
    "method":     request.method,
    "ray":        ray.slice(0, -4),
    "ip":         request.headers.get("cf-connecting-ip"),
    "host":       request.headers.get("host"),
    "ua":         request.headers.get("user-agent"),
    "cc":         request.headers.get("Cf-Ipcountry"),
    "colo":       request.cf && request.cf.colo,
    "url":        decodeURIComponent(request.url),
    "referer":    request.referrer
  });
}

function stringifyJSON (obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return "JSON.stringify errored.";
  }
}

function parseJSON (jsonstr) {
  try {
    return JSON.parse(jsonstr);
  } catch {
    return null;
  }
}