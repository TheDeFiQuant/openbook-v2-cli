import { CommandModule } from 'yargs';
import {
  createConnection,
  createProvider,
  createClient,
  loadKeypair,
  loadPublicKey,
} from '../utils/setup';
import logger from '../utils/logger';

interface DepositArgs {
  market: string;
  openOrders: string;
  ownerKeypair: string;
  baseAmount: number;
  quoteAmount: number;
}

const command: CommandModule = {
  command: 'deposit',
  describe: 'Deposit funds into an OpenOrders account',
  builder: (yargs) =>
    yargs
      .option('market', { type: 'string', demandOption: true, description: 'Market public key' })
      .option('openOrders', { type: 'string', demandOption: true, description: 'OpenOrders account public key' })
      .option('ownerKeypair', { type: 'string', demandOption: true, description: 'Path to owner keypair file' })
      .option('baseAmount', { type: 'number', demandOption: true, description: 'Base currency amount to deposit' })
      .option('quoteAmount', { type: 'number', demandOption: true, description: 'Quote currency amount to deposit' }),
  handler: async (argv: DepositArgs) => {
    const connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const provider = createProvider(connection, owner);
    const client = createClient(provider);

    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      logger.info('Fetching market and account details...');
      const market = await client.loadMarket(marketPubkey);
      const openOrders = await client.deserializeOpenOrders(openOrdersPubkey);

      const baseAmountNative = market.uiToNativeBaseAmount(argv.baseAmount);
      const quoteAmountNative = market.uiToNativeQuoteAmount(argv.quoteAmount);

      logger.info('Preparing deposit transaction...');
      const depositTx = await client.deposit(
        openOrdersPubkey,
        market,
        baseAmountNative,
        quoteAmountNative
      );

      const signature = await client.sendTransaction(depositTx, [owner]);
      logger.info(`Deposit transaction successful. Signature: ${signature}`);
    } catch (error) {
      logger.error('Error during deposit:', error.message || error);
      process.exit(1);
    }
  },
};

export default command;
