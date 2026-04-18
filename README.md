# ton-worker-experthub

Separate TON Worker service for Expert Hub booking escrow contract preparation and contract actions.

This service exists because the main Expert Hub backend is Rust, while TON contract tooling, Blueprint artifacts, and TON SDK integration are Node.js / TypeScript based.

The worker is intentionally separate from the Rust backend.

---

## Purpose

The TON Worker is responsible for TON-specific mechanics only:

- loading the compiled `BookingEscrow` contract artifact
- preparing unique per-booking contract deployment data
- returning deterministic contract address and StateInit data
- sending controller/admin action messages to deployed escrow contracts
- later reading contract state if needed

The TON Worker does **not** own marketplace business logic.

The Rust backend owns:

- experts
- customers
- bookings
- payments
- Telegram identity
- Google Calendar availability
- session outcome decisions
- database state
- review flow

The TON Worker only executes contract mechanics requested by the Rust backend.

---

## Deployment model

The worker should run as a separate Docker container on the same internal Docker network as the Rust backend.

High-level architecture:

```text
Expert Hub Rust backend
  -> creates booking/payment drafts
  -> calls TON Worker over internal HTTP
  -> stores returned contract data in DB
  -> controls booking/payment lifecycle

TON Worker container
  -> loads compiled BookingEscrow contract artifact
  -> prepares unique contract deployment data per booking
  -> sends controller/admin actions to contracts

Frontend / TON Connect
  -> asks customer wallet to deploy and fund the prepared contract
```

The worker should not be exposed as a public browser-facing route.

The Rust backend should call it through an internal URL:

```env
TON_WORKER_BASE_URL=http://ton-worker:8081
```

---

## Current project structure

Important files:

```text
src/server.ts
src/service.ts
src/dto.ts
src/ton.ts
src/config.ts
contracts/booking_escrow.tolk
wrappers/BookingEscrow.ts
wrappers/BookingEscrow.compile.ts
build/BookingEscrow.compiled.json
```

The compiled contract artifact is:

```text
build/BookingEscrow.compiled.json
```

It is produced by:

```bash
npx blueprint build BookingEscrow
```

This artifact is not a deployed contract.

It is reusable compiled contract code. A real contract instance is created later by combining the compiled code with per-booking initial data.

---

## Contract uniqueness

Each booking escrow contract address is deterministic.

TON derives the address from:

```text
compiled contract code + initial contract data + workchain
```

So the same compiled contract code can create many unique booking contracts.

Example:

```text
Booking #1 + contract code -> contract address A
Booking #2 + contract code -> contract address B
```

The worker prepares this unique address before deployment.

The contract becomes real only when the customer wallet sends a transaction with `stateInit`.

---

## Current BookingEscrow contract

The current smart contract is:

```text
contracts/booking_escrow.tolk
```

It is a per-booking escrow contract.

Current stored data:

```text
amountNanoTon

state
fundedAtUnix
finalizedAtUnix

customerRatingForExpert
expertRatingForCustomer

parties:
  customerWallet
  expertWallet
  controllerWallet

meta:
  bookingId
  expertTelegramId
  customerTelegramId
  slotStartUnix
  expertConfirmationDeadlineUnix
  sessionOutcomeDeadlineUnix
```

Current contract states:

```text
STATE_AWAITING_FUNDING = 0
STATE_FUNDED_WAITING_EXPERT = 1
STATE_WAITING_SESSION = 2
STATE_PAID_TO_EXPERT = 3
STATE_REFUNDED_TO_CUSTOMER = 4
```

Current contract actions:

```text
expert_confirm
expert_decline
session_connected
customer_no_show
expert_no_show
set_customer_rating
set_expert_rating
```

Current payout rules:

```text
expert_decline    -> refund customer
expert_no_show    -> refund customer
session_connected -> pay expert
customer_no_show  -> pay expert
```

Ratings are stored directly in the escrow contract as small `uint8` values:

```text
customerRatingForExpert: 0 = not submitted, 1..5 = rating
expertRatingForCustomer: 0 = not submitted, 1..5 = rating
```

Ratings can be written only after the contract is finalized, and each rating can be written only once.

---

## Internal authentication

Internal requests use:

```http
x-ton-worker-token: {TON_WORKER_AUTH_TOKEN}
```

If `TON_WORKER_AUTH_TOKEN` is configured, requests without the matching header should be rejected.

---

## API

### Health

```http
GET /health
```

Example response:

```json
{
  "ok": true,
  "service": "ton-worker",
  "network": "testnet"
}
```

---

## Prepare booking contract

```http
POST /contracts/prepare-booking
```

This endpoint is called by the Rust backend after creating a booking/payment draft.

Request shape:

```json
{
  "booking_id": 1,
  "payment_id": 1,
  "customer_telegram_id": 111111,
  "expert_telegram_id": 222222,
  "customer_wallet": "EQ...",
  "expert_wallet": "EQ...",
  "controller_wallet": "EQ...",
  "amount_nano_ton": "100000000",
  "slot_start_unix": 1760000000,
  "expert_confirmation_deadline_unix": 1760086400,
  "session_outcome_deadline_unix": 1760090000
}
```

Response shape:

```json
{
  "contract_address": "EQ...",
  "state_init_boc": "te6cck...",
  "amount_nano_ton": "250000000",
  "recommended_gas_buffer_nano_ton": "150000000",
  "total_deploy_value_nano_ton": "250000000"
}
```

Meaning:

