import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey } from '../utils/setup';
import logger from '../utils/logger';

interface MarketDataArgs {
  market: string;
  bestbidask?: boolean;
  book?: boolean;
}

const marketData: CommandModule = {
  command: 'marketData',
  describe: 'Monitor market order book',
  builder: (yargs) =>
    yargs
      .option('market', {
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
  handler: async (argv: MarketDataArgs) => {
    const connection = createConnection();
    const provider = createProvider(connection, null); // Stub wallet
    const client = createClient(provider);
    const marketPubkey = loadPublicKey(argv.market);

    try {
      logger.info(`Loading market: ${marketPubkey.toBase58()}`);
      const market = await client.loadMarket(marketPubkey);

      if (argv.bestbidask) {
        logger.info('Monitoring best bid/ask prices...');
        setInterval(async () => {
          await market.loadOrderBook();
          const bestBid = market.bids?.best();
          const bestAsk = market.asks?.best();
          logger.info(`Best Bid: ${bestBid?.price} | Best Ask: ${bestAsk?.price}`);
        }, 1000);
      }

      if (argv.book) {
        logger.info('Displaying order book liquidity...');
        setInterval(async () => {
          await market.loadOrderBook();
          const bids = market.bids?.getL2(10) || [];
          const asks = market.asks?.getL2(10) || [];
          logger.info(`Order Book: \nBids: ${JSON.stringify(bids)}\nAsks: ${JSON.stringify(asks)}`);
        }, 1000);
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error fetching market data: ${err.message}`);
      process.exit(1);
    }
  },
};

export default marketData;
