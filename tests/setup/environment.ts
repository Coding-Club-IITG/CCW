Object.assign(process.env, { NODE_ENV: "test" });
process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters";
process.env.BASE_URL ??= "http://127.0.0.1:3000";
process.env.TRUSTED_ORIGINS ??= "http://127.0.0.1:3000";
process.env.AZURE_CLIENT_ID ??= "test-client-id";
process.env.AZURE_CLIENT_SECRET ??= "test-client-secret";
process.env.AZURE_TENANT_ID ??= "test-tenant-id";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379/15";
process.env.MONGODB_TEST_URI ??= "mongodb://127.0.0.1:27017";