- `contract_address` — deterministic address of the future booking escrow contract
- `state_init_boc` — serialized TON StateInit
- `amount_nano_ton` — total amount customer wallet should send
- `recommended_gas_buffer_nano_ton` — extra amount added for deploy/gas buffer
- `total_deploy_value_nano_ton` — explicit total value for readability

The frontend later uses this response with TON Connect:

```js
await tonConnectUi.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
        {
            address: result.contract_address,
            amount: result.amount_nano_ton,
            stateInit: result.state_init_boc
        }
    ]
});
```

When the customer approves this transaction in the wallet, TON deploys and funds the contract.

---

## Contract action

```http
POST /contracts/{contract_address}/action
```

This endpoint is called by the Rust backend when the backend has decided what should happen next.

The worker does not decide whether the expert or customer showed up. It only executes the requested contract action.

Example payloads:

```json
{
  "payment_id": 1,
  "booking_id": 1,
  "action": "expert_confirm"
}
```

```json
{
  "payment_id": 1,
  "booking_id": 1,
  "action": "expert_decline",
  "reason": "expert rejected the slot"
}
```

```json
{
  "payment_id": 1,
  "booking_id": 1,
  "action": "session_connected"
}
```

```json
{
  "payment_id": 1,
  "booking_id": 1,
  "action": "expert_no_show"
}
```

```json
{
  "payment_id": 1,
  "booking_id": 1,
  "action": "set_customer_rating",
  "rating": 5
}
```

Supported actions:

```text
expert_confirm
expert_decline
session_connected
customer_no_show
expert_no_show
set_customer_rating
set_expert_rating
```

Response shape:

```json
{
  "contract_address": "EQ...",
  "action": "expert_confirm",
  "ok": true
}
```

---

## Intended main-app booking flow

The main Expert Hub backend should integrate with TON Worker like this:

1. Customer selects a slot on `/e/{slug}`
2. Rust backend creates booking/payment draft
3. Rust backend calls:

```http
POST /contracts/prepare-booking
```

4. Rust backend stores:
    - `contract_address`
    - `state_init_boc`
    - `amount_nano_ton`
    - payment status such as `waiting_customer_payment`
5. Frontend opens TON Connect payment using `contract_address` + `state_init_boc`
6. Customer approves wallet transaction
7. Backend verifies contract deployment/funding
8. Backend marks payment as funded
9. Backend asks expert to confirm the slot
10. If expert confirms:
    - backend calls worker action: `expert_confirm`
    - booking becomes active / waiting for session
11. If expert declines:
    - backend calls worker action: `expert_decline`
    - contract refunds customer
    - booking becomes rejected / refunded
12. Telegram watcher later detects consultation outcome
13. Backend calls worker action:
    - `session_connected` -> pay expert
    - `customer_no_show` -> pay expert
    - `expert_no_show` -> refund customer
14. After finalization, backend can submit ratings:
    - `set_customer_rating`
    - `set_expert_rating`

---

## Main Rust integration target

Expected Rust-side service structure:

```text
src/services/ton/
  mod.rs
  dto.rs
  client.rs
  controller.rs
```

Expected Rust-side responsibilities:

- build prepare-booking payload from booking/payment/expert/customer data
- call TON Worker prepare endpoint
- persist returned contract address and StateInit data
- expose payment data to frontend
- verify customer payment/deployment after TON Connect success
- call TON Worker action endpoint for expert/session outcomes
- update local bookings/payments state after successful actions

The main DB already has a useful base:

```text
payments.status
payments.contract_address
payments.transaction_ref
bookings.status
bookings.slot_start
bookings.slot_end
bookings.requested_by_telegram_id
bookings.requested_by_ton_wallet
```

Next main integration milestone:

```text
Connect Rust booking/payment draft creation to:
POST /contracts/prepare-booking
```

Then pass returned `contract_address`, `state_init_boc`, and `amount_nano_ton` to frontend TON Connect payment flow.

---

## Environment

Main Rust backend:

```env
TON_WORKER_BASE_URL=http://ton-worker:8081
TON_WORKER_AUTH_TOKEN=local-dev-token
TON_CONTROLLER_WALLET=EQ...
```

TON Worker:

```env
PORT=8081
TON_WORKER_AUTH_TOKEN=local-dev-token
TON_NETWORK=testnet
TON_RPC_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
TON_API_KEY=
TON_CONTROLLER_MNEMONIC=replace_with_24_words
BOOKING_ESCROW_ARTIFACT_PATH=build/BookingEscrow.compiled.json
```

Depending on implementation version, the worker may load the compiled contract as:

```env
BOOKING_ESCROW_CODE_BOC=...
```

or by artifact path:

```env
BOOKING_ESCROW_ARTIFACT_PATH=build/BookingEscrow.compiled.json
```

Keep this consistent with `src/config.ts`.

---

## Run locally

```bash
docker compose up --build
```

Expected worker port:

```text
8081
```

Health check:

```bash
curl http://127.0.0.1:8081/health
```

If auth token is enabled:

```bash
curl -H "x-ton-worker-token: local-dev-token" http://127.0.0.1:8081/health
```

---

## Current milestone

Current milestone achieved:

- separate TON Worker project exists
- worker runs in Docker
- BookingEscrow contract exists in Tolk
- contract compiles successfully with Blueprint
- worker can prepare a unique contract address and StateInit for a booking
- contract includes escrow money state and simple post-finalization ratings

Next milestone:

```text
Connect Rust booking/payment draft creation to:
POST /contracts/prepare-booking
```

Then pass returned contract data to frontend TON Connect payment flow.
