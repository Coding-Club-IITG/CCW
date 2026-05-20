import { Agenda } from "agenda";
import { MongoBackend } from "@agendajs/mongo-backend";
import { RedisNotificationChannel } from "@agendajs/redis-backend";
import { logger } from "./utils";

const mongodbUri = process.env.MONGODB_URI!;
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Attach an error listener BEFORE passing to Agenda — ioredis emits 'error'
// as an EventEmitter event, which Node.js re-throws if there is no listener,
// crashing the entire process. This keeps the worker alive during Redis blips;
// Agenda falls back to polling MongoDB every `processEvery` interval.
const redisNotificationChannel = new RedisNotificationChannel({
  connectionString: redisUrl,
});
redisNotificationChannel.on("error", (err: Error) => {
  logger.error("[Agenda] Redis notification channel error (worker will keep running via MongoDB polling):", err.message);
});

const agenda = new Agenda({
  backend: new MongoBackend({
    address: mongodbUri,
    collection: "agenda_jobs",
  }),
  notificationChannel: redisNotificationChannel,
  processEvery: "1 minute",
  maxConcurrency: 4,
  defaultLockLifetime: 10 * 60 * 1000,
});

agenda.on("error", (err) => {
  logger.error("[Agenda] Internal error:", err);
});

agenda.on("ready", () => {
  logger.info("[Agenda] Connected and Ready");
});

export default agenda;
