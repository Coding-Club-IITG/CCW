module.exports = {
  apps: [
    {
      name: "ccw-web",
      script: "pnpm",
      args: "start:web",
      // instances: "max",
      // exec_mode: "cluster",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        OPS_LOGGING_ENABLED: "true",
        PORT: 3077,
      },
    },
    {
      name: "ccw-worker",
      script: "pnpm",
      args: "worker",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        OPS_LOGGING_ENABLED: "true",
      },
    },
  ],
};
