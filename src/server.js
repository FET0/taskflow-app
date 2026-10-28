const { createApp, pool, redis } = require('./app');

const port = Number(process.env.PORT || 3000);
const app = createApp();
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`TaskFlow API listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await Promise.allSettled([pool.end(), redis.quit()]);
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
