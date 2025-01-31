import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey, createStubWallet } from '../utils/setup';
import { Market } from '@openbook-dex/openbook-v2';
import logger from '../utils/logger';

interface MarketDataArgs {
  market: string;
  bestbidask?: boolean;
  book?: boolean;
}

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
    const connection = createConnection();
    const wallet = createStubWallet();
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);
    const marketPubkey = loadPublicKey(argv.market);

    try {
      logger.info(`Loading market: ${marketPubkey.toBase58()}...`);
      const market = await Market.load(client, marketPubkey);

      // Monitor best bid/ask prices
      if (argv.bestbidask) {
        logger.info('Monitoring best bid/ask prices...');
        setInterval(async () => {
          await market.loadOrderBook();
          const bestBid = market.bids?.best();
          const bestAsk = market.asks?.best();

          const bidPrice = bestBid?.price?.toFixed(4) || 'N/A';
          const askPrice = bestAsk?.price?.toFixed(4) || 'N/A';

          logger.info(`Best Bid: ${bidPrice} | Best Ask: ${askPrice}`);
        }, 1000);
      }

      // Monitor order book liquidity
      if (argv.book) {
        logger.info('Displaying order book liquidity...');
        setInterval(async () => {
          await market.loadOrderBook();
          console.clear();
          console.log(
            'Price (Bid)     | Size (Bid)      | Amount (Bid)    || Price (Ask)     | Size (Ask)      | Amount (Ask)'
          );
          console.log(
            '--------------- | --------------- | --------------- || --------------- | --------------- | ---------------'
          );

          const depth = 10;
          const bids = market.bids?.getL2(depth) || [];
          const asks = market.asks?.getL2(depth) || [];

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
      logger.error(`Error fetching market data: ${(error as Error).message}`);
    }
  },
};

export default marketData;
