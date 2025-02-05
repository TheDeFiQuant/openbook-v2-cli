/**
 * CLI Command: listMarkets
 *
 * Description:
 *   Loads all market accounts from the exchange and displays the following
 *   for each market:
 *     - Market name
 *     - Market public key
 *     - Base token symbol
 *     - Quote token symbol
 *     - Base vault balance in UI units (converted using the base mint’s decimals)
 *     - Quote vault balance in UI units (converted using the quote mint’s decimals)
 *
 * The conversion from native units to UI amounts is done using the mint account's decimals.
 *
 * Example Usage:
 *   npx ts-node cli.ts listMarkets
 */

import { CommandModule } from 'yargs';
import { Connection, PublicKey } from '@solana/web3.js';
import { createConnection, createProvider, createClient, createStubWallet } from '../utils/helper';
import logger from '../utils/logger';
import { 
  nameToString, 
  quoteLotsToUi,
  type MarketAccount,
} from '@openbook-dex/openbook-v2';
import { BN } from '@coral-xyz/anchor';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata, fetchMetadata, findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi-public-keys';
import { RPC_CONFIG } from '../utils/config';
import Big from 'big.js';
import { getMint } from '@solana/spl-token';

/**
 * Helper: Convert a native amount into a UI amount using the mint's decimals.
 * For example, if nativeAmount = 25880000 and decimals = 5, then UI amount = 25880000 / 10^5 = 258.8.
 */
function toUiDecimals(nativeAmount: number, decimals: number): number {
  return nativeAmount / Math.pow(10, decimals);
}

/**
 * Retrieves the token symbol from the mint's metadata.
 */
async function getTokenSymbol(connection: Connection, mint: PublicKey): Promise<string> {
  try {
    const umi = createUmi(RPC_CONFIG.MAINNET_URL);
    umi.use(mplTokenMetadata());
    const metadataPda = findMetadataPda(umi, { mint: publicKey(mint) });
    const metadata = await fetchMetadata(umi, metadataPda);
    return metadata.symbol;
  } catch {
    return 'N/A';
  }
}

interface ListMarketsArgs {}

/**
 * Main command handler.
 */
