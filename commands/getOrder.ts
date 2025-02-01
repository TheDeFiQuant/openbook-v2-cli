/**
 * CLI Command: getOrder
 * 
 * Description
 * Fetches the open orders for an OpenBook trading account. 
 * Allows retrieving all OpenOrders accounts for a wallet or a specific OpenOrders account.
 * If a market is specified, results are filtered to that market.
 *
 * Example Usage
 * npx ts-node cli.ts getOrder --wallet <WALLET_PUBLIC_KEY>
 * npx ts-node cli.ts getOrder --openOrders <OPEN_ORDERS_PUBLIC_KEY> [--market <MARKET_PUBLIC_KEY>]
 *  
 * Parameters
 * --wallet (Optional): Public key of the wallet to fetch all OpenOrders accounts.
 * --openOrders (Optional): Public key of a specific OpenOrders account.
 * --market (Optional): Public key of a market to filter the OpenOrders accounts.
 * 
 */

import { CommandModule } from 'yargs';
import {
  createConnection,
  createClient,
  createProvider,
  loadPublicKey,
  createStubWallet,
  validateAndFetchMarket
} from '../utils/helper';
import { Connection, PublicKey } from '@solana/web3.js';
import { OpenBookV2Client, Market, OpenOrders } from '@openbook-dex/openbook-v2/';
import logger from '../utils/logger';

/**
 * Interface defining the arguments for the getOrder command.
 */
interface CLIGetOrderArgs {
  wallet?: string;
  openOrders?: string;
  market?: string;
}

/**
 * CLI command to fetch the current getOrder data for an OpenBook trading account.
 */
const getOrder: CommandModule<{}, CLIGetOrderArgs> = {
  command: 'getOrder',
  describe: 'Fetch current getOrder data for an OpenBook trading account',
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
    // Establish a connection to the Solana blockchain
    const connection: Connection = createConnection();

    // Create a read-only wallet since no signing is needed
    const stubWallet = createStubWallet();

    // Initialize an Anchor provider for blockchain interactions
    const provider = createProvider(connection, stubWallet);

    // Create an OpenBook client for interacting with OpenOrders data
    const client: OpenBookV2Client = createClient(provider);

    try {
      if (argv.openOrders) {
        // Fetch data for a specific OpenOrders account
        const openOrdersPubkey = loadPublicKey(argv.openOrders);
        logger.info(`Fetching OpenOrders account: ${openOrdersPubkey.toBase58()}`);

        // Load market details if a market public key is provided
        const marketPubkey = argv.market ? loadPublicKey(argv.market) : undefined;
        const market = marketPubkey ? await validateAndFetchMarket(connection, client, marketPubkey) : undefined;

        // Load the OpenOrders account details
        const openOrders = await OpenOrders.load(openOrdersPubkey, market ?? undefined, client);
        logger.info('Current getOrder:');
        logger.info(openOrders.toPrettyString());
      } else if (argv.wallet) {
        // Fetch all OpenOrders accounts for the specified wallet
        const walletPubkey = loadPublicKey(argv.wallet);
        logger.info(`Fetching all OpenOrders accounts for wallet: ${walletPubkey.toBase58()}`);

        // Load market details if a market public key is provided
        const marketPubkey = argv.market ? loadPublicKey(argv.market) : undefined;
        const market = marketPubkey ? await validateAndFetchMarket(connection, client, marketPubkey) : undefined;

        // Fetch OpenOrders accounts for the wallet, optionally filtered by market
        const openOrdersList = market
          ? await OpenOrders.loadNullableForMarketAndOwner(market, walletPubkey)
          : await client.findAllOpenOrders(walletPubkey);

        // Display the OpenOrders accounts found
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
      // Log any errors encountered
      logger.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  },
};

export default getOrder;
