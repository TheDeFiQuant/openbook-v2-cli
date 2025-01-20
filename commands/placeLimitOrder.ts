import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadKeypair, loadPublicKey } from '../utils/setup';
import logger from '../utils/logger';

interface PlaceLimitOrderArgs {
  market: string;
  openOrders: string;
  ownerKeypair: string;
  side: 'bid' | 'ask';
  price: number;
  size: number;
}

const placeLimitOrder: CommandModule = {
  command: 'placeLimitOrder',
  describe: 'Place a limit order',
  builder: (yargs) =>
    yargs
      .option('market', { type: 'string', demandOption: true, description: 'Market public key' })
      .option('openOrders', { type: 'string', demandOption: true, description: 'OpenOrders account public key' })
      .option('ownerKeypair', { type: 'string', demandOption: true, description: 'Path to owner keypair file' })
      .option('side', { type: 'string', choices: ['bid', 'ask'], demandOption: true })
      .option('price', { type: 'number', demandOption: true })
      .option('size', { type: 'number', demandOption: true }),
  handler: async (argv: PlaceLimitOrderArgs) => {
    const connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const provider = createProvider(connection, { publicKey: owner.publicKey });
    const client = createClient(provider);

    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      const market = await client.loadMarket(marketPubkey);
      const orderArgs = {
        side: argv.side === 'bid' ? { bid: {} } : { ask: {} },
        priceLots: market.priceUiToLots(argv.price),
        maxBaseLots: market.baseUiToLots(argv.size),
      };

      const signature = await client.placeOrder(openOrdersPubkey, market, orderArgs, owner);
      logger.info(`Order placed successfully. Transaction ID: ${signature}`);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error placing order: ${err.message}`);
      process.exit(1);
    }
  },
};

export default placeLimitOrder;
