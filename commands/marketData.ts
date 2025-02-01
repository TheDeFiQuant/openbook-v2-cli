/**
 * CLI Command: marketData
 * 
 * Description
 * Monitors the order book for a specified market, displaying real-time updates on best bid/ask prices or the full order book liquidity.
 *
 * Example Usage
 * npx ts-node cli.ts marketData <MARKET_PUBLIC_KEY> --bestbidask
 * npx ts-node cli.ts marketData <MARKET_PUBLIC_KEY> --book
 *  
 * Parameters
 * --market (Required): Public key of the market to monitor.
 * --bestbidask (Optional): Monitor and display the best bid/ask prices.
 * --book (Optional): Display the full order book liquidity.
 * 
 */

import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey, createStubWallet } from '../utils/setup';
import { Market } from '@openbook-dex/openbook-v2';
import logger from '../utils/logger';

/**
 * Interface defining the required arguments for the marketData command.
 */
interface MarketDataArgs {
  market: string;
  bestbidask?: boolean;
  book?: boolean;
}

/**
 * CLI command to monitor market data, including order book and best bid/ask prices.
 */
const marketData: CommandModule<{}, MarketDataArgs> = {
  command: 'marketData <market>',
  describe: 'Monitor market order book',
  builder: (yargs) =>
    yargs
      .positional('market', {
        type: 'string',
        demandOption: true,
        description: 'Market public key',
      })
      .option('bestbidask', {
        type: 'boolean',
        description: 'Monitor best bid/ask prices',
      })
      .option('book', {
        type: 'boolean',
        description: 'Display order book liquidity',
      }),
  handler: async (argv) => {
    // Establish a connection to the Solana blockchain
    const connection = createConnection();

    // Create a read-only wallet for querying market data
    const wallet = createStubWallet();

    // Initialize an Anchor provider for interactions with the Solana blockchain
    const provider = createProvider(connection, wallet);

    // Create an OpenBook client for fetching market data
    const client = createClient(provider);

    // Load the market public key from the provided argument
    const marketPubkey = loadPublicKey(argv.market);

    try {
      logger.info(`Loading market: ${marketPubkey.toBase58()}...`);

      // Load the market details from OpenBook
      const market = await Market.load(client, marketPubkey);

      // Monitor best bid/ask prices
      if (argv.bestbidask) {
        logger.info('Monitoring best bid/ask prices...');
        setInterval(async () => {
          // Load the latest order book data
          await market.loadOrderBook();

          // Retrieve the best bid and best ask prices
          const bestBid = market.bids?.best();
          const bestAsk = market.asks?.best();

          // Format the best bid and ask prices for display
          const bidPrice = bestBid?.price?.toFixed(4) || 'N/A';
          const askPrice = bestAsk?.price?.toFixed(4) || 'N/A';

          logger.info(`Best Bid: ${bidPrice} | Best Ask: ${askPrice}`);
        }, 1000);
      }

      // Monitor full order book liquidity
      if (argv.book) {
        logger.info('Displaying order book liquidity...');
        setInterval(async () => {
          // Load the latest order book data
          await market.loadOrderBook();

          // Clear the console for a real-time order book display
          console.clear();
          console.log(
            'Price (Bid)     | Size (Bid)      | Amount (Bid)    || Price (Ask)     | Size (Ask)      | Amount (Ask)'
          );
          console.log(
            '--------------- | --------------- | --------------- || --------------- | --------------- | ---------------'
          );

          // Define the order book depth to display
          const depth = 10;

          // Retrieve bid and ask orders up to the defined depth
          const bids = market.bids?.getL2(depth) || [];
          const asks = market.asks?.getL2(depth) || [];

          // Iterate through the order book and display bid/ask levels
          for (let i = 0; i < depth; i++) {
            const bid = bids[i] || [null, null];
            const ask = asks[i] || [null, null];

            const bidPrice = bid[0]?.toFixed(4) || 'N/A';
            const bidSize = bid[1]?.toFixed(4) || 'N/A';
            const bidAmount = bid[0] && bid[1] ? (bid[0] * bid[1]).toFixed(4) : 'N/A';

            const askPrice = ask[0]?.toFixed(4) || 'N/A';
            const askSize = ask[1]?.toFixed(4) || 'N/A';
            const askAmount = ask[0] && ask[1] ? (ask[0] * ask[1]).toFixed(4) : 'N/A';

            console.log(
              `${bidPrice.padEnd(15)} | ${bidSize.padEnd(15)} | ${bidAmount.padEnd(15)} || ${askPrice.padEnd(15)} | ${askSize.padEnd(15)} | ${askAmount.padEnd(15)}`
            );
          }
        }, 1000);
      }
    } catch (error) {
      // Log any errors encountered while fetching market data
      logger.error(`Error fetching market data: ${(error as Error).message}`);
    }
  },
};

export default marketData;
