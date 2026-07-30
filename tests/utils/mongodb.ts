import mongoose from "mongoose";

export async function startTestMongo() {
  const url = new URL(process.env.MONGODB_TEST_URI!);
  const testDatabaseName = `ccw-test-${process.pid}-${Date.now()}`;
  url.pathname = `/${testDatabaseName}`;
  process.env.MONGODB_URI = url.toString();
  await mongoose.connect(process.env.MONGODB_URI);
}

export async function clearTestMongo() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function stopTestMongo() {
  if (!mongoose.connection.db?.databaseName.startsWith("ccw-test-")) {
    throw new Error("Refusing to drop a database outside the test namespace.");
  }

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
