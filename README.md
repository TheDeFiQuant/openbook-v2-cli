# OpenBook CLI

OpenBook CLI is a command-line tool for interacting with OpenBook v2. It provides functionalities to create and close trading and market accounts (via create and close OOA), monitor market data, place, cancel and check orders, deposit and withdraw funds, and check your account balance.

## Installation

Ensure you have Node.js and yarn installed. Then, clone this repository and install dependencies:

```sh
git clone https://github.com/QuanDeFi/openbook-cli.git
cd openbook-cli
yarn install
```

and subsequently build the CLI

```sh
yarn build
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
```

| Parameter   | Description                                | Required |
|------------|--------------------------------------------|----------|
| `owner`    | Public key of the account owner           | Yes      |
| `market`   | Public key of the market (to filter results) | No       |

### Close OpenOrders Account (OOA)

Close an OpenOrders account or all OOAs for a market.

```sh
npx ts-node cli.ts closeOOA --ownerKeypair <KEYPAIR_PATH> --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --closeIndexer
```

| Parameter      | Description                                       | Required |
|--------------|-------------------------------------------------|----------|
| `ownerKeypair` | Path to the keypair file of the owner           | Yes      |
| `market`      | Public key of the market                        | Yes      |
| `openOrders`  | Public key of a specific OpenOrders account to close | No       |
| `closeIndexer` | Also close the OpenOrders indexer               | No       |

### Deposit Funds

Deposit tokens into an OpenOrders account.

```sh
npx ts-node cli.ts deposit --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --ownerKeypair <KEYPAIR_PATH> --baseAmount <BASE_AMOUNT> --quoteAmount <QUOTE_AMOUNT>
```

| Parameter      | Description                                  | Required |
|--------------|----------------------------------------------|----------|
| `market`     | Public key of the market                    | Yes      |
| `openOrders` | Public key of the OpenOrders account        | Yes      |
| `ownerKeypair` | Path to the keypair file of the owner     | Yes      |
| `baseAmount` | Amount of base tokens to deposit            | Yes      |
| `quoteAmount` | Amount of quote tokens to deposit          | Yes      |

### Check Balance

Fetch the base and quote token balances for an OpenOrders account.

```sh
npx ts-node cli.ts balance --openOrders <OPEN_ORDERS_PUBKEY> --market <MARKET_PUBKEY>
```

| Parameter    | Description                          | Required |
|-------------|--------------------------------------|----------|
| `openOrders` | Public key of the OpenOrders account | Yes      |
| `market`     | Public key of the market             | Yes      |

### Withdraw Funds

Withdraw funds from an OpenOrders account.

```sh
npx ts-node cli.ts withdraw --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --ownerKeypair <KEYPAIR_PATH>
```

| Parameter      | Description                                    | Required |
|---------------|------------------------------------------------|----------|
| `market`      | Public key of the market                      | Yes      |
| `openOrders`  | Public key of the OpenOrders account          | Yes      |
| `ownerKeypair`| Path to the keypair file of the owner         | Yes      |

### Place a Limit Order

Place a limit order on OpenBook.

```sh
npx ts-node cli.ts place-order --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --ownerKeypair <KEYPAIR_PATH> --side bid --price 100 --size 1
```

| Parameter      | Description                                  | Required |
|---------------|----------------------------------------------|----------|
| `market`      | Public key of the market                    | Yes      |
| `openOrders`  | Public key of the OpenOrders account        | Yes      |
| `ownerKeypair`| Path to the keypair file of the owner       | Yes      |
| `side`        | `bid` (buy) or `ask` (sell)                 | Yes      |
| `price`       | Order price in UI units                     | Yes      |
| `size`        | Order size in UI units                      | Yes      |

### Get Open Orders

Retrieve open orders for an OpenBook trading account.

```sh
npx ts-node cli.ts position --wallet <WALLET_PUBLIC_KEY>
npx ts-node cli.ts position --openOrders <OPEN_ORDERS_PUBLIC_KEY> [--market <MARKET_PUBLIC_KEY>]
```

| Parameter      | Description                                       | Required |
|---------------|---------------------------------------------------|----------|
| `wallet`      | Public key of the wallet (fetch all OOAs)        | No       |
| `openOrders`  | Public key of a specific OpenOrders account      | No       |
| `market`      | Public key of a market to filter results         | No       |

### Cancel an Order

Cancel an open order on OpenBook.

```sh
npx ts-node cli.ts cancelOrder --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --orderId <ORDER_ID> --ownerKeypair <KEYPAIR_PATH>
```

| Parameter       | Description                               | Required |
|---------------|-------------------------------------------|----------|
| `market`      | Public key of the market                 | Yes      |
| `openOrders`  | Public key of the OpenOrders account     | Yes      |
| `orderId`     | Order ID to cancel                       | No       |
| `clientOrderId` | Client-specified order ID              | No       |
| `side`        | `bid` or `ask` (cancel orders on that side) | No       |
| `limit`       | Maximum number of orders to cancel       | No       |
| `ownerKeypair` | Path to the keypair file of the owner   | Yes      |

## License

This project is licensed under the MIT License.

## Repository

GitHub: [https://github.com/QuanDeFi/openbook-cli](https://github.com/QuanDeFi/openbook-cli)

## Author

Developed by [QuanDeFi](https://quandefi.co)
