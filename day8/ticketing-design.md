# TicketHub: Event Ticketing System Design

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part design framework: (1) requirements, (2) estimates, (3) API, (4) data model, (5) architecture, and (6) trade-offs. It also explains in detail how two people are prevented from buying the same seat.

## Starting facts

- 2 million registered users
- A normal day: 50,000 people visit, each viewing 10 pages, and 5,000 tickets are sold
- A very popular concert on sale: 200,000 people try to buy its 20,000 seats within the first 10 minutes

---

## Part 1: Requirements

### Functional requirements

- Users can **register and log in**.
- Users can **browse and search events** (by name, city, date).
- Users can **view an event** and its **seat map** with live availability and prices.
- Users can **hold seats temporarily** (for example, 5 minutes) while they pay.
- Users can **pay** for the held seats.
- Users receive a **confirmation and tickets** (with a QR code) by email and in the app.
- Users can **view their tickets** and past orders.
- Users can **release** held seats if they change their mind.
- For high-demand sales, users enter a **virtual waiting room** before they can buy.

### Non-functional requirements

- **Correctness (most important):** A seat must never be sold to two people. A customer must never be charged for a seat they do not get, and a paid order must never be lost.
- **Speed:** Browsing pages load in under 300 ms for most requests. The seat map loads in under 500 ms. Holding a seat gives an answer in under 1 second.
- **Fairness:** Buyers get a fair chance, roughly first come, first served. Bots and one person grabbing a large number of seats are limited (for example, a maximum of 4 tickets per order).
- **Scalability:** The system must handle a sudden jump of several hundred times normal traffic during a big sale.
- **Availability:** The site stays up (target 99.9%) and degrades gracefully under load instead of crashing. Browsing keeps working even if payments are slow.
- **Durability:** Once an order is confirmed, it is stored safely and survives crashes.
- **Security:** HTTPS everywhere, hashed passwords, and card details handled by a payment provider so TicketHub never stores them.

---

## Part 2: Estimates

### Normal day

- Page views per day = 50,000 visitors × 10 pages = **500,000 page views/day**
- Average = 500,000 ÷ 86,400 seconds ≈ **5.8 requests/second**
- Peak (5× average) ≈ **29 requests/second**
- Tickets sold = 5,000/day ÷ 86,400 ≈ **0.06 sales/second** (about 1 sale every 17 seconds)
- Reads to purchases = 500,000 : 5,000 = **100 : 1**, so a normal day is **read-heavy**.
- Storage: 5,000 tickets/day × 365 ≈ 1.8 million tickets/year. At about 1 KB per ticket row that is only **about 2 GB/year**. Storage is not the challenge; **concurrency** is.

### Big sale (popular concert)

Assumptions: each of the 200,000 users makes about 10 requests (open the event, load the seat map, refresh it several times, try to hold seats), tries to hold seats about 2 times, and half of them arrive in the first minute.

- Competition: 200,000 users for 20,000 seats = **10 users for every seat**, so at least 90% of people will not get a ticket.
- Average load over 10 minutes (600 s) = 200,000 × 10 ÷ 600 ≈ **3,300 requests/second**
- First-minute peak = 100,000 users × 10 ÷ 60 s ≈ **16,700 requests/second**
- Seat-hold attempts: 400,000 ÷ 600 ≈ **670/second** on average, and about **3,300/second** in the first minute
- Successful sales = 20,000 ÷ 600 ≈ **33 sales/second**

### Comparison

| Measure | Normal day | Big sale | Increase |
|---|---|---|---|
| Requests per second (average) | 5.8 | 3,300 | about 575× |
| Requests per second (peak) | 29 (5× peak) | 16,700 (first minute) | about 575× |
| Ticket sales per second | 0.06 | 33 | about 575× |
| Tickets sold | 5,000 per day | 20,000 in 10 minutes | 4× a whole normal day, in 10 minutes |
| Nature of load | Spread out, mostly reads | A sudden burst, with thousands of people fighting over the same 20,000 rows | |

**What this tells us:** Normal days are easy for one small system. The big sale is a rare spike roughly 575× larger, and the hard part is not storage but **many people trying to change the same seats at the same moment**. The design must scale reads cheaply (cache, CDN) and make the seat-booking write path both **safe** and **protected from overload** (waiting room, rate limits).

---

## Part 3: API

All endpoints use JSON over HTTPS. Endpoints that need a logged-in user require an `Authorization` token.

