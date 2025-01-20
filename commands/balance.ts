import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey, createStubWallet } from '../utils/setup';
import { Market, OpenOrders } from '@openbook-dex/openbook-v2'; 
import logger from '../utils/logger';

interface BalanceArgs {
  openOrders: string;
  market: string;
}

const balance: CommandModule<{}, BalanceArgs> = {
  command: 'balance',
  describe: 'Fetch balances from OpenBook trading account',
  builder: (yargs) =>
    yargs
      .option('openOrders', {
        type: 'string',
        demandOption: true,
        description: 'OpenOrders account public key',
      })
      .option('market', {
        type: 'string',
        demandOption: true,
        description: 'Market public key',
      }),
  handler: async (argv) => {
    const connection = createConnection();
    const wallet = createStubWallet();
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);

    const openOrdersPubkey = loadPublicKey(argv.openOrders);
    const marketPubkey = loadPublicKey(argv.market);

    try {
      logger.info(`Fetching balances for OpenOrders account: ${openOrdersPubkey.toBase58()}`);

      // Load the market
      logger.info(`Loading market: ${marketPubkey.toBase58()}...`);
      const market = await Market.load(client, marketPubkey);

      // Load OpenOrders and fetch balances
      const openOrders = await OpenOrders.load(openOrdersPubkey, market, client);
      if (!openOrders) {
        throw new Error('Failed to load OpenOrders account.');
      }

      // Use the methods to fetch balances in UI format
      const baseBalanceUi = openOrders.getBaseBalanceUi();
      const quoteBalanceUi = openOrders.getQuoteBalanceUi();

      logger.info('Balances:');
      logger.info(`  Base Token Balance: ${baseBalanceUi}`);
      logger.info(`  Quote Token Balance: ${quoteBalanceUi}`);
    } catch (error) {
      logger.error(`Error fetching balances: ${(error as Error).message}`);
      process.exit(1);
    }
  },
};

export default balance;
