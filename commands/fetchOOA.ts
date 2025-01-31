import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey, createStubWallet } from '../utils/setup';
import { OpenOrders, nameToString } from '@openbook-dex/openbook-v2';
import logger from '../utils/logger';

interface FetchOOAArgs {
  owner: string;
  market?: string;
}

const fetchOOA: CommandModule<{}, FetchOOAArgs> = {
  command: 'fetchOOA <owner> [market]',
  describe: 'Fetch OpenOrders accounts and OpenOrdersIndexer',
  builder: (yargs) =>
    yargs
      .positional('owner', {
        type: 'string',
        demandOption: true,
        description: 'Public key of the owner',
      })
      .option('market', {
        type: 'string',
        description: 'Market public key (optional)',
      }),
  handler: async (argv) => {
    const connection = createConnection();
    const wallet = createStubWallet(); // Read-only wallet, no signing needed
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);

    const ownerPk = loadPublicKey(argv.owner);
    const marketPk = argv.market ? loadPublicKey(argv.market) : undefined;

    try {
      logger.info(`Fetching OpenOrders accounts for owner: ${ownerPk.toBase58()}`);

      // Fetch OpenOrdersIndexer
      logger.info(`Fetching OpenOrdersIndexer...`);
      const indexer = await client.findOpenOrdersIndexer(ownerPk);
      logger.info(`OpenOrdersIndexer: ${indexer.toBase58()}`);

      let openOrdersAccounts;
      if (marketPk) {
        logger.info(`Fetching OpenOrders accounts for market: ${marketPk.toBase58()}...`);
        openOrdersAccounts = await client.findOpenOrdersForMarket(ownerPk, marketPk);
      } else {
        logger.info(`Fetching all OpenOrders accounts for owner...`);
        openOrdersAccounts = await client.findAllOpenOrders(ownerPk);
      }

      if (openOrdersAccounts.length > 0) {
        logger.info('OpenOrders Accounts:');
        for (const [i, acc] of openOrdersAccounts.entries()) {
          try {
            const accountDetails = await client.deserializeOpenOrderAccount(acc);
            const name = accountDetails?.name ? nameToString(accountDetails.name) : 'Unnamed';
            logger.info(`  ${i + 1}. ${acc.toBase58()} (Name: ${name})`);
          } catch (error) {
            logger.warn(`  ${i + 1}. ${acc.toBase58()} (Error fetching name: ${(error as Error).message})`);
          }
        }
      } else {
        logger.info(
          marketPk
            ? `No OpenOrders accounts found for Market ${marketPk.toBase58()} and Owner ${ownerPk.toBase58()}.`
            : `No OpenOrders accounts found for Owner ${ownerPk.toBase58()}.`
        );
      }
    } catch (error) {
      logger.error('Error fetching OpenOrders accounts:', (error as Error).message);
      process.exit(1);
    }
  },
};

export default fetchOOA;
