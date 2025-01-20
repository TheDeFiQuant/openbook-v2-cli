import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import balance from './commands/balance';
import createOOA from './commands/createOOA';
// import marketData from './commands/marketData';
// import deposit from './commands/deposit';
// import withdraw from './commands/withdraw';
// import fetchOOA from './commands/fetchOOA';
// import getOrder from './commands/getOrder';
// import placeLimitOrder from './commands/placeLimitOrder';

yargs(hideBin(process.argv))
  .scriptName('openbook-cli')
  .usage('$0 <command> [options]')
  .command(balance)
  .command(createOOA)
  // .command(marketData)
  // .command(deposit)
  // .command(withdraw)
  // .command(fetchOOA)
  // .command(getOrder)
  // .command(placeLimitOrder)
  .demandCommand(1, 'Please provide a valid command.')
  .help()
  .alias('help', 'h')
  .strict()
  .argv;
