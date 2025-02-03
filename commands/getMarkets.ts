/**
 * CLI Command: getMarkets
 * 
 * Description:
 * - Retrieves all markets listed on OpenBook.
 *
 * Example Usage:
 * npx ts-node cli.ts getMarkets
 *
 */

import { CommandModule } from 'yargs';
import { Connection } from '@solana/web3.js';
import { findAllMarkets } from '../utils/market';
import { createConnection, createProvider, createStubWallet } from '../utils/helper';
import logger from '../utils/logger';
import { PROGRAM_IDS } from '../utils/config';

/**
 * CLI command to fetch all markets on OpenBook.
 */
const getMarkets: CommandModule<{}, {}> = {
  command: 'getMarkets',
  describe: 'Retrieve all markets listed on OpenBook',
  builder: (yargs) => yargs,
  handler: async () => {
    // Establish a connection to the Solana blockchain
    const connection: Connection = createConnection();

    // Create a read-only wallet for querying market data
    const wallet = createStubWallet();

    // Initialize an Anchor provider for interactions with the Solana blockchain
    const provider = createProvider(connection, wallet);

    try {
      logger.info('Fetching all markets on OpenBook...');

      // Retrieve all markets
      const markets = await findAllMarkets(connection, PROGRAM_IDS.OPENBOOK_V2_PROGRAM_ID, provider);

      if (markets.length === 0) {
        logger.info('No markets found on OpenBook.');
        return;
      }

      // Log and display market data
      logger.info(`Found ${markets.length} markets on OpenBook:`);
      for (const market of markets) {
        logger.info(
          `Market: ${market.market}\n  Base Mint: ${market.baseMint}\n  Quote Mint: ${market.quoteMint}\n  Name: ${market.name}\n  Timestamp: ${new Date(market.timestamp! * 1000).toLocaleString()}`
        );
      }
    } catch (error) {
      logger.error(`Error occurred while fetching markets: ${(error as Error).message}`);
    }
  },
};

export default getMarkets;
