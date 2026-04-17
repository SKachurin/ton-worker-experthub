# ton-worker-experthub

Separate TON worker service for Expert Hub.

## Purpose

This service is responsible for:
- deploying booking smart contracts
- sending action messages to deployed contracts
- later reading contract state if needed

It is intentionally separate from the Rust backend.

## Current status

Current version is a stub service:
- `/health`
- `POST /contracts/deploy-booking`
- `POST /contracts/:address/action`

No real TON deployment yet.
It only returns deterministic stub values so the Rust backend can be integrated first.

## Run

```bash
docker compose up --build