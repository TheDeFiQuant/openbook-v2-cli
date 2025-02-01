# OpenBook CLI

OpenBook CLI is a command-line tool for interacting with OpenBook v2 on Solana. It provides functionalities to manage OpenOrders accounts, monitor markets, place and cancel orders, deposit and withdraw funds, and more.

## Installation

Ensure you have Node.js installed. Then, clone this repository and install dependencies:

```sh
git clone https://github.com/QuanDeFi/openbook-cli.git
cd openbook-cli
yarn install
```

## Usage

All commands follow the format:

```sh
npx ts-node cli.ts <command> [options]
```

## Commands

### Market Data

Monitor the order book for a specified market.

```sh
npx ts-node cli.ts marketData <MARKET_PUBLIC_KEY> --bestbidask
npx ts-node cli.ts marketData <MARKET_PUBLIC_KEY> --book
```

| Parameter    | Description                         | Required |
|-------------|-------------------------------------|----------|
| `market`    | Public key of the market           | Yes      |
| `bestbidask` | Monitor best bid/ask prices       | No       |
| `book`      | Display full order book liquidity  | No       |

### Create OpenOrders Account (OOA)

Create an OpenOrders account for a market.

```sh
npx ts-node cli.ts createOOA --market <MARKET_PUBKEY> --ownerKeypair <KEYPAIR_FILE_PATH> --name <ACCOUNT_NAME>
```

| Parameter      | Description                                       | Required |
|--------------|---------------------------------------------------|----------|
| `market`    | Public key of the market                          | Yes      |
| `ownerKeypair` | Path to the keypair file of the owner           | Yes      |
| `name`      | Name of the OpenOrders account (default: `"default"`) | No       |

### Get OpenOrders Accounts (OOA)

Fetch OpenOrders accounts for an owner.

```sh
npx ts-node cli.ts getOOA <OWNER_PUBLIC_KEY> [--market <MARKET_PUBLIC_KEY>]
