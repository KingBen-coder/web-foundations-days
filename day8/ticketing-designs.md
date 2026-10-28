# TicketHub Design

## 1. Requirements
**Functional:** login; search events; view seat map; hold seats for 5 min; pay; get tickets; view my tickets; waiting room for big sales.

**Non-functional:**
- Correctness: a seat is never sold twice; a paid order is never lost.
- Speed: pages under 300 ms, seat hold under 1 s.
- Fairness: first come first served, max 4 tickets per order, bots limited.
- Scale: survive about 575x normal traffic; 99.9% availability.

## 2. Estimates
**Normal day:** 50,000 x 10 pages = 500,000 views/day = 5.8 req/s (peak 5x = 29/s). 5,000 sales/day = 0.06/s. Reads to sales = 100:1 (read-heavy). Storage is tiny (about 2 GB/year).

**Big sale** (assume 10 requests per user, half arrive in minute 1): 200,000 users for 20,000 seats = 10 buyers per seat.
- Average: 200,000 x 10 / 600 s = 3,300 req/s
- Peak (minute 1): 100,000 x 10 / 60 s = 16,700 req/s
- Sales: 20,000 / 600 s = 33/s

**Comparison:** about 575x normal load, and 20,000 tickets in 10 minutes is 4x a whole normal day. The hard part is concurrency (many people fighting for the same seats), not storage.

## 3. API
| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | /api/events?query= | Search events | 200 |
| GET | /api/events/{id}/seats | Seat map | 200 |
| POST | /api/events/{id}/queue | Join waiting room | 202 |
| POST | /api/events/{id}/holds | Hold seats | 201 |
| DELETE | /api/holds/{id} | Release hold | 204 |
| POST | /api/orders | Pay for a hold | 201 |
| GET | /api/me/tickets | My tickets | 200 |

Hold body: `{"seatIds": [1201, 1202]}`. Pay body: `{"holdId": 9001, "paymentToken": "tok_1"}` plus an `Idempotency-Key` header.
Errors: 401 not logged in, 403 not admitted yet, 409 seat taken, 410 hold expired, 402 payment declined, 429 too many requests.

## 4. Data model
- **users**(id PK, name, email UNIQUE NOT NULL, password_hash)
- **events**(id PK, title, venue, starts_at)
- **seats**(id PK, event_id FK, section, row_label, seat_number, price_cents, status available/held/sold, hold_id FK NULL, UNIQUE(event_id, section, row_label, seat_number))
- **holds**(id PK, user_id FK, event_id FK, expires_at, status)
- **orders**(id PK, user_id FK, hold_id FK, total_cents, status, idempotency_key UNIQUE)
- **tickets**(id PK, order_id FK, seat_id FK UNIQUE, qr_code)

Relationships: event has many seats; user has many holds and orders; hold covers many seats; order has many tickets; each ticket has one seat (users and seats are many-to-many via tickets).

## 5. Preventing double-booking
1. **Atomic hold in a transaction:**
```sql
BEGIN;
UPDATE seats SET status='held', hold_id=:hold
WHERE id IN (:s1,:s2) AND status='available';
-- fewer rows updated than requested? ROLLBACK, return 409
COMMIT;
```
The UPDATE row-locks each seat. A concurrent buyer waits, re-checks the status, finds `held`, updates 0 rows and gets 409. Check and change are one atomic statement (no read-then-write race), and multi-seat holds are all or nothing. READ COMMITTED isolation is enough thanks to the row lock.
2. **Holds expire** after 5 minutes (a worker frees them), except during payment.
3. **Hold first, pay second.** The order transaction re-checks the hold, inserts the order and tickets, marks seats `sold`, and commits together.
4. **Last safety net:** `tickets.seat_id` is UNIQUE, so a second sale of a seat fails and rolls back.
5. **Idempotency-Key** is UNIQUE, so retries never create a second order or charge.
6. The cache is only a hint; the database decides.

## 6. Architecture
```text
Users -> CDN + WAF -> Load Balancer -> Waiting Room (Redis)
      -> App Servers (xN), which talk to:
           |-- Cache (Redis) --(miss)--> Read Replica
           |-- DB Primary (all writes) --(replication)--> Read Replica
           |-- Payment Provider
           '-- Message Queue -> Workers (email, QR, free holds) -> Object Storage
```
- **CDN + WAF:** serves pages/images near users and blocks bots, so most traffic never reaches us.
- **Load balancer:** spreads requests across app servers.
- **Waiting room:** admits only a limited number of shoppers at a time, so the database never sees 200,000 at once.
- **App servers:** stateless API logic that auto-scales.
- **Cache:** serves the seat map (refreshed every 1-2 s), so refreshes skip the database.
- **DB primary:** source of truth; transactions and row locks stop double-booking.
- **Read replica:** answers browsing queries.
- **Payment provider:** handles card data.
- **Queue and workers:** send emails/QR codes and free expired holds in the background.
- **Object storage:** images and ticket PDFs.

**Surviving the big sale:** servers are pre-scaled; the CDN and waiting room absorb the 200,000 users; the cache serves the seat-map reads; only holds and orders reach the primary, at a rate the waiting room controls; after sell-out, the cache answers "sold out". If needed, shard by event_id.

## 7. Trade-offs
- **Consistency vs scale:** one primary with locks is correct but a bottleneck; double-selling is worse than being slower.
- **Fairness vs convenience:** the waiting room protects the system but makes people wait; a random draw in minute 1 beats pure first come first served.
- **Cache speed vs freshness:** a cached seat map is fast but may show a taken seat; the database then answers 409.
- **Hold length:** 5 minutes frees abandoned seats quickly but may rush slow payers.
