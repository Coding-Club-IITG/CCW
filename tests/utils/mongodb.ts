import mongoose from "mongoose";

export async function startTestMongo() {
  const url = new URL(process.env.MONGODB_TEST_URI!);
  const testDatabaseName = `ccw-test-${process.pid}-${Date.now()}`;
  url.pathname = `/${testDatabaseName}`;
  process.env.MONGODB_URI = url.toString();
  await mongoose.connect(process.env.MONGODB_URI);
}

export async function createTestAuthIndexes() {
  const db = mongoose.connection.db;
  if (!db?.databaseName.startsWith("ccw-test-"))
    throw new Error("Auth test indexes require an isolated test database.");
  await db.collection("account").createIndexes([
    { key: { userId: 1 }, unique: true, name: "one_identity_per_user" },
    {
      key: { providerId: 1, accountId: 1 },
      unique: true,
      name: "unique_provider_identity",
    },
  ]);
  await db.collection("session").createIndex({ userId: 1 });
}

export async function clearTestMongo() {
  const db = mongoose.connection.db;
  if (!db?.databaseName.startsWith("ccw-test-"))
    throw new Error("Refusing to clear a database outside the test namespace.");
  const collections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();
  await Promise.all(
    collections.map((collection) =>
      db.collection(collection.name).deleteMany({}),
    ),
  );
}

export async function stopTestMongo() {
  if (!mongoose.connection.db?.databaseName.startsWith("ccw-test-")) {
    throw new Error("Refusing to drop a database outside the test namespace.");
  }

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
