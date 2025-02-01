/**
 * Command	  Description
 * balance	  Fetches the base and quote token balances for an OpenOrders account on a specified market.
 *  
 * Example
 * npx ts-node cli.ts balance --openOrders <OPEN_ORDERS_PUBKEY> --market <MARKET_PUBKEY>
 * 
 * Parameters
 * --openOrders: The public key of the OpenOrders account.
 * --market: The public key of the market.
 *  
 * Command	  Description
 * createOOA  Creates an OpenOrders account (OOA) for a specified market, allowing users to manage their trades on OpenBook.
 * 
 * Example
 * npx ts-node cli.ts createOOA --market <MARKET_PUBKEY> --ownerKeypair <KEYPAIR_FILE_PATH> --name <ACCOUNT_NAME>
 * 
 * Parameters
 * --market (Required): Public key of the market where the OpenOrders account will be created.
 * --ownerKeypair (Required): Path to the keypair file of the owner.
 * --name (Optional, default: "default"): Name of the OpenOrders account.
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
 * CLI Command: fetchOOA
 * 
 * Description
 * Fetches all OpenOrders accounts and the OpenOrdersIndexer for a given owner. 
 * If a market is specified, it fetches only OpenOrders accounts associated with that market.
 *
 * Example Usage
 * npx ts-node cli.ts fetchOOA <OWNER_PUBLIC_KEY> [--market <MARKET_PUBLIC_KEY>]
 *  
 * Parameters
 * --owner (Required): Public key of the account owner whose OpenOrders accounts are being fetched.
 * --market (Optional): Public key of the market to filter OpenOrders accounts.
 * 
 * 
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import marketData from './commands/marketData';
import createOOA from './commands/createOOA';
import fetchOOA from './commands/fetchOOA';
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
  .command(fetchOOA)
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
