# Contributing

Thanks for looking. This is a personal project built in the open: anyone can read it, fork it, open issues and send pull requests, but changes land only after review by the maintainer.

## Before you write code

**Read [MODEL.md](MODEL.md) first.** It is the domain contract and it is binding — no screen and no calculation may contradict it without changing that document first. If your change needs the model to be different, open an issue about the model before writing the code. That conversation is cheaper than the patch.

The model is in Spanish. Issues and pull requests are welcome in English or Spanish, whichever you are comfortable in.

## Ground rules that come from the model

These are not style preferences, they are correctness:

- **Money is integer centavos.** No floats, anywhere. Presentation shows whole pesos; the conversion is internal.
- **One allocation function.** Anything that splits a total into parts — installments, shared expenses — calls it. Rounding remainders go to the first share, never to a third party.
- **Read, don't recalculate.** A split that was already allocated is stored and read back. Recalculating it in a view is a defect even when it happens to give the same number.
- **Nothing is confirmed by the calendar.** A pending movement whose date has passed is still pending. `VENCIDO` is derived, never stored.

## Pull requests

- Branch off `main`. One concern per pull request.
- **Domain changes need tests.** The domain layer is the part that has to be right; it is covered and should stay that way.
- Say what you changed and why in the description. If it touches the model, link the issue where that was agreed.
- Keep the diff to what you set out to do — unrelated reformatting makes review slower and is usually the reason a PR stalls.

Pull requests require review and approval before merging. That is the maintainer, so review may take a few days.

## Reporting a bug

Open an issue with what you expected, what happened, and the smallest case that shows it. For anything involving amounts, include the exact figures — rounding bugs live in the last centavo.

## Licensing of contributions

This project is licensed under the **GNU AGPL-3.0-or-later**. By opening a pull
request you agree that your contribution is licensed under those same terms.
There is no CLA and no copyright assignment — you keep the copyright on what you
wrote.

## Security

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on this repository instead.

## Toolchain

Node **22.5 – 25** and **pnpm 11+**. `pnpm install` refuses other package
managers, and the engines field will stop you on a Node that cannot run this.

Two settings exist for a reason and should not be "cleaned up":

- **`allowBuilds` in `pnpm-workspace.yaml`.** pnpm 11 replaced
  `onlyBuiltDependencies` with it. Edit that file by hand — `pnpm config set`
  rewrites it with a placeholder and breaks the install.
- **`better-sqlite3: false`.** It is an optional peer of drizzle-orm that this
  project does not use; the database goes through libSQL, which ships prebuilt
  binaries. Left unpinned, npm tries to compile it and fails on recent Node.

The database driver and ORM versions are pinned exactly, not with a caret. The
SQLite driver landscape moves, and a silent minor bump here means the app stops
opening its own database.
