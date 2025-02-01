/**
 * CLI Command: balance	  
 * 
 * Description
 * Fetches the base and quote token balances for an OpenOrders account on a specified market.
 *  
 * Example
 * npx ts-node cli.ts balance --openOrders <OPEN_ORDERS_PUBKEY> --market <MARKET_PUBKEY>
 * 
 * Parameters
 * --openOrders: The public key of the OpenOrders account.
 * --market: The public key of the market.
 *  
 *
 * CLI Command: createOOA  
 * 
 * Description
 * Creates an OpenOrders account (OOA) for a specified market, allowing users to manage their trades on OpenBook.
 * 
 * Example
 * npx ts-node cli.ts createOOA --market <MARKET_PUBKEY> --ownerKeypair <KEYPAIR_FILE_PATH> --name <ACCOUNT_NAME>
 * 
 * Parameters
 * --market (Required): Public key of the market where the OpenOrders account will be created.
 * --ownerKeypair (Required): Path to the keypair file of the owner.
 * --name (Optional, default: "default"): Name of the OpenOrders account.
 * 
 * 
 * CLI Command: deposit
 * 
 * Description
 * Deposits funds into an OpenOrders account for a specified market on OpenBook DEX. 
 * This allows users to provide liquidity for trading by adding base and quote token amounts.
 *
 * Example
 * npx ts-node cli.ts deposit --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --ownerKeypair <KEYPAIR_FILE_PATH> --baseAmount <BASE_AMOUNT> --quoteAmount <QUOTE_AMOUNT>
 *  
 * Parameters
 * --market (Required): Public key of the market where funds will be deposited.
 * --openOrders (Required): Public key of the OpenOrders account receiving the deposit.
 * --ownerKeypair (Required): Path to the keypair file of the account owner.
 * --baseAmount (Required): Amount of base tokens (e.g., SOL, USDC) to deposit.
 * --quoteAmount (Required): Amount of quote tokens to deposit.
 * 
 * 
 * CLI Command: getOOA
 * 
 * Description
 * Fetches all OpenOrders accounts and the OpenOrdersIndexer for a given owner. 
 * If a market is specified, it fetches only OpenOrders accounts associated with that market.
 *
 * Example Usage
 * npx ts-node cli.ts getOOA <OWNER_PUBLIC_KEY> [--market <MARKET_PUBLIC_KEY>]
 *  
 * Parameters
 * --owner (Required): Public key of the account owner whose OpenOrders accounts are being fetched.
 * --market (Optional): Public key of the market to filter OpenOrders accounts.
 * 
 * 
 * CLI Command: position
 * 
 * Description
 * Fetches the open orders for an OpenBook trading account. 
 * Allows retrieving all OpenOrders accounts for a wallet or a specific OpenOrders account.
 * If a market is specified, results are filtered to that market.
 *
 * Example Usage
 * npx ts-node cli.ts position --wallet <WALLET_PUBLIC_KEY>
 * npx ts-node cli.ts position --openOrders <OPEN_ORDERS_PUBLIC_KEY> [--market <MARKET_PUBLIC_KEY>]
 *  
 * Parameters
 * --wallet (Optional): Public key of the wallet to fetch all OpenOrders accounts.
 * --openOrders (Optional): Public key of a specific OpenOrders account.
 * --market (Optional): Public key of a market to filter the OpenOrders accounts.
 * 
 * 
 * CLI Command: marketData
 * 
 * Description
 * Monitors the order book for a specified market, displaying real-time updates on best bid/ask prices or the full order book liquidity.
 *
 * Example Usage
 * npx ts-node cli.ts marketData <MARKET_PUBLIC_KEY> --bestbidask
 * npx ts-node cli.ts marketData <MARKET_PUBLIC_KEY> --book
 *  
 * Parameters
 * --market (Required): Public key of the market to monitor.
 * --bestbidask (Optional): Monitor and display the best bid/ask prices.
 * --book (Optional): Display the full order book liquidity.
 * 
 * 
 * CLI Command: place-order
 * 
 * Description
 * Places a limit order on OpenBook by specifying the market, order parameters, and OpenOrders account.
 *
 * Example Usage
 * npx ts-node cli.ts place-order --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --ownerKeypair <KEYPAIR_PATH> --side bid --price 100 --size 1
 *  
 * Parameters
 * --market (Required): Public key of the market where the order will be placed.
 * --openOrders (Required): Public key of the OpenOrders account.
 * --ownerKeypair (Required): Path to the keypair file of the order owner.
 * --side (Required): Order side, either 'bid' (buy) or 'ask' (sell).
 * --price (Required): Order price in UI units.
 * --size (Required): Order size in UI units.
 * 
 * CLI Command: withdraw
 * 
 * Description
 * Withdraws funds from an OpenOrders account on OpenBook. This allows users to reclaim their base and quote tokens from an active market.
 *
 * Example Usage
 * npx ts-node cli.ts withdraw --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --ownerKeypair <KEYPAIR_PATH>
 *  
 * Parameters
 * --market (Required): Public key of the market where the OpenOrders account is located.
 * --openOrders (Required): Public key of the OpenOrders account.
 * --ownerKeypair (Required): Path to the keypair file of the account owner.
 * 
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import marketData from './commands/marketData';
import createOOA from './commands/createOOA';
import getOOA from './commands/getOOA';
import withdraw from './commands/withdraw';
import deposit from './commands/deposit';
import balance from './commands/balance';
import placeLimitOrder from './commands/placeLimitOrder';
import getOrder from './commands/getOrder';

yargs(hideBin(process.argv))
  .scriptName('openbook-cli')
  .usage('$0 <command> [options]')
  .command(marketData)
  .command(createOOA)
  .command(getOOA)
  .command(withdraw)
  .command(deposit)
  .command(balance)
  .command(placeLimitOrder)
  .command(getOrder)
  .demandCommand(1, 'Please provide a valid command.')
  .help()
  .alias('help', 'h')
  .strict()
  .argv;
