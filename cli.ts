import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import marketData from './commands/marketData';
import createOOA from './commands/createOOA';
import fetchOOA from './commands/fetchOOA';
import withdraw from './commands/withdraw';
import deposit from './commands/deposit';
import balance from './commands/balance';
// import placeLimitOrder from './commands/placeLimitOrder';
// import getOrder from './commands/getOrder';

yargs(hideBin(process.argv))
  .scriptName('openbook-cli')
  .usage('$0 <command> [options]')
  .command(marketData)
  .command(createOOA)
  .command(fetchOOA)
  .command(withdraw)
  .command(deposit)
  .command(balance)
  // .command(placeLimitOrder)
  // .command(getOrder)
  .demandCommand(1, 'Please provide a valid command.')
  .help()
  .alias('help', 'h')
  .strict()
  .argv;
