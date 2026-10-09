# BLUEPAY starter

## Run locally

1. Install Node.js 20 or newer.
2. Open a terminal in the project folder.
3. Run `npm install`.
4. Set `ADMIN_ACCESS_KEY` to a new, private admin secret.
5. Set `SESSION_SECRET` to a long, random secret.
6. Optionally set `BPC_CODE` for prototype testing.
7. Run `npm start`.
8. Open http://localhost:3000.

## Deploy on Render

Build command:

npm install

Start command:

npm start

Add these environment variables in Render:

- ADMIN_ACCESS_KEY
- SESSION_SECRET
- BPC_CODE

Attach persistent storage and set DATA_DIR to its mount path.
Without persistent storage, worker records and receipt images can be lost.

For production, use a managed database and persistent session storage.

## Important

- The displayed 200,000.00 balance is a demo balance.
- A payment screenshot or typed digit key is not proof of payment.
- Admin must verify payments before approving them.
- Admin approval unlocks access to the Withdrawal flow.
- The BPC code opens the withdrawal details portal, not the Withdrawal button.
- The shared default BPC code is for prototype testing only.
- Never promise withdrawals that are not genuinely funded.
