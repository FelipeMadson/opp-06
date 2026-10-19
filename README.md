# Idempotent Worker Guard

Deterministic idempotency locking and duplicate execution mitigation for asynchronous worker pools, background task processors, and payment gateways.

[![CI](https://github.com/FelipeMadson/opp-06/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeMadson/opp-06/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*Read this in [Português](README.pt-BR.md).*

---

## Overview

In distributed architectures and asynchronous task queues (e.g., BullMQ, Celery, SQS, Kafka), duplicate events frequently occur due to network retries, broker re-deliveries, or worker timeouts. Processing financial transactions, balance debits, or third-party webhooks without strict idempotency guarantees causes double-charging and inconsistent state.

`Idempotent Worker Guard` provides a lightweight, resilient coordination primitive featuring:
- **Atomic Lease Acquisition**: Prevents concurrent duplicate processing across multiple worker instances.
- **Automatic Crash Recovery**: Automatically reclaims abandoned leases if a worker crashes before completion.
- **Deterministic Replay**: Caches the final outcome, instantly returning the cached result to duplicate callers without re-executing side effects.
- **Strict Lease Ownership Verification**: Ensures only the lease-holding worker can transition a task to `completed` or `failed`.

---

## Installation & Architecture

```bash
# Clone the repository
git clone https://github.com/FelipeMadson/opp-06.git
cd opp-06

# Run test suite
npm test
```

### State Transition Diagram

```text
       [Initial]
           |
        acquire()
           |
           v
     [PROCESSING] -------(lease expired)-------> [PROCESSING] (attempts + 1)
       /        \
      /          \
 complete()     fail()
    /              \
   v                v
[COMPLETED]       [FAILED]
   |                 |
acquire()         acquire()
   |                 |
   v                 v
 (replay)        (retry / proceed)
```

---

## Usage Example

```typescript
import { IdempotencyGuard } from './src/index.ts';

const guard = new IdempotencyGuard();
const scope = 'billing';
const key = 'invoice_84920';
const workerId = 'worker-node-04';

// 1. Attempt to acquire lease
const acquisition = guard.acquire<{ status: string; chargeId: string }>(
  scope,
  key,
  workerId,
  15000 // 15-second lease
);

if (acquisition.action === 'replay') {
  console.log('Duplicate request detected. Returning cached result:', acquisition.record?.result);
} else if (acquisition.action === 'busy') {
  console.warn('Another worker is currently processing this invoice. Retry later.');
} else {
  try {
    // 2. Perform external payment call
    const paymentResult = { status: 'succeeded', chargeId: 'ch_live_9203' };

    // 3. Complete atomically
    guard.complete(scope, key, workerId, paymentResult);
  } catch (err) {
    guard.fail(scope, key, workerId, (err as Error).message);
  }
}
```

---

## Security & Verification

- **SHA-Pinned Actions**: All CI jobs use exact commit hashes.
- **Zero External Dependencies**: Pure Node.js and TypeScript runtime without vulnerability vectors.
- **Comprehensive Unit Testing**: High-concurrency race condition and crash-replay test coverage.

## License

MIT © [Felipe Madison](https://github.com/FelipeMadson)
