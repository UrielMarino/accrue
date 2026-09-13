# Accrue

Self-hosted personal finance, built on one idea: **a month counts what you consumed in it, not what you paid for in it.**

Most personal finance apps track cash leaving your account. Accrue tracks *accrual* — the expense belongs to the day you consumed the thing, regardless of who fronted the money or when the card settles. A shared dinner someone else paid for is your expense today and a liability today. Paying them back next week is not an expense at all; it is cash moving.

That single rule decides almost everything else in the model, and the model is written down before the code: see **[MODEL.md](MODEL.md)** (in Spanish), which is binding — no screen and no calculation may contradict it without changing that document first.

> **Status: early.** The domain layer and its tests are real and passing. There is no running application yet. Watch or star if you want to know when there is.

## What it will do

- **Movements** — one centralized, filterable ledger. The atom of time is a **range**, not a month; "September" is just a preset.
- **Dashboard** — aggregates over a 6, 12, or 24-month window: spend by month, breakdown by category, what is already committed before the month starts.
- **Admin** — fixed costs, installment plans, categories.
- **Telegram bot** — log an expense by chatting with it, parsed by an LLM. This is why it is a self-hosted web app and not a desktop app: the webhook needs a server that stays on.

## Design

The visual system was settled before any screen was built — palette, type scale, labels, icons, dropdowns, tooltips, skeletons and motion tokens, all as a live page rather than a document. It is the reference for anything that gets built here.

## Layout

| Path | What it is |
| --- | --- |
| `MODEL.md` | The domain contract. Binding. Read this first. |
| `packages/domain/` | Pure domain logic and its tests — allocation, ledger, installments, recurring, reports. No I/O. |
| `packages/contracts/` | Shared request/response types between server and client. |
| `apps/api/` | HTTP and persistence. Calculates no money: it calls the domain and stores what comes back. |
| `apps/web/` | The screens. |
| [`docs/UI.md`](docs/UI.md) | How the ledger presents each kind of movement, where debts live, and why the list is not paginated. Derived from MODEL.md. |
| `docs/reference/` | Carried over from the previous attempt for reference only. Not wired into anything. |

Money is stored as **integer centavos (ARS)**. Every split — installments, shared expenses — goes through a single allocation function, and the remainder falls on the first share, which is always yours. It is never on a third party.

## Contributing

Issues and pull requests are welcome. The model comes first: if a change contradicts `MODEL.md`, the discussion is about the model, not the code. See [CONTRIBUTING.md](CONTRIBUTING.md).

Some documentation is in Spanish, including `MODEL.md`. Issues and pull requests are fine in either English or Spanish.

## License

[GNU AGPL-3.0-or-later](LICENSE) © 2026 Uriel Marino

You can read, run, fork and modify this. If you run a modified version as a
service that other people use over a network, you have to offer those users the
source of your modified version — that is the part the AGPL adds over the GPL,
and it is the reason it is the license here: this is a self-hosted web app, so
"running it for others" is the normal way it gets used.