| # | Method | Path | Description | Success code |
|---|---|---|---|---|
| 1 | `GET` | `/api/events?query=&city=&date=&page=` | Browse and search events | `200 OK` |
| 2 | `GET` | `/api/events/{eventId}` | View one event's details | `200 OK` |
| 3 | `GET` | `/api/events/{eventId}/seats` | View the seat map with availability and prices | `200 OK` |
| 4 | `POST` | `/api/events/{eventId}/queue` | Join the waiting room for a high-demand sale | `202 Accepted` |
| 5 | `POST` | `/api/events/{eventId}/holds` | Hold selected seats for 5 minutes | `201 Created` |
| 6 | `DELETE` | `/api/holds/{holdId}` | Release held seats | `204 No Content` |
| 7 | `POST` | `/api/orders` | Pay for a hold and create the order | `201 Created` |
| 8 | `GET` | `/api/me/tickets` | View my tickets | `200 OK` |
| 9 | `POST` | `/api/auth/login` | Log in and get a token | `200 OK` |

### Example request bodies

Hold seats (`POST /api/events/42/holds`):

```json
{
  "seatIds": [1201, 1202]
}
```

Hold response (`201 Created`):

```json
{
  "holdId": 9001,
  "expiresAt": "2026-11-20T18:05:00Z",
  "seatIds": [1201, 1202],
  "totalCents": 15000
}
```

Pay (`POST /api/orders`, with the header `Idempotency-Key: 7f3c-...`):

```json
{
  "holdId": 9001,
  "paymentToken": "tok_abc123"
}
```

### Error responses

- `401 Unauthorized`: not logged in.
- `403 Forbidden`: the user has not been admitted from the waiting room yet.
- `409 Conflict`: one or more seats were already taken (hold failed).
- `410 Gone`: the hold has expired.
- `402 Payment Required`: the payment was declined.
- `429 Too Many Requests`: the user is sending requests too fast, or tried to hold more than 4 seats.

---

## Part 4: Data model

### Tables

**users**
- `id` (PK), `name`, `email` (UNIQUE, NOT NULL), `password_hash`, `created_at`

**venues**
- `id` (PK), `name`, `city`, `capacity`

**events**
- `id` (PK), `venue_id` (FK to venues), `title`, `starts_at`, `sale_starts_at`, `status`

**seats** (one row per seat, for each event)
- `id` (PK), `event_id` (FK to events), `section`, `row_label`, `seat_number`, `price_cents`
- `status` (`available`, `held`, `sold`), `hold_id` (FK to holds, nullable)
- `UNIQUE (event_id, section, row_label, seat_number)`

**holds**
- `id` (PK), `user_id` (FK to users), `event_id` (FK to events), `created_at`, `expires_at`, `status` (`active`, `expired`, `released`, `converted`)

**orders**
- `id` (PK), `user_id` (FK to users), `event_id` (FK to events), `hold_id` (FK to holds), `total_cents`
- `status` (`pending`, `paid`, `failed`), `idempotency_key` (UNIQUE), `created_at`

**tickets**
- `id` (PK), `order_id` (FK to orders), `seat_id` (FK to seats, **UNIQUE**), `qr_code`

### Relationships

- One **venue** has many **events** (one-to-many).
- One **event** has many **seats** (one-to-many). 20,000 seat rows for the popular concert.
- One **user** has many **holds** and many **orders** (one-to-many).
- One **hold** covers one or more **seats** (one-to-many through `seats.hold_id`).
- One **order** has many **tickets** (one-to-many), and each ticket points to exactly one seat.
- **Users and seats** are many-to-many over time (a user can buy many seats, and a seat can be sold to only one user for an event). The `tickets` table, together with `orders`, links them.

### Indexes

- `seats (event_id, status)`: fast "show available seats for this event" queries.
- `holds (expires_at)`: lets the cleanup job quickly find expired holds.
- `tickets (seat_id)` UNIQUE: this one doubles as the final double-booking safeguard (see below).

---

## How TicketHub prevents two people buying the same seat

Double-booking is stopped by several layers, so that even if one layer fails another catches it. **The database is the single source of truth** for seat status, never the cache.

### 1. Atomic hold inside a transaction

When a user clicks "hold", the app runs one transaction that only succeeds if every requested seat is still available:

