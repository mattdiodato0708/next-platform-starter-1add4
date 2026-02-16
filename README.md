# MEV Mempool Sniper Bot

This repository houses a complete MEV mempool sniper bot application designed for Ethereum. The bot identifies and executes profitable trading opportunities based on various strategies.

## Directory Structure

- **bot/**: Main bot engine (`bot/index.js`)
- **utils/**: Helper functions
- **.env.example**: Template for environment variables — copy this to create your own `.env` file

## Installation Instructions

### Step 1: Clone the repository

Copy and paste the following commands into your terminal:

```bash
git clone https://github.com/mattdiodato0708/next-platform-starter-1add4.git
cd next-platform-starter-1add4
```

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Set up your environment variables

The project includes a file called `.env.example` that serves as a template. You need to **copy** it to a new file called `.env` and then fill in your own values.

Run this command to copy the template:

```bash
cp .env.example .env
```

Then open the `.env` file in your text editor and replace the placeholder values with your actual credentials:

| Variable | Where to put it | How to get it |
|---|---|---|
| `PRIVATE_KEY` | Replace `your_private_key_here` | Export from your Ethereum wallet (e.g., MetaMask > Account Details > Export Private Key) |
| `RPC_ENDPOINT` | Replace `https://your_rpc_endpoint_here` | Sign up at [Infura](https://infura.io) or [Alchemy](https://alchemy.com) and create a project to get a WebSocket or HTTPS endpoint |
| `DATABASE_URL` | Replace the full connection string | Set up a PostgreSQL database and use its connection URL |
| `BOT_CONFIG` | Update the JSON values | Customize the bot configuration options as needed |

**Example `.env` file** (do **not** commit this file — it contains secrets):

```
PRIVATE_KEY=0xabc123...your_actual_private_key
RPC_ENDPOINT=https://mainnet.infura.io/v3/your_project_id
DATABASE_URL=postgres://myuser:mypassword@localhost:5432/mev_bot_db
BOT_CONFIG={"option1": "value1", "option2": "value2", "option3": "value3"}
```

> ⚠️ **Important:** Never share your private key or commit your `.env` file to version control. The `.gitignore` file already excludes `.env` from being tracked.

### Step 4: Set up the database

You also need to update the database connection details inside `bot/index.js`. Open the file and replace the placeholder values in the `Client` configuration:

```js
const client = new Client({
    host: 'localhost',
    user: 'your_user',       // ← Replace with your PostgreSQL username
    password: 'your_password', // ← Replace with your PostgreSQL password
    database: 'your_database'  // ← Replace with your database name
});
```

Alternatively, you can modify the code to read from the `DATABASE_URL` environment variable in your `.env` file.

### Step 5: Update the WebSocket provider

In `bot/index.js`, replace the Infura WebSocket URL with your own:

```js
const provider = new ethers.providers.WebSocketProvider('wss://mainnet.infura.io/ws/v3/YOUR_INFURA_PROJECT_ID');
// Replace YOUR_INFURA_PROJECT_ID with the project ID from your Infura dashboard
```

### Step 6: Run the bot

```bash
node bot/index.js
```

## Features

- Listen to Ethereum mempool via WebSocket
- Detect sandwich, arbitrage, and liquidation opportunities
- Execute profitable trades with optimal gas pricing
- Track all trades in PostgreSQL database
- Honeypot and rug-pull detection
- Error handling with retry logic
- Real-time monitoring via Discord webhooks
- ROI and profitability metrics
