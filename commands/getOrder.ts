import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey } from '../utils/setup';
import logger from '../utils/logger';

interface GetOrderArgs {
  wallet?: string;
  openOrders?: string;
  market?: string;
}

const getOrder: CommandModule = {
  command: 'getOrder',
  describe: 'Fetch OpenOrders account or wallet positions',
  builder: (yargs) =>
    yargs
      .option('wallet', {
        type: 'string',
        description: 'Wallet public key to fetch all orders',
      })
      .option('openOrders', {
        type: 'string',
        description: 'Specific OpenOrders account public key',
      })
      .option('market', {
        type: 'string',
        description: 'Market public key (optional filter)',
      })
      .check((argv) => {
        if (!argv.wallet && !argv.openOrders) {
          throw new Error('Provide either --wallet or --openOrders');
        }
        return true;
      }),
  handler: async (argv: GetOrderArgs) => {
    const connection = createConnection();
    const provider = createProvider(connection, null); // Stub wallet
    const client = createClient(provider);

    try {
      if (argv.openOrders) {
        const openOrdersPubkey = loadPublicKey(argv.openOrders);
        logger.info(`Fetching OpenOrders account: ${openOrdersPubkey.toBase58()}`);
        const marketPubkey = argv.market ? loadPublicKey(argv.market) : undefined;
        const market = marketPubkey ? await client.loadMarket(marketPubkey) : undefined;

        const openOrders = await client.loadOpenOrders(openOrdersPubkey, market);
        logger.info(`Current Position: ${openOrders.toPrettyString()}`);
      } else if (argv.wallet) {
        const walletPubkey = loadPublicKey(argv.wallet);
        logger.info(`Fetching all OpenOrders accounts for wallet: ${walletPubkey.toBase58()}`);
        const allOrders = await client.findAllOpenOrders(walletPubkey);
        allOrders.forEach((order) => logger.info(`Order: ${order.toBase58()}`));
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error fetching OpenOrders: ${err.message}`);
      process.exit(1);
    }
  },
};

export default getOrder;
