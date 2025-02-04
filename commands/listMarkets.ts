/**
 * CLI Command: listMarkets
 *
 * Description:
 *   Lists all markets on the exchange along with their base and quote vault balances.
 *
 * Example Usage:
 *   npx ts-node cli.ts listMarkets
 */

import { CommandModule } from 'yargs';
import { Connection } from '@solana/web3.js';
import { createConnection, createProvider, createClient, createStubWallet } from '../utils/helper';
import logger from '../utils/logger';
import { nameToString } from '@openbook-dex/openbook-v2'; // Adjust the import path if needed

interface ListMarketsArgs {
  // No additional arguments required.
}

const listMarkets: CommandModule<{}, ListMarketsArgs> = {
  command: 'listMarkets',
  describe: 'List all markets with their base and quote vault balances',
  builder: (yargs) =>
    yargs.example('npx ts-node cli.ts listMarkets', 'Lists all markets using the default RPC endpoint'),
  handler: async () => {
    try {
      // Establish a connection using the default RPC endpoint from your config.
      const connection: Connection = createConnection();

      // Create a read-only wallet and an Anchor provider.
      const wallet = createStubWallet();
      const provider = createProvider(connection, wallet);

      // Initialize the OpenBook client.
      const client = createClient(provider);

      logger.info('Fetching all market accounts...');

      // Fetch all market accounts.
      const marketAccounts = await client.program.account.market.all();

      if (marketAccounts.length === 0) {
        logger.info('No markets found.');
        return;
      }

      // Define fixed column widths for the table.
      const colWidths = {
        marketName: 20,
        marketPubkey: 44,
        baseVault: 44,
        quoteVault: 44,
        quoteBalance: 14,
        baseBalance: 18, // Increased width for Base Balance
      };

      // Build the table header.
      const header =
        `${'Market Name'.padEnd(colWidths.marketName)} | ` +
        `${'Market Pubkey'.padEnd(colWidths.marketPubkey)} | ` +
        `${'Base Vault'.padEnd(colWidths.baseVault)} | ` +
        `${'Quote Vault'.padEnd(colWidths.quoteVault)} | ` +
        `${'Quote Balance'.padEnd(colWidths.quoteBalance)} | ` +
        `${'Base Balance'.padEnd(colWidths.baseBalance)}`;

      // Calculate total width for the separator (add 5 separators " | " at 3 characters each).
      const totalWidth =
        colWidths.marketName +
        colWidths.marketPubkey +
        colWidths.baseVault +
        colWidths.quoteVault +
        colWidths.quoteBalance +
        colWidths.baseBalance +
        5 * 3;
      const separator = '-'.repeat(totalWidth);

      // Prepare an array to hold data for each market.
      const marketsData: {
        marketName: string;
        marketPubkey: string;
        baseVault: string;
        baseBalance: number;
        quoteVault: string;
        quoteBalance: number;
      }[] = [];

      // Iterate over each market and fetch vault balances.
      for (const marketAccount of marketAccounts) {
        try {
          const marketPubkey = marketAccount.publicKey;
          const market = marketAccount.account; // Decoded MarketAccount object

          // Fetch vault balances using the RPC client; default to 0 if call fails.
          const baseVaultInfo = await connection
            .getTokenAccountBalance(market.marketBaseVault)
            .catch(() => null);
          const quoteVaultInfo = await connection
            .getTokenAccountBalance(market.marketQuoteVault)
            .catch(() => null);

          const baseBalance = baseVaultInfo ? parseFloat(baseVaultInfo.value.amount) : 0;
          const quoteBalance = quoteVaultInfo ? parseFloat(quoteVaultInfo.value.amount) : 0;

          // Convert market name (stored as a number array) to a string using nameToString.
          const marketName = market.name ? nameToString(market.name) : 'Unnamed';

          marketsData.push({
            marketName,
            marketPubkey: marketPubkey.toBase58(),
            baseVault: market.marketBaseVault.toBase58(),
            quoteVault: market.marketQuoteVault.toBase58(),
            quoteBalance,
            baseBalance,
          });
        } catch (err) {
          logger.error(
            `Error fetching vault balances for market ${marketAccount.publicKey.toBase58()}: ${(err as Error).message}`
          );
        }
      }

      // Print header and separator.
      console.log(header);
      console.log(separator);

      // Print each row in the new column order.
      for (const data of marketsData) {
        const row =
          `${data.marketName.padEnd(colWidths.marketName)} | ` +
          `${data.marketPubkey.padEnd(colWidths.marketPubkey)} | ` +
          `${data.baseVault.padEnd(colWidths.baseVault)} | ` +
          `${data.quoteVault.padEnd(colWidths.quoteVault)} | ` +
          `${data.quoteBalance.toString().padEnd(colWidths.quoteBalance)} | ` +
          `${data.baseBalance.toString().padEnd(colWidths.baseBalance)}`;
        console.log(row);
      }
    } catch (error) {
      logger.error(`Error listing markets: ${(error as Error).message}`);
      process.exit(1);
    }
  },
};

export default listMarkets;
