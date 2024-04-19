# TXT2TXN Frontend

This repo serves as the frontend for the TXT2TXN project.

TXT2TXN is a collaboration between Circle and Blockchain at Berkeley, in particular [Niall Mandal](https://github.com/niallmandal).

## Setup

1. Install the necessary dependencies.
```sh
npm i 
```

2. Initialize your environment variables by copying the `.env.example` file to an `.env.local` file. Then, in `.env.local`, [paste your Privy App ID from the console](https://docs.privy.io/guide/console/api-keys).
```sh
# In your terminal, create .env.local from .env.example
cp .env.example .env.local
```

Add your Privy App ID to .env.local:
```
NEXT_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
```

## Building locally

In your project directory, run `npm run dev`. You can now visit http://localhost:3000 to see your app and login with Privy!
