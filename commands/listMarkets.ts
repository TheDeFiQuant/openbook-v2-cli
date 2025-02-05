/**
 * CLI Command: listMarkets
 *
 * Description:
 *   Loads all market accounts from the exchange and displays for each market:
 *     - Market Name
 *     - Market Pubkey
 *     - Base Token Symbol
 *     - Quote Token Symbol
 *     - Base Deposits (UI units)
 *     - Quote Deposits (UI units)
 *     - Base Deposits in USD
 *     - Quote Deposits in USD
 *
 * The base conversion uses the base mint’s decimals.
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

//──────────────────────────────────────────────────────────────────────────────
// Helper: Convert native amount to UI amount using the mint’s decimals.
function toUiDecimals(nativeAmount: number, decimals: number): number {
  return nativeAmount / Math.pow(10, decimals);
}

//──────────────────────────────────────────────────────────────────────────────
// Helper: Format a number with thousand separators (max 2 fraction digits). 
// Zero is displayed as "0" without decimals.
function formatNumber(num: number): string {
  if (num === 0) return "0";
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

//──────────────────────────────────────────────────────────────────────────────
// Retrieves the token symbol from the mint's metadata.
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

//──────────────────────────────────────────────────────────────────────────────
// Batch fetch prices from Jupiter’s Price API with rate limiting.
// This function processes tokens in batches (50 per batch) and waits 2 seconds between batches.
async function fetchPricesForMints(mintIds: string[]): Promise<{ [id: string]: number }> {
  const result: { [id: string]: number } = {};
  const chunkSize = 50;
  for (let i = 0; i < mintIds.length; i += chunkSize) {
    const chunk = mintIds.slice(i, i + chunkSize);
    const url = `https://api.jup.ag/price/v2?ids=${chunk.join(',')}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.data) {
        for (const id in data.data) {
          result[id] = data.data[id] && data.data[id].price
            ? parseFloat(data.data[id].price)
            : 0;
        }
      }
    } catch (err) {
      logger.error(`Error fetching price for tokens: ${(err as Error).message}`);
    }
    // Wait 2 seconds before processing the next batch.
    if (i + chunkSize < mintIds.length) {
      await new Promise(res => setTimeout(res, 2000));
    }
  }
  return result;
}

//──────────────────────────────────────────────────────────────────────────────
interface ListMarketsArgs {}

//──────────────────────────────────────────────────────────────────────────────
// Main command handler.
const listMarkets: CommandModule<{}, ListMarketsArgs> = {
  command: 'listMarkets',
  describe:
    'Load all market accounts and display their market name, pubkey, token symbols, deposits (UI amounts) and USD values.',
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

      // Array to store processed market data.
      const marketsData: {
        marketName: string;
        marketPubkey: string;
        baseMint: string;
        quoteMint: string;
        baseSymbol: string;
        quoteSymbol: string;
        baseBalance: number;
        quoteBalance: number;
        baseBalanceUsd: number;
        quoteBalanceUsd: number;
      }[] = [];

      let processedCount = 0;
      // Process each market account.
      for (const marketAccount of marketAccounts) {
        try {
          processedCount++;
          // Update the live counter on the same line.
          process.stdout.write(`Processed ${processedCount} of ${marketAccounts.length} markets...\r`);

          const marketPubkey = marketAccount.publicKey;
          const market = marketAccount.account;

          // Fetch mint info for base and quote mints.
          const baseMintInfo = await getMint(connection, market.baseMint);
          const quoteMintInfo = await getMint(connection, market.quoteMint);

          // Retrieve vault balances (in native units).
          const baseVaultInfo = await connection.getTokenAccountBalance(market.marketBaseVault).catch(() => null);
          const quoteVaultInfo = await connection.getTokenAccountBalance(market.marketQuoteVault).catch(() => null);

          const rawBaseBalance = baseVaultInfo ? parseFloat(baseVaultInfo.value.amount) : 0;
          const rawQuoteBalance = quoteVaultInfo ? parseFloat(quoteVaultInfo.value.amount) : 0;

          // Convert native amounts to UI amounts using mint decimals.
          const uiBaseBalance = toUiDecimals(rawBaseBalance, baseMintInfo.decimals);
          const uiQuoteBalance = toUiDecimals(rawQuoteBalance, quoteMintInfo.decimals);

          const marketName = market.name ? nameToString(market.name) : 'Unnamed';

          // Get token symbols.
          const baseSymbol = await getTokenSymbol(connection, market.baseMint);
          const quoteSymbol = await getTokenSymbol(connection, market.quoteMint);

          marketsData.push({
            marketName,
            marketPubkey: marketPubkey.toBase58(),
            baseMint: market.baseMint.toBase58(),
            quoteMint: market.quoteMint.toBase58(),
            baseSymbol,
            quoteSymbol,
            baseBalance: uiBaseBalance,
            quoteBalance: uiQuoteBalance,
            baseBalanceUsd: 0,  // To be updated after fetching prices.
            quoteBalanceUsd: 0, // To be updated after fetching prices.
          });
        } catch (err) {
          logger.error(`Error processing market ${marketAccount.publicKey.toBase58()}: ${(err as Error).message}`);
        }
      }
      // Ensure the live counter goes to a new line once processing is complete.
      console.log('');
      logger.info(`Finished processing ${processedCount} market(s).`);

      // Build a set of unique mints to query prices (only for tokens with nonzero deposits).
      const mintSet = new Set<string>();
      for (const market of marketsData) {
        if (market.baseBalance !== 0) mintSet.add(market.baseMint);
        if (market.quoteBalance !== 0) mintSet.add(market.quoteMint);
      }
      const uniqueMints = Array.from(mintSet);
      logger.info(`Fetching prices for ${uniqueMints.length} unique token(s) from Jupiter API...`);

      // Batch query the Jupiter Price API.
      const prices = await fetchPricesForMints(uniqueMints);
      logger.info('Price data retrieved from Jupiter API.');

      // Update each market with USD deposit values.
      for (const market of marketsData) {
        // If a deposit is 0, the USD value remains 0.
        const basePrice = prices[market.baseMint] || 0;
        const quotePrice = prices[market.quoteMint] || 0;
        market.baseBalanceUsd = market.baseBalance * basePrice;
        market.quoteBalanceUsd = market.quoteBalance * quotePrice;
      }

      // Sort markets in descending order by the sum of base and quote USD deposits.
      marketsData.sort((a, b) => (b.baseBalanceUsd + b.quoteBalanceUsd) - (a.baseBalanceUsd + a.quoteBalanceUsd));
      logger.info(`Displaying ${marketsData.length} market(s).`);

      // Define table headers.
      const headers = {
        marketName: 'Market Name',
        marketPubkey: 'Market Pubkey',
        baseSymbol: 'Base Symbol',
        quoteSymbol: 'Quote Symbol',
        baseBalance: 'Base Deposits',
        quoteBalance: 'Quote Deposits',
        baseBalanceUsd: 'Base Deposits ($)',
        quoteBalanceUsd: 'Quote Deposits ($)',
      };

      // Determine column widths with formatted numbers.
      const colWidths = {
        marketName: Math.max(...marketsData.map((d) => d.marketName.length), headers.marketName.length, 20),
        marketPubkey: Math.max(...marketsData.map((d) => d.marketPubkey.length), headers.marketPubkey.length, 44),
        baseSymbol: Math.max(...marketsData.map((d) => d.baseSymbol.length), headers.baseSymbol.length, 12),
        quoteSymbol: Math.max(...marketsData.map((d) => d.quoteSymbol.length), headers.quoteSymbol.length, 12),
        baseBalance: Math.max(...marketsData.map((d) => formatNumber(d.baseBalance).length), headers.baseBalance.length, 12),
        quoteBalance: Math.max(...marketsData.map((d) => formatNumber(d.quoteBalance).length), headers.quoteBalance.length, 12),
        baseBalanceUsd: Math.max(...marketsData.map((d) => formatNumber(d.baseBalanceUsd).length), headers.baseBalanceUsd.length, 12),
        quoteBalanceUsd: Math.max(...marketsData.map((d) => formatNumber(d.quoteBalanceUsd).length), headers.quoteBalanceUsd.length, 12),
      };

      // Build the header line.
      const headerLine =
        `${headers.marketName.padEnd(colWidths.marketName)} | ` +
        `${headers.marketPubkey.padEnd(colWidths.marketPubkey)} | ` +
        `${headers.baseSymbol.padEnd(colWidths.baseSymbol)} | ` +
        `${headers.quoteSymbol.padEnd(colWidths.quoteSymbol)} | ` +
        `${headers.baseBalance.padEnd(colWidths.baseBalance)} | ` +
        `${headers.quoteBalance.padEnd(colWidths.quoteBalance)} | ` +
        `${headers.baseBalanceUsd.padEnd(colWidths.baseBalanceUsd)} | ` +
        `${headers.quoteBalanceUsd.padEnd(colWidths.quoteBalanceUsd)}`;

      const totalWidth =
        colWidths.marketName +
        colWidths.marketPubkey +
        colWidths.baseSymbol +
        colWidths.quoteSymbol +
        colWidths.baseBalance +
        colWidths.quoteBalance +
        colWidths.baseBalanceUsd +
        colWidths.quoteBalanceUsd +
        7 * 3;
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
          `${formatNumber(data.baseBalance).padEnd(colWidths.baseBalance)} | ` +
          `${formatNumber(data.quoteBalance).padEnd(colWidths.quoteBalance)} | ` +
          `${formatNumber(data.baseBalanceUsd).padEnd(colWidths.baseBalanceUsd)} | ` +
          `${formatNumber(data.quoteBalanceUsd).padEnd(colWidths.quoteBalanceUsd)}`;
        console.log(row);
      }
    } catch (error) {
      logger.error(`Error listing markets: ${(error as Error).message}`);
      process.exit(1);
    }
  },
};

export default listMarkets;
