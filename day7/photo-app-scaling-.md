# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

- Registered users: **10,000,000**
- Daily active users (DAU): **10%** of registered users
- Each active user uploads **1 photo per day**
- Each active user views **50 feed pages per day**
- Average photo size: **2 MB**
- Thumbnail size: **50 KB** per photo
- One day has **86,400 seconds**
- Peak traffic is **5×** the average
- 1 TB = 1,000,000 MB (decimal units, to keep the arithmetic simple)
- Photo metadata (caption, owner, timestamps) is tiny compared with the photo files, so it is ignored in the storage estimate

### Daily active users

- DAU = 10,000,000 × 10% = **1,000,000 users per day**

## 2. Estimates

### Uploads per second

- Uploads per day = 1,000,000 users × 1 photo = **1,000,000 uploads/day**
- Average = 1,000,000 ÷ 86,400 ≈ **12 uploads/second**
- Peak (5×) ≈ 12 × 5 ≈ **58 uploads/second**

### Feed views per second

- Feed views per day = 1,000,000 users × 50 = **50,000,000 views/day**
- Average = 50,000,000 ÷ 86,400 ≈ **579 views/second**
- Peak (5×) ≈ 579 × 5 ≈ **2,900 views/second**

### Photo storage per year

- Originals per day = 1,000,000 × 2 MB = 2,000,000 MB = **2 TB/day**
- Thumbnails per day = 1,000,000 × 50 KB = 50 GB/day
- Total per day = 2 TB + 0.05 TB = **2.05 TB/day**
- Per year = 2.05 TB × 365 ≈ **748 TB/year** (about 0.75 PB)
  - Originals: 2 TB × 365 = 730 TB
  - Thumbnails: 0.05 TB × 365 ≈ 18 TB

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**.

- Reads (feed views) are about 50 million per day, and writes (uploads) are about 1 million per day.
- That is roughly **50 reads for every 1 write**.

What this means for the design:

- Make reads fast and cheap: serve photos through a **CDN**, keep hot data in a **cache**, and spread database reads across **read replicas**.
- Writes are fewer, so a single primary database can handle them for a long time.
- Slow work on the write path (such as making thumbnails) should be moved to a **background queue** so uploads stay quick.
- Storage still grows very fast (about 748 TB per year), so the photo files need cheap, practically unlimited storage.

## 4. Why photos should not be stored in the database

- Photos are large binary files, and about 748 TB per year would make the database huge, slow to query and expensive to back up and replicate.
- Database storage is costly and designed for small structured rows, not for large files.
- Serving images through the database would use up database connections and bandwidth that should be used for queries.
- A database cannot serve files through a CDN as easily as object storage can.

**Where they go instead:** photo files go in **object storage** (such as Amazon S3 or Google Cloud Storage), which is cheap, durable and scales almost without limit. The database stores only the photo's **metadata**, including the URL or key that points to the file in object storage.

## 5. Architecture diagram

```text
                          +----------------------+
                          |   Users (phone/web)  |
                          +----------+-----------+
                                     |
                +--------------------+--------------------+
                |                                         |
        (view photos)                          (feed + upload requests)
                |                                         |
                v                                         v
        +---------------+                       +------------------+
        |      CDN      |                       |  Load Balancer   |
        +-------+-------+                       +--------+---------+
                |                                        |
        (cache miss only)                  +-------------+-------------+
                |                          |             |             |
                |                          v             v             v
                |                     +---------+   +---------+   +---------+
                |                     | App     |   | App     |   | App     |
                |                     | Server 1|   | Server 2|   | Server N|
                |                     +----+----+   +----+----+   +----+----+
                |                          |             |             |
                |            +-------------+------+------+------+------+
                |            |                    |             |
                |            v                    v             v
                |      +-----------+      +----------------+  +-------------------+
                |      |   Cache   |      |    Database    |  |  Message Queue    |
                |      |  (Redis)  |      |    (Primary)   |  | (thumbnail jobs)  |
                |      +-----------+      +-------+--------+  +---------+---------+
                |                                 |                     |
                |                        (replication)                  v
                |                                 |            +-------------------+
                |                                 v            | Thumbnail Worker  |
                |                         +---------------+    | (1..N instances)  |
                |                         | Read Replica  |    +---------+---------+
                |                         | (feed reads)  |              |
                |                         +---------------+              |
                |                                                        |
                |            +-------------------------------------------+
                |            |       (read original, write thumbnail)
                v            v
        +-------------------------------+
        |        Object Storage         |
        | (original photos + thumbnails)|
        +-------------------------------+

 App servers also write original photos to Object Storage on upload.
```

