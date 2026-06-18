module.exports = {
  apps: [
    {
      name: "ccw-web",
      script: "cmd",
      args: "/c pnpm start:web",
      interpreter: "none", // <-- Do not use node interpreter
      instances: 1,
      exec_mode: "fork",
      env: {
        PORT: 3077,
      },
    },
    {
      name: "ccw-worker",
      script: "cmd",
      args: "/c pnpm worker",
      interpreter: "none", // <-- Do not use node interpreter
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
