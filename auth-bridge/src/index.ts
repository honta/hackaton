import { readEnv } from './env.js';
import { buildServer } from './server.js';

async function main() {
  const env = readEnv();
  const app = await buildServer({ env });

  await app.listen({
    host: '127.0.0.1',
    port: env.AUTH_BRIDGE_PORT,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
