# NexiaWallet

**Buy, swap & send crypto. Keys stay on your phone.**

A non-custodial, multi-chain crypto wallet with a French-first interface — built solo, in public.

🌐 **Try it:** [nexiawallet.com](https://nexiawallet.com) · 📣 **Updates:** [t.me/NexiaWallet](https://t.me/NexiaWallet) · ✉️ contact@nexiawallet.com

---

## How your keys are handled

This is the part that matters in a wallet, so here it is up front:

- **Your keys are generated on your device** (BIP39 recovery phrase) and **encrypted locally** with your PIN.
- **Every transaction is signed on your device.** The backend only receives the already-signed transaction and relays it to the network (`POST /wallet/tx/broadcast`). It never sees a private key or a recovery phrase.
- **No sign-up and no KYC** to use the wallet (an email for notifications is optional). Buying or selling crypto goes through Coinbase, which applies its own checks.
- The backend exists for things that shouldn't live in a public app bundle: price data, NFT lookups, and swap/bridge quotes that need third-party API keys.

> ⚠️ **Web vs. mobile:** the web version stores your encrypted wallet in browser storage, which isn't hardware-protected like the phone's secure storage. Treat the web app as a convenient way to try things, not a vault.

## Supported networks

Ethereum · BNB Smart Chain · Polygon · Arbitrum · Optimism · Base · Solana · Bitcoin

## Features

- **Send & receive** on all 8 networks, with QR codes, ENS names, an address book and a warning for look-alike "poisoned" addresses
- **Buy & sell** via Coinbase Onramp / Offramp — purchased crypto is delivered straight to your own address
- **Swap** tokens (via 0x, on Ethereum and BNB Chain)
- **Bridge** ETH between Ethereum, Arbitrum, Optimism and Base (via LI.FI)
- **WalletConnect** and an in-app dApp browser (mobile), with signature checks before you approve anything: approvals and `Permit`/`Permit2` signatures are decoded and flagged
- **NFT gallery**, **native Solana staking**, live market data and crypto news
- **Multiple accounts**, a **duress PIN** that opens a decoy empty wallet, PIN brute-force throttling, and encrypted keystore export

## Fees

Sending and receiving cost only the network fee. NexiaWallet takes a small commission on two actions, and it's shown in the app before you confirm:

| Action | NexiaWallet fee |
|---|---|
| Swap | 0.75 % |
| Bridge | 0.25 % (LI.FI adds its own service fee) |
| Send / receive | none |
| Buy / sell | none from NexiaWallet (Coinbase's own fees apply) |

## Project structure

```
crypto-wallet/   Node.js / Express API: tx relay, prices, NFT and quote proxies (deployed on Railway)
wallet-final/    Expo SDK 54 / React Native 0.81 app, ethers v5; web build deployed on Cloudflare Pages
```

## Running it locally

**Backend** (Node ≥ 20.19.4)

```bash
cd crypto-wallet
npm install
cp .env.example .env   # then set NODE_ENV=development (production mode redirects plain HTTP to HTTPS)
                       # public RPC defaults are included; optional API keys unlock swaps, NFTs, payments
npm start              # http://localhost:3000
```

**App**

```bash
cd wallet-final
npm install
# create wallet-final/.env with:
#   EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/wallet
#   EXPO_PUBLIC_APP_API_KEY=<same value as APP_API_KEYS in crypto-wallet/.env>
npx expo start --web
```

**End-to-end smoke test** (builds the web app, serves it and drives it with Playwright: wallet import, address derivation check, all tabs, settings)

```bash
cd wallet-final
npm run test:e2e
```

## Status

NexiaWallet is an early-stage project by a solo developer. **It has not been audited by a third-party security firm.** Start with small amounts, and always keep your recovery phrase written down somewhere safe and offline — nobody, including us, can recover it for you.

Found a security issue? Please email **contact@nexiawallet.com** rather than opening a public issue.
