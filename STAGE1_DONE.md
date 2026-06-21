# Stage 1 Documentation: Infrastructure & Event Flow

This document details the real-time presence infrastructure, background queuing systems, caching patterns, and server-sent event (SSE) specifications implemented in Stage 1.

---

## 1. Redis Key Conventions

All keys stored in Redis follow strict namespacing rules to prevent collisions and support multiple workers cleanly.

### Cache-Aside Keys
All cache keys use the global prefix `ccw`. Parameterized cache keys are built deterministically by sorting parameters alphabetically and ignoring `null`/`undefined` values.

* **Format (Parameterized):** `ccw:<prefix>:<param1>=<val1>&<param2>=<val2>...`
* **Format (Simple):** `ccw:<prefix>`

#### Default Cache TTLs (`CACHE_TTLS`)
| Key Prefix | Description | TTL (Seconds) | Human Readable |
| :--- | :--- | :---: | :---: |
| `ccw:team` | Team-specific data | 21,600 | 6 hours |
| `ccw:contests` | Contest listings | 10,800 | 3 hours |
| `ccw:cf_problemset` | Codeforces problem cache | 21,600 | 6 hours |
| `ccw:cf_user_info` | Codeforces user info/rating cache | 3,600 | 1 hour |
| `ccw:events` | General events data | 300 | 5 minutes |
| `ccw:projects` | Project listings | 300 | 5 minutes |
| `ccw:leaderboards` | Platform leaderboards | 300 | 5 minutes |
| `ccw:blog` | Blog posts / metadata | 120 | 2 minutes |
| `ccw:files` | Uploaded assets cache | 120 | 2 minutes |
| `ccw:users` | User profile data | 120 | 2 minutes |
| `ccw:potd` | Problem of the Day cache | 120 | 2 minutes |
| `ccw:hackathons` | Hackathon info | 300 | 5 minutes |
| `ccw:hackathon_requests` | Hackathon join requests / invites | 60 | 1 minute |

---

### Real-Time Presence Keys
Presence tracking utilizes the Redis keyspace events listener to auto-forfeit inactive contest participants.

* **Online State Key:** `room:<roomId>:presence:<userId>`
  * **Value:** `"online"`
  * **TTL:** Persistent during active SSE connection. Changes to a **90-second TTL** on SSE client disconnection.
* **Expiration Lock Key:** `room:<roomId>:presence:<userId>:expire_lock`
  * **Value:** `"1"`
  * **TTL:** 10 seconds.
  * **Purpose:** Prevents duplicate auto-forfeit processing across multiple concurrent worker instances when the presence key expires.
* **Offline Sent Key:** `room:<roomId>:presence:<userId>:offline_sent`
  * **Value:** `"1"`
  * **TTL:** 120 seconds.
  * **Purpose:** Built as a helper flag to prevent publishing duplicate offline notifications when a user drops off-stream (published once immediately on SSE disconnect, and checked before repeating during a keyspace expire event).

---

### Programmatic Redis Policies
During initialization, the client enforces the following configurations:
1. `maxmemory-policy` is set to `noeviction` to ensure background queues and locks are never discarded due to memory constraints.
2. `notify-keyspace-events` is set to `KEA` (Keyspace, Keyevent, All) to enable the expired key channel (`__keyevent@*__:expired`) subscription.

---

## 2. BullMQ Queue Names

Background tasks are managed via BullMQ queues connected to Redis:

### `cf_sync_queue`
* **Purpose:** Orchestrates Codeforces problem ingestion and ingestion synchronization.
* **Job Name:** `nightly-cf-problem-sync` (runs nightly at 2:00 AM, or triggers instantly on startup if the database is empty).
* **Worker Limiter:** Restricts execution to a maximum of 2 jobs per second (`limiter: { max: 2, duration: 1000 }`).
* **Default Job Options:**
  ```javascript
  {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    }
  }
  ```

### `reconciliation_queue`
* **Purpose:** Reconciles active contest and room state logic.
* **Default Job Options:**
  ```javascript
  {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000
    }
  }
  ```

---

## 3. SSE Channel Conventions

