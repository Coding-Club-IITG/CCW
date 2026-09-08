Object.assign(process.env, {
  NODE_ENV: "test",
  AUTH_SECRET: "test-auth-secret-at-least-32-characters",
  BASE_URL: "http://127.0.0.1:3000",
  TRUSTED_ORIGINS: "http://127.0.0.1:3000",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_TENANT_ID: "test-tenant-id",
});
process.env.REDIS_URL ??= "redis://127.0.0.1:6379/15";
process.env.MONGODB_TEST_URI ??=
  "mongodb://localhost:27017/?replicaSet=rs0&retryWrites=false";
process.env.MONGODB_URI ??=
  "mongodb://localhost:27017/ccw-test?replicaSet=rs0&retryWrites=false";