## 6. Components and the problem each one solves

- **CDN:** It delivers photos and thumbnails from servers close to the user, so images load quickly and most photo traffic never reaches our own servers.
- **Load balancer:** It spreads incoming requests evenly across many app servers, so no single server is overloaded and one failing server does not take the app down.
- **App servers:** They run the application logic (login, upload, feed building), and because they are stateless we can add more of them as traffic grows.
- **Cache (Redis):** It keeps frequently read data, such as feed results and photo metadata, in memory so the database is asked far less often.
- **Database (primary):** It stores users, follows, photo metadata and captions reliably, and is the single place where writes happen.
- **Read replica:** It is a copy of the primary that answers feed read queries, so the heavy read traffic does not slow down writes.
- **Object storage:** It stores the huge number of photo files cheaply and durably, so the database stays small and fast.
- **Message queue:** It holds thumbnail jobs so the upload request can finish immediately instead of waiting for slow image processing.
- **Thumbnail worker:** It picks jobs from the queue and creates the 50 KB thumbnails in the background, and we can run more workers if the queue grows.

## 7. Upload flow, step by step

1. The user selects a photo in the app and taps **Upload**. The client sends the request (over HTTPS) to SnapShare.
2. The **load balancer** receives the request and forwards it to one of the **app servers**.
3. The app server checks that the user is logged in and validates the file (allowed type, maximum size).
4. The app server saves the **original photo (about 2 MB) to object storage** and gets back a file key/URL. (At larger scale the app server can instead issue a short-lived **pre-signed URL**, so the phone uploads the file straight to object storage and the 2 MB never passes through the app server. The client then tells the app server the upload is done, and steps 5 to 11 continue as below.)
5. The app server writes a **metadata row** to the **primary database** (photo id, owner, caption, original file URL, time, status = `processing`).
6. The app server puts a **thumbnail job** on the **queue** (for example `{photo_id, original_url}`).
7. The app server immediately returns **success (201 Created)** to the user, so the upload feels fast.
8. A **thumbnail worker** takes the job from the queue, downloads the original from object storage, and creates a **50 KB thumbnail**.
9. The worker saves the thumbnail to object storage, then updates the database row with the thumbnail URL and sets status = `ready`.
10. The worker (or app) **invalidates or updates the cache** so followers' feeds can include the new photo.
11. When followers open their feed, the app reads the feed data from the **cache or read replica**, and the thumbnails and photos are delivered through the **CDN**.

If a worker fails part-way, the job stays on the queue (or goes back to it) and is retried, so no photo is left without a thumbnail.

## 8. Trade-offs

- **Cache: speed vs fresh data.** The cache makes feeds very fast and protects the database, but cached data can be slightly out of date. For example, a deleted photo or a new follow might not show up until the cache entry expires or is invalidated. Cache invalidation is also extra complexity to get right.
- **Read replica: scale vs consistency.** The replica lets us handle many more feed reads, but replication has a small delay (replication lag). A user might upload a photo and not see it in their own feed for a moment. We can reduce this by reading the user's own recent uploads from the primary.
- **Asynchronous thumbnails: fast uploads vs a short delay.** Using a queue makes the upload response quick and lets us absorb upload spikes. The cost is that the thumbnail is not ready instantly, so for a few seconds the app may show a placeholder, and we must run and monitor extra infrastructure (queue and workers).
- **Object storage + CDN: low cost and scale vs complexity.** Storing 748 TB per year in a database would be far too costly, and the CDN removes load from our servers. In return, we now manage several systems, pay for storage and CDN bandwidth, and must keep the database metadata and the stored files consistent (for example, cleaning up files if a database write fails).
- **Direct upload via pre-signed URL vs upload through the app server: scale vs simplicity.** Letting the client upload straight to object storage keeps heavy 2 MB transfers off the app servers and lets them handle more requests. The cost is an extra round trip, more client logic, and a need to confirm the upload really finished (and to clean up files that never get a database row). Uploading through the app server is simpler and lets us validate the file first, but it ties up app server bandwidth, so I would start there and move to pre-signed URLs as uploads grow.
- **Storing thumbnails as well as originals: more storage vs faster feeds.** Thumbnails add about 18 TB per year, but they make feed pages much smaller and faster to load than if every feed view downloaded a full 2 MB photo.