```sql
BEGIN;

UPDATE seats
SET status = 'held',
    hold_id = :new_hold_id
WHERE event_id = :event_id
  AND id IN (:seat1, :seat2)
  AND status = 'available';

-- If the number of rows updated is less than the number of seats requested,
-- another buyer got there first, so ROLLBACK and return 409 Conflict.

COMMIT;
```

- The `UPDATE` takes a **row lock** on each seat. If two buyers try the same seat at the same instant, the database makes the second one **wait** until the first transaction finishes.
- When the second transaction continues, it re-checks `status = 'available'`. The seat is now `held`, so **zero rows match** and the second buyer gets `409 Conflict`.
- Because the check and the change happen in **one atomic statement**, there is no gap between "is it free?" and "mark it taken" for another buyer to slip into. This is the key difference from a read-then-write approach, which has a race condition.
- Holding several seats is **all or nothing**: if any seat fails, the whole transaction rolls back and no seat is held (ACID: atomicity).

### 2. Holds expire

- A hold lasts 5 minutes (`expires_at`). A background worker (and a check when seats are read) returns expired holds to `available`, so abandoned seats are not locked forever.
- While a payment is being processed, the hold is marked `payment_in_progress` so the cleanup job does not release the seat in the middle of a payment.

### 3. Payment only happens after a valid hold

The order of operations is **hold first, pay second**. A user is only sent to pay for seats that are already reserved for them, so nobody pays for a seat that is gone.

### 4. Final purchase is also a transaction

`POST /api/orders` runs a second transaction that:
1. Checks that the hold belongs to this user and has not expired.
2. Creates the `order` and one `ticket` row per seat.
3. Changes the seats to `sold` and the hold to `converted`.
4. Commits everything together, or nothing at all.

### 5. A database constraint as the last line of defence

`tickets.seat_id` is `UNIQUE`. Even if a bug in the application code tried to sell the same seat twice, the database would reject the second insert with a constraint error, and the transaction would roll back. The rule is enforced by the data itself, not just by our code.

### 6. Idempotency

The `Idempotency-Key` on `POST /api/orders` (stored in a `UNIQUE` column) means that a double-click or a network retry creates **one** order and one charge, not two.

### 7. Caches are only a hint

The seat map shown to users may come from a cache that is a second or two old, so a user may click a seat that was just taken. That is fine: the hold request goes to the database, which gives the final answer, and the user sees "That seat was just taken. Please choose another."

---

## Part 5: Architecture

```text
                        +-------------------------+
                        |   Users (web / mobile)  |
                        +------------+------------+
                                     |
                                     v
                        +-------------------------+
                        |   CDN + WAF / rate limit|   <- static files, event pages,
                        +------------+------------+      images; blocks bots / abuse
                                     |
                                     v
                        +-------------------------+
                        |      Load Balancer      |
                        +------------+------------+
                                     |
                                     v
                        +-------------------------+
                        |  Waiting Room (queue)   |   <- admits a limited number of
                        |   (backed by Redis)     |      shoppers at a time
                        +------------+------------+
                                     |
              +----------------------+----------------------+
              |                      |                      |
              v                      v                      v
        +------------+         +------------+         +------------+
        | App Server |         | App Server |         | App Server |   (auto-scaling,
        |     1      |         |     2      |         |     N      |    stateless)
        +-----+------+         +-----+------+         +-----+------+
              |                      |                      |
              +----------+-----------+----------+-----------+
                         |                      |
          (reads)        |                      |      (seat holds, orders)
                         v                      v
                 +---------------+       +----------------+
                 |  Cache        |       | Database       |
                 |  (Redis)      |       | PRIMARY        |
                 |  seat map,    |       | (all writes,   |
                 |  event data   |       |  row locks)    |
                 +-------+-------+       +--------+-------+
                         |                        |
                  (cache miss)             (replication)
                         |                        |
                         v                        v
                 +-------------------------------------+
                 |          Read Replica(s)            |
                 +-------------------------------------+

        App servers also call:                     App servers also publish to:

        +---------------------+                    +----------------------+
        |  Payment Provider   |                    |    Message Queue     |
        |  (external, card)   |                    +----------+-----------+
        +---------------------+                               |
                                                              v
                                                 +--------------------------+
                                                 |  Workers                 |
                                                 |  - send emails / tickets |
                                                 |  - expire old holds      |
                                                 |  - generate QR codes     |
                                                 +------------+-------------+
                                                              |
                                                              v
                                                 +--------------------------+
                                                 |  Object Storage          |
                                                 |  (images, ticket PDFs)   |
                                                 +--------------------------+
```

