/**
 * CLI Command: getOOA
 * 
 * Description
 * Fetches all OpenOrders accounts and the OpenOrdersIndexer for a given owner. 
 * If a market is specified, it fetches only OpenOrders accounts associated with that market.
 *
 * Example Usage
 * npx ts-node cli.ts getOOA <OWNER_PUBLIC_KEY> [--market <MARKET_PUBLIC_KEY>]
 *  
 * Parameters
 * --owner (Required): Public key of the account owner whose OpenOrders accounts are being fetched.
 * --market (Optional): Public key of the market to filter OpenOrders accounts.
 * 
 */

import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey, createStubWallet } from '../utils/helper';
import { OpenOrders, nameToString } from '@openbook-dex/openbook-v2';
import logger from '../utils/logger';

/**
 * Interface defining the required arguments for the getOOA command.
 */
interface getOOAArgs {
  owner: string;
  market?: string;
}

/**
 * Command module to fetch OpenOrders accounts and the OpenOrdersIndexer for a specified owner.
 */
const getOOA: CommandModule<{}, getOOAArgs> = {
  command: 'getOOA <owner> [market]',
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
    // Initialize Solana connection
    const connection = createConnection();
    
    // Create a read-only wallet since no signing is needed
    const wallet = createStubWallet();

    // Create a provider to interact with the Solana blockchain
    const provider = createProvider(connection, wallet);

    // Initialize the OpenBook V2 client
    const client = createClient(provider);

    // Convert input arguments into PublicKey objects
    const ownerPk = loadPublicKey(argv.owner);
    const marketPk = argv.market ? loadPublicKey(argv.market) : undefined;

    try {
      logger.info(`Fetching OpenOrders accounts for owner: ${ownerPk.toBase58()}`);

      // Fetch the OpenOrdersIndexer associated with the owner
      logger.info(`Fetching OpenOrdersIndexer...`);
      const indexer = await client.findOpenOrdersIndexer(ownerPk);
      logger.info(`OpenOrdersIndexer: ${indexer.toBase58()}`);

      let openOrdersAccounts;

      // If a market is specified, fetch only the OpenOrders accounts associated with it
      if (marketPk) {
        logger.info(`Fetching OpenOrders accounts for market: ${marketPk.toBase58()}...`);
        openOrdersAccounts = await client.findOpenOrdersForMarket(ownerPk, marketPk);
      } else {
        // Otherwise, fetch all OpenOrders accounts for the owner
        logger.info(`Fetching all OpenOrders accounts for owner...`);
        openOrdersAccounts = await client.findAllOpenOrders(ownerPk);
      }

      // Display the list of OpenOrders accounts if any are found
      if (openOrdersAccounts.length > 0) {
        logger.info('OpenOrders Accounts:');
        for (const [i, acc] of openOrdersAccounts.entries()) {
          try {
            // Deserialize the OpenOrders account details
            const accountDetails = await client.deserializeOpenOrderAccount(acc);
            const name = accountDetails?.name ? nameToString(accountDetails.name) : 'Unnamed';

            // Log the OpenOrders account details
            logger.info(`  ${i + 1}. ${acc.toBase58()} (Name: ${name})`);
          } catch (error) {
            logger.warn(`  ${i + 1}. ${acc.toBase58()} (Error fetching name: ${(error as Error).message})`);
          }
        }
      } else {
        // Log if no OpenOrders accounts are found
        logger.info(
          marketPk
            ? `No OpenOrders accounts found for Market ${marketPk.toBase58()} and Owner ${ownerPk.toBase58()}.`
            : `No OpenOrders accounts found for Owner ${ownerPk.toBase58()}.`
        );
      }
    } catch (error) {
      // Handle and log errors
      logger.error('Error fetching OpenOrders accounts:', (error as Error).message);
      process.exit(1);
    }
  },
};

export default getOOA;