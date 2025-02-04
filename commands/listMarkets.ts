/**
 * CLI Command: listMarkets
 *
 * Description:
 *   Lists all markets on the exchange along with their base and quote vault balances (UI amounts)
 *   and token symbols for the base and quote mints.
 *
 * Example Usage:
 *   npx ts-node cli.ts listMarkets
 */

import { CommandModule } from 'yargs';
import { Connection, PublicKey } from '@solana/web3.js';
import { createConnection, createProvider, createClient, createStubWallet } from '../utils/helper';
import logger from '../utils/logger';
import { nameToString, baseLotsToUi, quoteLotsToUi } from '@openbook-dex/openbook-v2';
import { BN } from '@coral-xyz/anchor';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplTokenMetadata, fetchMetadata, findMetadataPda } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi-public-keys';
import { RPC_CONFIG } from '../utils/config';

async function getTokenSymbol(connection: Connection, mint: PublicKey): Promise<string> {
  try {
    // Initialize Umi using the same RPC as Solana
    const umi = createUmi(RPC_CONFIG.MAINNET_URL);
    umi.use(mplTokenMetadata());

    // Convert Solana PublicKey to Umi PublicKey
    const metadataPda = findMetadataPda(umi, { mint: publicKey(mint) });
    const metadata = await fetchMetadata(umi, metadataPda);

    return metadata.symbol;
  } catch (error) {
    logger.warn(`Unable to fetch token symbol for mint ${mint.toBase58()}: ${(error as Error).message}`);
    return 'N/A';
  }
}

interface ListMarketsArgs {}

const listMarkets: CommandModule<{}, ListMarketsArgs> = {
  command: 'listMarkets',
  describe:
    'List all markets with their base and quote vault balances (UI amounts) and token symbols for the base and quote mints',
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

      const marketAccounts = await client.program.account.market.all();

      if (marketAccounts.length === 0) {
        logger.info('No markets found.');
        return;
      }

      const marketsData: {
        marketName: string;
        marketPubkey: string;
        baseVault: string;
        quoteVault: string;
        baseSymbol: string;
        quoteSymbol: string;
        quoteBalance: number;
        baseBalance: number;
      }[] = [];

      for (const marketAccount of marketAccounts) {
        try {
          const marketPubkey = marketAccount.publicKey;
          const market = marketAccount.account;

          const baseVaultInfo = await connection
            .getTokenAccountBalance(market.marketBaseVault)
            .catch(() => null);
          const quoteVaultInfo = await connection
            .getTokenAccountBalance(market.marketQuoteVault)
            .catch(() => null);

          const rawBaseBalance = baseVaultInfo ? new BN(baseVaultInfo.value.amount) : new BN(0);
          const rawQuoteBalance = quoteVaultInfo ? new BN(quoteVaultInfo.value.amount) : new BN(0);

          const uiBaseBalance = baseLotsToUi(market, rawBaseBalance);
          const uiQuoteBalance = quoteLotsToUi(market, rawQuoteBalance);

          const marketName = market.name ? nameToString(market.name) : 'Unnamed';

          const baseSymbol = await getTokenSymbol(connection, market.baseMint);
          const quoteSymbol = await getTokenSymbol(connection, market.quoteMint);

          marketsData.push({
            marketName,
            marketPubkey: marketPubkey.toBase58(),
            baseVault: market.marketBaseVault.toBase58(),
            quoteVault: market.marketQuoteVault.toBase58(),
            baseSymbol,
            quoteSymbol,
            quoteBalance: uiQuoteBalance,
            baseBalance: uiBaseBalance,
          });
        } catch (err) {
          logger.error(
            `Error processing market ${marketAccount.publicKey.toBase58()}: ${(err as Error).message}`
          );
        }
      }

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

      const colWidths = {
        marketName: 20,
        marketPubkey: 44,
        baseVault: 44,
        quoteVault: 44,
        baseSymbol: 12,
        quoteSymbol: 12,
        quoteBalance: maxQuoteBalanceLength,
        baseBalance: maxBaseBalanceLength,
      };

      const header =
        `${'Market Name'.padEnd(colWidths.marketName)} | ` +
        `${'Market Pubkey'.padEnd(colWidths.marketPubkey)} | ` +
        `${'Base Vault'.padEnd(colWidths.baseVault)} | ` +
        `${'Quote Vault'.padEnd(colWidths.quoteVault)} | ` +
        `${'Base Symbol'.padEnd(colWidths.baseSymbol)} | ` +
        `${'Quote Symbol'.padEnd(colWidths.quoteSymbol)} | ` +
        `${quoteBalanceHeader.padEnd(colWidths.quoteBalance)} | ` +
        `${baseBalanceHeader.padEnd(colWidths.baseBalance)}`;

      const totalWidth =
        colWidths.marketName +
        colWidths.marketPubkey +
        colWidths.baseVault +
        colWidths.quoteVault +
        colWidths.baseSymbol +
        colWidths.quoteSymbol +
        colWidths.quoteBalance +
        colWidths.baseBalance +
        7 * 3;
      const separator = '-'.repeat(totalWidth);

      console.log(header);
      console.log(separator);

      for (const data of marketsData) {
        const row =
          `${data.marketName.padEnd(colWidths.marketName)} | ` +
          `${data.marketPubkey.padEnd(colWidths.marketPubkey)} | ` +
          `${data.baseVault.padEnd(colWidths.baseVault)} | ` +
          `${data.quoteVault.padEnd(colWidths.quoteVault)} | ` +
          `${data.baseSymbol.padEnd(colWidths.baseSymbol)} | ` +
          `${data.quoteSymbol.padEnd(colWidths.quoteSymbol)} | ` +
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
