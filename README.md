# ton-worker-experthub

Separate TON Worker service for Expert Hub booking escrow contract preparation and contract actions.

This service exists because the main Expert Hub backend is Rust, while TON contract tooling, Blueprint artifacts, and TON SDK integration are Node.js / TypeScript based.

The worker is intentionally separate from the Rust backend.

---

## Purpose

The TON Worker is responsible for TON-specific mechanics only:

The worker now also exposes a contract-state endpoint used by the Rust backend after TON Connect wallet return. The frontend does not verify payment directly. The frontend only asks the Rust backend to confirm payment, and the Rust backend asks the worker to read escrow contract state.

- loading the compiled `BookingEscrow` contract artifact
- preparing unique per-booking contract deployment data
- returning deterministic contract address and StateInit data
- sending controller/admin action messages to deployed escrow contracts
- reading deployed escrow contract state for backend funding verification

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

## Deploy

```text
cd /opt/ton-worker-experthub
git pull
docker compose --env-file .env up -d --build
curl http://127.0.0.1:8081/health
docker logs ton-worker-experthub --since 5m
```

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

## Read booking contract state

```http
GET /contracts/{contract_address}/state
```

This endpoint is called by the Rust backend after the customer wallet returns control to the Telegram Mini App.

Purpose:

* verify that the escrow contract exists on-chain
* verify that the contract is active
* read the contract state
* read the contract booking id
* read the contract amount
* read the current contract balance
* determine whether the escrow is funded

Example response:

```json
{
  "contract_address": "EQ...",
  "account_state": "active",
  "balance_nano_ton": "188000938",
  "contract_state": 1,
  "contract_booking_id": 25,
  "contract_amount_nano_ton": "38167939",
  "is_funded": true
}
```

Meaning:

* `account_state` — TON account state, expected `active` after successful deploy/fund transaction
* `balance_nano_ton` — current contract balance
* `contract_state` — escrow contract internal state
* `contract_booking_id` — booking id stored inside the escrow contract
* `contract_amount_nano_ton` — escrow amount stored inside the contract
* `is_funded` — worker-side funding result based on account/contract state and balance

Expected funded state:

```text
account_state = active
contract_state = 1
contract_booking_id = booking.id
is_funded = true
```

The Rust backend must still make the final decision and update local DB state.

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

## Current main-app booking flow

The main Expert Hub backend currently integrates with TON Worker like this:

1. Customer selects a slot on `/e/{slug}`
2. Rust backend creates booking/payment draft
3. Rust backend calls:

```http
POST /contracts/prepare-booking
```

4. Rust backend stores:
    - `contract_address`
    - transaction reference / worker metadata
    - payment status `awaiting_payment`
    - booking status `awaiting_payment`
5. Frontend opens TON Connect payment using `contract_address` + `state_init_boc`
6. Customer approves wallet transaction
7. Telegram Wallet returns control to the Mini App
8. Frontend calls Rust backend payment confirmation endpoint
9. Rust backend calls TON Worker:

```http
GET /contracts/{contract_address}/state
```

10. TON Worker reads on-chain contract state
11. Rust backend verifies:
    - contract is active
    - contract state is funded
    - contract booking id matches local booking id
    - funding/balance check passes
12. Rust backend marks:
    - `payments.status = funded`
    - `bookings.status = funded`
13. Rust backend sends Telegram Bot notification to the expert
14. Expert Confirm/Decline callback flow is the next hardening step

After expert confirmation:

```text
backend calls worker action: expert_confirm
booking.status = waiting_for_session
```

After expert decline:

```text
backend calls worker action: expert_decline
booking.status = refunded
payment.status = refunded
```

Later, session detection will call one of:

```text
session_connected -> pay expert
customer_no_show  -> pay expert
expert_no_show    -> refund customer
```

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

Current Rust integration already covers:

* booking/payment draft creation
* `POST /contracts/prepare-booking`
* passing `contract_address`, `state_init_boc`, and TON amount to frontend
* frontend TON Connect deploy/fund transaction
* backend payment confirmation after wallet return
* worker contract-state check
* booking/payment transition to `funded`

Next Rust integration milestones:

```text
Finish expert Confirm/Decline callback handling.
Verify expert_confirm action end-to-end.
Verify expert_decline action end-to-end.
Move confirmed bookings from funded to waiting_for_session.
Notify customer after expert confirms or declines.
```

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
- Rust backend calls worker `POST /contracts/prepare-booking`
- frontend receives contract address, StateInit, and amount
- frontend sends TON Connect deploy/fund transaction
- Telegram Wallet can approve the testnet transaction and return control to the Mini App
- worker exposes contract-state reading endpoint
- Rust backend uses worker state endpoint during `/confirm-payment`
- funded escrow contract state has been verified on testnet
- booking/payment can move to `funded` after successful backend verification
- backend Telegram Bot notification after funding verification is wired
- contract includes escrow money state and simple post-finalization ratings

Next milestone:

```text
Finish and harden expert Confirm/Decline callback handling,
then verify expert_confirm and expert_decline contract actions end-to-end.
```

---

## Recent changes

Recent worker-side changes touched:

```text
contracts/booking_escrow.tolk
wrappers/BookingEscrow.ts
src/dto.ts
src/server.ts
src/service.ts
README.md
```
