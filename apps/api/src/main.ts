import { loadConfig } from "./config/env";
import { createServer } from "./server";

const config = loadConfig();
const server = await createServer(config);

await server.listen({
  host: config.apiHost,
  port: config.apiPort
});

