// pm2 ecosystem for skinkeeper-api.
//
// The `--import` flag preloads ./dist/instrument.js so Sentry initializes
// BEFORE express is loaded, enabling auto-instrumentation. With ESM,
// importing instrument.js as the first line of index.ts is not enough —
// all imports are resolved before any code runs, so express loads in
// parallel with Sentry's OpenTelemetry hooks. --import guarantees order.
module.exports = {
  apps: [
    {
      name: 'skinkeeper-api',
      script: './dist/index.js',
      cwd: '/root/skinkeeper-api/backend',
      // fork mode (single instance) — cluster mode breaks Node's --import
      // flag because pm2 spawns workers via cluster.fork() which doesn't
      // re-apply node_args reliably under ESM. Load is fine on 1 instance.
      exec_mode: 'fork',
      instances: 1,
      node_args: ['--import', './dist/instrument.js'],
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