const listMarkets: CommandModule<{}, ListMarketsArgs> = {
  command: 'listMarkets',
  describe:
    'Load all market accounts and display their market name, pubkey, token symbols, and vault balances (UI amounts)',
  builder: (yargs) =>
    yargs.example('npx ts-node cli.ts listMarkets', 'Lists all markets using the default RPC endpoint'),
  handler: async () => {
    try {
      logger.info('Connecting to RPC endpoint...');
      const connection: Connection = createConnection();

      logger.info('Creating provider and stub wallet...');
      const wallet = createStubWallet();
      const provider = createProvider(connection, wallet);

      logger.info('Initializing OpenBook client...');
      const client = createClient(provider);

      logger.info('Loading market accounts...');
      const marketAccounts = await client.program.account.market.all();
      logger.info(`Loaded ${marketAccounts.length} market account(s).`);

      if (marketAccounts.length === 0) {
        logger.info('No markets found.');
        return;
      }

      // Array to store processed market data.
      const marketsData: {
        marketName: string;
        marketPubkey: string;
        baseSymbol: string;
        quoteSymbol: string;
        baseBalance: number;
        quoteBalance: number;
      }[] = [];

      let processedCount = 0;
      // Process each market account.
      for (const marketAccount of marketAccounts) {
        try {
          processedCount++;
          // Update progress on the same line.
          process.stdout.write(`Processed ${processedCount} of ${marketAccounts.length} markets...\r`);

          const marketPubkey = marketAccount.publicKey;
          const market = marketAccount.account;

          // Fetch mint info for base and quote mints to use their decimals.
          const baseMintInfo = await getMint(connection, market.baseMint);
          const quoteMintInfo = await getMint(connection, market.quoteMint);

          // Retrieve vault balances (in native units).
          const baseVaultInfo = await connection
            .getTokenAccountBalance(market.marketBaseVault)
            .catch(() => null);
          const quoteVaultInfo = await connection
            .getTokenAccountBalance(market.marketQuoteVault)
            .catch(() => null);

          const rawBaseBalance = baseVaultInfo ? parseFloat(baseVaultInfo.value.amount) : 0;
          const rawQuoteBalance = quoteVaultInfo ? parseFloat(quoteVaultInfo.value.amount) : 0;

          // Convert native amounts to UI amounts using mint decimals.
          const uiBaseBalance = toUiDecimals(rawBaseBalance, baseMintInfo.decimals);
          const uiQuoteBalance = toUiDecimals(rawQuoteBalance, quoteMintInfo.decimals);

          const marketName = market.name ? nameToString(market.name) : 'Unnamed';

          // Get token symbols from their mint accounts.
          const baseSymbol = await getTokenSymbol(connection, market.baseMint);
          const quoteSymbol = await getTokenSymbol(connection, market.quoteMint);

          marketsData.push({
            marketName,
            marketPubkey: marketPubkey.toBase58(),
            baseSymbol,
            quoteSymbol,
            baseBalance: uiBaseBalance,
            quoteBalance: uiQuoteBalance,
          });
        } catch (err) {
          logger.error(
            `Error processing market ${marketAccount.publicKey.toBase58()}: ${(err as Error).message}`
          );
        }
      }

      // Ensure the progress line finishes with a newline.
      console.log('');

      logger.info(`Finished processing ${processedCount} market(s).`);
      logger.info(`Displaying ${marketsData.length} market(s).`);

      // Define table headers.
      const headers = {
        marketName: 'Market Name',
        marketPubkey: 'Market Pubkey',
        baseSymbol: 'Base Symbol',
        quoteSymbol: 'Quote Symbol',
        baseBalance: 'Base Balance',
        quoteBalance: 'Quote Balance',
      };

      // Determine column widths based on header and data lengths.
      const colWidths = {
        marketName: Math.max(
          ...marketsData.map((d) => d.marketName.length),
          headers.marketName.length,
          20
        ),
        marketPubkey: Math.max(
          ...marketsData.map((d) => d.marketPubkey.length),
          headers.marketPubkey.length,
          44
        ),
        baseSymbol: Math.max(
          ...marketsData.map((d) => d.baseSymbol.length),
          headers.baseSymbol.length,
          12
        ),
        quoteSymbol: Math.max(
          ...marketsData.map((d) => d.quoteSymbol.length),
          headers.quoteSymbol.length,
          12
        ),
        baseBalance: Math.max(
          ...marketsData.map((d) => d.baseBalance.toString().length),
          headers.baseBalance.length,
          12
        ),
        quoteBalance: Math.max(
          ...marketsData.map((d) => d.quoteBalance.toString().length),
          headers.quoteBalance.length,
          12
        ),
      };

      // Build header line.
      const headerLine =
        `${headers.marketName.padEnd(colWidths.marketName)} | ` +
        `${headers.marketPubkey.padEnd(colWidths.marketPubkey)} | ` +
        `${headers.baseSymbol.padEnd(colWidths.baseSymbol)} | ` +
        `${headers.quoteSymbol.padEnd(colWidths.quoteSymbol)} | ` +
        `${headers.baseBalance.padEnd(colWidths.baseBalance)} | ` +
        `${headers.quoteBalance.padEnd(colWidths.quoteBalance)}`;

      const totalWidth =
        colWidths.marketName +
        colWidths.marketPubkey +
        colWidths.baseSymbol +
        colWidths.quoteSymbol +
        colWidths.baseBalance +
        colWidths.quoteBalance +
        5 * 3;
      const separator = '-'.repeat(totalWidth);

      logger.info('Printing market table:');
      console.log(headerLine);
      console.log(separator);

      // Print each market row.
      for (const data of marketsData) {
        const row =
          `${data.marketName.padEnd(colWidths.marketName)} | ` +
          `${data.marketPubkey.padEnd(colWidths.marketPubkey)} | ` +
          `${data.baseSymbol.padEnd(colWidths.baseSymbol)} | ` +
          `${data.quoteSymbol.padEnd(colWidths.quoteSymbol)} | ` +
          `${data.baseBalance.toString().padEnd(colWidths.baseBalance)} | ` +
          `${data.quoteBalance.toString().padEnd(colWidths.quoteBalance)}`;
        console.log(row);
      }
    } catch (error) {
      logger.error(`Error listing markets: ${(error as Error).message}`);
      process.exit(1);
    }
  },
};

export default listMarkets;
