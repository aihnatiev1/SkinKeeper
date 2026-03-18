module.exports = {
  apps: [{
    name: 'skinkeeper-api',
    script: 'dist/index.js',
    cwd: '/root/skinkeeper-api/backend',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3010,
    },
  }],
};
