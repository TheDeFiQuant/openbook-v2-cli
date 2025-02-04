/**
 * CLI Command: listMarkets
 *
 * Description:
 *   Lists all markets on the exchange along with their base and quote vault balances (UI amounts)
 *   and the associated token mints for the base and quote vaults.
 *
 * Example Usage:
 *   npx ts-node cli.ts listMarkets
 */

import { CommandModule } from 'yargs';
import { Connection } from '@solana/web3.js';
import { createConnection, createProvider, createClient, createStubWallet } from '../utils/helper';
import logger from '../utils/logger';
import { nameToString, baseLotsToUi, quoteLotsToUi } from '@openbook-dex/openbook-v2'; // Adjust the import path if needed
import { BN } from '@coral-xyz/anchor';

interface ListMarketsArgs {
  // No additional arguments required.
}

const listMarkets: CommandModule<{}, ListMarketsArgs> = {
  command: 'listMarkets',
  describe:
    'List all markets with their base and quote vault balances (UI amounts) and token mint addresses',
  builder: (yargs) =>
    yargs.example('npx ts-node cli.ts listMarkets', 'Lists all markets using the default RPC endpoint'),
  handler: async () => {
    try {
      // Establish a connection using the default RPC endpoint.
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

      // Prepare an array to hold data for each market.
      const marketsData: {
        marketName: string;
        marketPubkey: string;
        baseVault: string;
        quoteVault: string;
        baseMint: string;
        quoteMint: string;
        quoteBalance: number;
        baseBalance: number;
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

          // Convert the raw amounts to BN and then to UI amounts.
          const rawBaseBalance = baseVaultInfo ? new BN(baseVaultInfo.value.amount) : new BN(0);
          const rawQuoteBalance = quoteVaultInfo ? new BN(quoteVaultInfo.value.amount) : new BN(0);

          const uiBaseBalance = baseLotsToUi(market, rawBaseBalance);
          const uiQuoteBalance = quoteLotsToUi(market, rawQuoteBalance);

          // Convert market name (stored as a number array) to a string using nameToString.
          const marketName = market.name ? nameToString(market.name) : 'Unnamed';

          marketsData.push({
            marketName,
            marketPubkey: marketPubkey.toBase58(),
            baseVault: market.marketBaseVault.toBase58(),
            quoteVault: market.marketQuoteVault.toBase58(),
            baseMint: market.baseMint.toBase58(),
            quoteMint: market.quoteMint.toBase58(),
            quoteBalance: uiQuoteBalance,
            baseBalance: uiBaseBalance,
          });
        } catch (err) {
          logger.error(
            `Error fetching vault balances for market ${marketAccount.publicKey.toBase58()}: ${(err as Error).message}`
          );
        }
      }

      // Determine the dynamic column widths for the balance columns based on the maximum length of their string representations.
      const quoteBalanceHeader = 'Quote Balance';
      const baseBalanceHeader = 'Base Balance';
      const maxQuoteBalanceLength = Math.max(
        ...marketsData.map((d) => d.quoteBalance.toString().length),
        quoteBalanceHeader.length
      );
      const maxBaseBalanceLength = Math.max(
        ...marketsData.map((d) => d.baseBalance.toString().length),
        baseBalanceHeader.length
      );

      // Define fixed widths for the other columns.
      const colWidths = {
        marketName: 20,
        marketPubkey: 44,
        baseVault: 44,
        quoteVault: 44,
        baseMint: 44,
        quoteMint: 44,
        quoteBalance: maxQuoteBalanceLength,
        baseBalance: maxBaseBalanceLength,
      };

      // Build the table header with the new columns.
      const header =
        `${'Market Name'.padEnd(colWidths.marketName)} | ` +
        `${'Market Pubkey'.padEnd(colWidths.marketPubkey)} | ` +
        `${'Base Vault'.padEnd(colWidths.baseVault)} | ` +
        `${'Quote Vault'.padEnd(colWidths.quoteVault)} | ` +
        `${'Base Mint'.padEnd(colWidths.baseMint)} | ` +
        `${'Quote Mint'.padEnd(colWidths.quoteMint)} | ` +
        `${quoteBalanceHeader.padEnd(colWidths.quoteBalance)} | ` +
        `${baseBalanceHeader.padEnd(colWidths.baseBalance)}`;

      // Calculate the total width for the separator (7 separators " | " at 3 characters each).
      const totalWidth =
        colWidths.marketName +
        colWidths.marketPubkey +
        colWidths.baseVault +
        colWidths.quoteVault +
        colWidths.baseMint +
        colWidths.quoteMint +
        colWidths.quoteBalance +
        colWidths.baseBalance +
        7 * 3;
      const separator = '-'.repeat(totalWidth);

      // Print header and separator.
      console.log(header);
      console.log(separator);

      // Print each row.
      for (const data of marketsData) {
        const row =
          `${data.marketName.padEnd(colWidths.marketName)} | ` +
          `${data.marketPubkey.padEnd(colWidths.marketPubkey)} | ` +
          `${data.baseVault.padEnd(colWidths.baseVault)} | ` +
          `${data.quoteVault.padEnd(colWidths.quoteVault)} | ` +
          `${data.baseMint.padEnd(colWidths.baseMint)} | ` +
          `${data.quoteMint.padEnd(colWidths.quoteMint)} | ` +
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
