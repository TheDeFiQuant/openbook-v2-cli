import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey } from '../utils/setup';
import logger from '../utils/logger';

interface FetchOOAArgs {
  owner: string;
  market?: string;
}

const command: CommandModule = {
  command: 'fetchOOA <owner>',
  describe: 'Fetch OpenOrders accounts and indexers',
  builder: (yargs) =>
    yargs
      .positional('owner', {
        type: 'string',
        description: 'Public key of the owner',
      })
      .option('market', {
        type: 'string',
        description: 'Market public key (optional)',
      }),
  handler: async (argv: FetchOOAArgs) => {
    const connection = createConnection();
    const provider = createProvider(connection, null); // Stub wallet
    const client = createClient(provider);

    const ownerPk = loadPublicKey(argv.owner);

    try {
      logger.info(`Fetching OpenOrders accounts for owner: ${ownerPk.toBase58()}`);
      if (argv.market) {
        const marketPk = loadPublicKey(argv.market);
        logger.info(`Filtering by market: ${marketPk.toBase58()}`);
        const openOrders = await client.findOpenOrdersForMarket(ownerPk, marketPk);
        openOrders.forEach((account) => logger.info(`Found OpenOrders: ${account.toBase58()}`));
      } else {
        const allAccounts = await client.findAllOpenOrders(ownerPk);
        allAccounts.forEach((account) => logger.info(`Found OpenOrders: ${account.toBase58()}`));
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error fetching OpenOrders: ${err.message}`);
      process.exit(1);
    }
  },
};

export default command;
