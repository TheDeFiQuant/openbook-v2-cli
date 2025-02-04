/**
 * CLI Command: getMarkets
 * 
 * Description:
 * - Retrieves all markets listed on OpenBook along with vault balances.
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
  describe: 'Retrieve all markets listed on OpenBook along with vault balances',
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

      // Retrieve all markets, including vault balances
      const markets = await findAllMarkets(connection, PROGRAM_IDS.OPENBOOK_V2_PROGRAM_ID, provider);

      if (markets.length === 0) {
        logger.info('No markets found on OpenBook.');
        return;
      }

      // **Column Formatting Setup**
      const colWidths = {
        market: 45,
        name: 20,
        baseMint: 45,
        quoteMint: 45,
        baseVaultBalance: 15,
        quoteVaultBalance: 15
      };

      const header = 
        `${'Market'.padEnd(colWidths.market)} | ` +
        `${'Name'.padEnd(colWidths.name)} | ` +
        `${'Base Mint'.padEnd(colWidths.baseMint)} | ` +
        `${'Quote Mint'.padEnd(colWidths.quoteMint)} | ` +
        `${'Base Vault Balance'.padEnd(colWidths.baseVaultBalance)} | ` +
        `${'Quote Vault Balance'.padEnd(colWidths.quoteVaultBalance)}`;

      const separator = '-'.repeat(header.length);

      console.log('\n' + header);
      console.log(separator);

      // **Formatted Table Output**
      for (const market of markets) {
        console.log(
          `${market.market.padEnd(colWidths.market)} | ` +
          `${market.name.padEnd(colWidths.name)} | ` +
          `${market.baseMint.padEnd(colWidths.baseMint)} | ` +
          `${market.quoteMint.padEnd(colWidths.quoteMint)} | ` +
          `${(market.baseVaultBalance !== 'Unavailable' ? market.baseVaultBalance.toFixed(6) : 'Unavailable').padEnd(colWidths.baseVaultBalance)} | ` +
          `${(market.quoteVaultBalance !== 'Unavailable' ? market.quoteVaultBalance.toFixed(6) : 'Unavailable').padEnd(colWidths.quoteVaultBalance)}`
        );
      }

      console.log(separator);

    } catch (error) {
      logger.error(`Error occurred while fetching markets: ${(error as Error).message}`);
    }
  },
};

export default getMarkets;