The Server-Sent Events (SSE) gateway dynamically subscribes connected clients to Redis Pub/Sub channels based on active room memberships:

1. **User Channel:** `events:user:${userId}`
   * Private user-targeted events (e.g. notifications, private status).
2. **Room Channel:** `events:room:${roomId}`
   * Shared room-scoped events (e.g. participant presence, round starting).
3. **Contest Channel:** `events:contest:${contestId}`
   * Contest-wide updates (e.g. real-time leaderboard or standings updates).

---

## 4. Event Name Catalogue

### Gateway Events (SSE Format)
When client-side listeners establish a `/api/events` connection, the following event streams are handled:

* **Event Type:** `connected`
  * Sent immediately on connection.
  * **Payload:**
    ```json
    {
      "userId": "65ab...",
      "subscribedChannels": [
        "events:user:65ab...",
        "events:room:76bc...",
        "events:contest:87cd..."
      ]
    }
    ```
* **Event Type:** `message`
  * Forwarded dynamically from active channel subscriptions.
  * **Payload:**
    ```json
    {
      "channel": "events:room:76bc...",
      "payload": {
        "type": "presence.online",
        "userId": "65ab..."
      }
    }
    ```

---

### Presence Broadcast Events
Published on `events:room:${roomId}` to broadcast participant availability:

* `presence.online`: Sent when the user starts an SSE stream or joins.
  ```json
  { "type": "presence.online", "userId": "string" }
  ```
* `presence.offline`: Sent immediately upon clean SSE disconnect, or triggered via keyspace listener upon the 90-second presence key expiration.
  ```json
  { "type": "presence.offline", "userId": "string" }
  ```

---

### Background / Cron Job Catalog
Scheduled and tracked in the standalone worker (Agenda / BullMQ):

| Job Name | Engine | Schedule | Target/Function |
| :--- | :---: | :--- | :--- |
| `nightly-cf-problem-sync` | BullMQ | `0 2 * * *` (Daily 2am) | `syncCodeforcesProblems()` |
| `sync-cf-ratings` | Agenda | Every 6 hours | `syncCodeforcesRatings()` |
| `sync-ac-ratings` | Agenda | Every 6 hours | `syncAtCoderRatings()` |
| `sync-potd-submissions` | Agenda | Daily at 2:05 AM IST | `syncPOTDSubmissions()` |
| `sync-contests` | Agenda | Every 3 hours | `syncContests()` |
| `cleanup-images` | Agenda | Weekly, Sun 3:00 AM IST | `cleanupOrphanedImages()` |
| `hackathon-deadline-reminders` | Agenda | Every 1 hour | `sendHackathonDeadlineReminders()` |
| `potd-reminders` | Agenda | Every 1 hour | `sendPOTDReminders()` |

---

## 5. Future Roadmap Notes

> [!NOTE]
> User profiles under the `CPUser` model and their corresponding `solvedProblems` lists are planned to be updated during the user registration process, which will be implemented later in **Stage 6A**.

## 6. Cooldown UI Contract

The synchronization endpoint `POST /api/contests/sync` enforces a strict 60-second cooldown per user via the Redis key `ratelimit:sync:<userId>`. 
The server is always authoritative for this rate limit. The frontend client may mirror this 60s countdown in the UI (e.g., disabling the Sync button and showing a timer), but it must gracefully handle HTTP 429 responses if the server-side limit is still active.

## 7. Internal Event Shape (`sync.detected`)

When the CF Sync Engine successfully validates an Accepted (AC) submission matching the validation matrix, it emits the internal `sync.detected` event.

* **Payload Shape:**
  ```json
  {
    "type": "sync.detected",
    "roomId": "string",
    "userId": "string",
    "teamId": "string",
    "problemId": "string",
    "cfSubmissionId": 123456789,
    "cfTimestamp": 1690000000000,
    "verdict": "OK",
    "pointsAwarded": null
  }
  ```
* **Note:** `pointsAwarded` is initially `null`. The Room Engine (Stage 3) consumes this event, assigns the correct score based on time and penalties, and then broadcasts the finalized points to the contest streams.