### What each component does

- **CDN and WAF (rate limiting):** The CDN serves images, scripts and event pages from servers close to the user so most of the huge traffic never reaches our servers, and the firewall rules block bots and abusive request rates.
- **Load balancer:** It spreads requests evenly over the app servers so none is overloaded and a failed server is skipped.
- **Waiting room (queue):** It lets only a controlled number of shoppers (for example, a couple of thousand at a time) into the buying flow, so the database is never hit by all 200,000 people at once, and it gives everyone a fair place in line.
- **App servers:** They run the API logic (browse, hold, pay), and because they are stateless we can add many more of them automatically when the sale starts.
- **Cache (Redis):** It stores the event data and a seat map that is refreshed every second or two, so thousands of people refreshing the seat map do not each query the database. Redis also stores the waiting-room positions and rate-limit counters.
- **Database primary:** It is the single source of truth for seats, holds and orders, and its transactions and row locks are what make double-booking impossible.
- **Read replicas:** They answer browsing and search queries so the primary can focus on seat holds and orders.
- **Payment provider:** An external service handles card details and payment, so TicketHub does not store card data and the heavy security work is handled by a specialist.
- **Message queue:** It receives jobs such as "send confirmation email" so the buyer gets a fast response without waiting for slow work.
- **Workers:** They process queue jobs in the background (emails, QR codes) and release expired holds, and we can run more of them if the queue grows.
- **Object storage:** It stores event images and ticket PDFs cheaply and durably, away from the database.

### How the design survives the big sale

- **Before the sale:** The team pre-scales the app servers and warms the cache with the event and seat data. The event page and static content sit on the CDN.
- **At the start:** The 200,000 users hit the CDN and waiting room first, not the database. Only a limited number of shoppers are let in at once, which keeps the hold rate within what a single primary database can safely handle (a few thousand small writes per second).
- **During the sale:** Seat map reads (the biggest load, about 16,700 requests/second at peak) come from the cache, not the database. Only hold and order requests reach the primary, where row locks guarantee that each seat goes to one person.
- **When seats run out:** Once all 20,000 seats are held or sold, the system answers "sold out" instantly from the cache, so the 180,000 people who did not get a seat do not keep hammering the database.
- **If something is slow:** Emails and QR codes are handled by the queue and workers. If the payment provider is slow, held seats stay safe (`payment_in_progress`) and browsing is unaffected.
- **Scaling beyond this:** If we ran many big sales at once, the `seats` data could be split (sharded) by `event_id`, so each event has its own primary and one popular event cannot slow down the others.

---

## Part 6: Trade-offs

- **Strong consistency vs scale.** All seat holds and purchases go through one primary database with locks, so we get guaranteed correctness (no double-booking) but a possible bottleneck. We accept this because selling the same seat twice is far worse than being slightly slower, and we reduce the pressure with the waiting room and by sharding per event if needed. An eventually consistent store would be faster to scale but cannot guarantee that a seat goes to only one buyer.
- **Fairness and protection vs user convenience.** The waiting room protects the system and gives everyone an orderly chance, but people must wait and some will feel it is frustrating. We also have to choose how fairness works: strict first come first served favours people with the fastest connections and bots, while a random draw for everyone who joins in the first minute is fairer but less predictable. I would use a randomised order for the first minute and first come first served after that.
- **Hold length: short vs long.** A short hold (5 minutes) returns abandoned seats to the pool quickly, so more real buyers get a chance, but slow payers may lose their seats. A long hold is kinder to buyers but lets people (or bots) lock seats without buying. Five minutes is a middle ground, with the hold extended while a payment is in progress.
- **Cached seat map: speed vs freshness.** A cache that refreshes every second or two lets us serve thousands of seat-map views per second cheaply, but users will sometimes click a seat that was just taken and see an error. We accept this because the database makes the final decision and the message is friendly.
- **Asynchronous emails and tickets: responsiveness vs a short delay.** Sending confirmations through a queue keeps checkout fast, but the email may arrive seconds later, and we must run and monitor extra infrastructure (queue and workers).

---

## Summary

TicketHub is read-heavy on a normal day (about 6 requests/second) but turns into a seat-contention problem during a big sale (about 575× more traffic, 10 buyers per seat). The design uses a CDN, waiting room, cache and read replicas to absorb the reads, and a single primary database with atomic transactions, expiring holds and a `UNIQUE (seat_id)` constraint on tickets so that **no seat can ever be sold twice**.
