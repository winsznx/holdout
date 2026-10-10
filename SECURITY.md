# Security

Holdout handles trading history and read-only exchange keys.

- Keys never leave the browser unsigned. The edge function sees only signature headers, in memory, and stores nothing.
- Use a read-only key. The app refuses keys whose authorities look like write access.
- The harness uses a Bitget Demo key only. It is never imported by `apps/web`.
- Do not commit `.env` files. They are git-ignored.

Report a vulnerability by opening a private security advisory on the GitHub repository.
