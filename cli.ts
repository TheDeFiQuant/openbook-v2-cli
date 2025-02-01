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
