import { CommandModule } from 'yargs';
import {
  createConnection,
  createClient,
  createProvider,
  loadPublicKey,
  createStubWallet,
  validateAndFetchMarket
} from '../utils/setup';
import { Connection, PublicKey } from '@solana/web3.js';
import { OpenBookV2Client, Market, OpenOrders } from '@openbook-dex/openbook-v2/';
import logger from '../utils/logger';

interface CLIGetOrderArgs {
  wallet?: string;
  openOrders?: string;
  market?: string;
}

const getOrder: CommandModule<{}, CLIGetOrderArgs> = {
  command: 'position',
  describe: 'Fetch current position data for an OpenBook trading account',
  builder: (yargs) =>
    yargs
      .option('wallet', {
        type: 'string',
        description: 'Wallet public key (fetch all orders)',
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
  handler: async (argv) => {
    // Create Solana connection and provider
    const connection: Connection = createConnection();
    const stubWallet = createStubWallet();
    const provider = createProvider(connection, stubWallet);
    const client: OpenBookV2Client = createClient(provider);

    try {
      if (argv.openOrders) {
        // Fetch a specific OpenOrders account
        const openOrdersPubkey = loadPublicKey(argv.openOrders);
        logger.info(`Fetching OpenOrders account: ${openOrdersPubkey.toBase58()}`);

        const marketPubkey = argv.market ? loadPublicKey(argv.market) : undefined;
        const market = marketPubkey ? await validateAndFetchMarket(connection, client, marketPubkey) : undefined;

        const openOrders = await OpenOrders.load(openOrdersPubkey, market ?? undefined, client);
        logger.info('Current Position:');
        logger.info(openOrders.toPrettyString());
      } else if (argv.wallet) {
        // Fetch all OpenOrders accounts for the wallet
        const walletPubkey = loadPublicKey(argv.wallet);
        logger.info(`Fetching all OpenOrders accounts for wallet: ${walletPubkey.toBase58()}`);

        const marketPubkey = argv.market ? loadPublicKey(argv.market) : undefined;
        const market = marketPubkey ? await validateAndFetchMarket(connection, client, marketPubkey) : undefined;

        const openOrdersList = market
          ? await OpenOrders.loadNullableForMarketAndOwner(market, walletPubkey)
          : await client.findAllOpenOrders(walletPubkey);

        if (Array.isArray(openOrdersList)) {
          for (const openOrdersPubkey of openOrdersList) {
            const openOrders = await OpenOrders.load(openOrdersPubkey, market ?? undefined, client);
            logger.info(openOrders.toPrettyString());
          }
        } else if (openOrdersList) {
          logger.info(openOrdersList.toPrettyString());
        } else {
          logger.info('No OpenOrders accounts found.');
        }
      }
    } catch (error) {
      logger.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  },
};

export default getOrder;

