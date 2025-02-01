import { CommandModule } from 'yargs';
import {
  createConnection,
  createClient,
  loadKeypair,
  loadPublicKey,
  sendWithRetry,
  getDynamicPriorityFee
} from '../utils/setup';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { PublicKey, Connection, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { OpenBookV2Client, Market, type PlaceOrderArgs as OpenBookPlaceOrderArgs } from '@openbook-dex/openbook-v2';
import logger from '../utils/logger';
import { BN } from '@coral-xyz/anchor';

interface CLIPlaceOrderArgs {
  market: string;
  openOrders: string;
  ownerKeypair: string;
  side: 'bid' | 'ask';
  price: number;
  size: number;
}

/**
 * CLI command to place a limit order on OpenBook.
 */
const placeLimitOrder: CommandModule<{}, CLIPlaceOrderArgs> = {
  command: 'place-order',
  describe: 'Place a limit order on OpenBook',
  builder: (yargs) =>
    yargs
      .option('market', { type: 'string', demandOption: true, description: 'Market public key' })
      .option('openOrders', { type: 'string', demandOption: true, description: 'OpenOrders account public key' })
      .option('ownerKeypair', { type: 'string', demandOption: true, description: 'Path to owner keypair file' })
      .option('side', {
        type: 'string',
        choices: ['bid', 'ask'] as const,
        demandOption: true,
        description: 'Order side (bid or ask)'
      })
      .option('price', { type: 'number', demandOption: true, description: 'Order price in UI units' })
      .option('size', { type: 'number', demandOption: true, description: 'Order size in UI units' }),
  handler: async (argv) => {
    const connection: Connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

    const client = createClient(provider);
    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      logger.info('Fetching and validating market data...');
      const marketDataRaw = await connection.getAccountInfo(marketPubkey);
      if (!marketDataRaw || !marketDataRaw.data) {
        throw new Error('Market data not found.');
      }
      const marketAccount = client.decodeMarket(marketDataRaw.data);

      logger.info('Deserializing OpenOrders account...');
      const openOrdersAccount = await client.deserializeOpenOrderAccount(openOrdersPubkey);
      if (!openOrdersAccount) {
        throw new Error('OpenOrders account not found.');
      }

      if (openOrdersAccount.market.toString() !== marketPubkey.toString()) {
        throw new Error('OpenOrders account does not belong to the specified market.');
      }

      logger.info('Loading market...');
      const market = await Market.load(client, marketPubkey);

      logger.info('Converting UI amounts to native amounts...');
      const priceNative = market.priceUiToLots(argv.price);
      const sizeNative = market.baseUiToLots(argv.size);
      const maxQuoteLotsIncludingFees = market.quoteUiToLots(argv.price * argv.size);

      logger.info('Fetching associated token account...');
      const userTokenAccount = await getAssociatedTokenAddress(
        argv.side === 'bid' ? market.account.quoteMint : market.account.baseMint,
        owner.publicKey
      );

      logger.info('Constructing place order instruction...');
      const args: OpenBookPlaceOrderArgs = {
        side: argv.side as 'bid' | 'ask', // ✅ Fix: Explicitly cast `argv.side` to 'bid' | 'ask'
        priceLots: priceNative,
        maxBaseLots: sizeNative,
        maxQuoteLotsIncludingFees,
        clientOrderId: new BN(Date.now()),
        orderType: { limit: {} },
        expiryTimestamp: new BN(0),
        selfTradeBehavior: { decrementTake: {} },
        limit: 16,
      };

      const [placeOrderIx] = await client.placeOrderIx(
        openOrdersPubkey,
        marketPubkey,
        market.account,
        userTokenAccount,
        args,
        []
      );

      const finalPriorityFee = await getDynamicPriorityFee(connection);
      const signature = await sendWithRetry(provider, connection, [placeOrderIx], finalPriorityFee);

      logger.info(`Order placed successfully. Transaction Signature: ${signature}`);
    } catch (error) {
      logger.error('Error occurred while placing order:', error instanceof Error ? error.message : error);
      if (error instanceof Error && error.message.includes('block height exceeded')) {
        logger.error('Transaction expired. Consider using a higher priority fee or a commercial RPC.');
      }
      process.exit(1);
    }
  },
};

export default placeLimitOrder;
