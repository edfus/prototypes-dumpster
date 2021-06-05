import App from "./src/app.js";
import credentials from "./secrets/credentials.js";

const app = new App();

app.listen({
  credentials
});