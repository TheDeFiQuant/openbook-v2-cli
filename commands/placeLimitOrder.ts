/**
 * CLI Command: place-order
 * 
 * Description
 * Places a limit order on OpenBook by specifying the market, order parameters, and OpenOrders account.
 *
 * Example Usage
 * npx ts-node cli.ts place-order --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --ownerKeypair <KEYPAIR_PATH> --side bid --price 100 --size 1
 *  
 * Parameters
 * --market (Required): Public key of the market where the order will be placed.
 * --openOrders (Required): Public key of the OpenOrders account.
 * --ownerKeypair (Required): Path to the keypair file of the order owner.
 * --side (Required): Order side, either 'bid' (buy) or 'ask' (sell).
 * --price (Required): Order price in UI units.
 * --size (Required): Order size in UI units.
 */

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

/**
 * Interface defining the required arguments for the place-order command.
 */
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
    // Establish a connection to the Solana blockchain
    const connection: Connection = createConnection();

    // Load the owner's keypair from the specified file
    const owner = loadKeypair(argv.ownerKeypair);

    // Create a wallet using the owner's keypair
    const wallet = new Wallet(owner);

    // Initialize an Anchor provider for interactions with the blockchain
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

    // Create an OpenBook client to interact with the OpenBook DEX
    const client = createClient(provider);

    // Load the public keys for the specified market and OpenOrders account
    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      logger.info('Fetching and validating market data...');
      
      // Fetch market account data and decode it
      const marketDataRaw = await connection.getAccountInfo(marketPubkey);
      if (!marketDataRaw || !marketDataRaw.data) {
        throw new Error('Market data not found.');
      }
      const marketAccount = client.decodeMarket(marketDataRaw.data);

      logger.info('Deserializing OpenOrders account...');
      
      // Fetch and validate the OpenOrders account
      const openOrdersAccount = await client.deserializeOpenOrderAccount(openOrdersPubkey);
      if (!openOrdersAccount) {
        throw new Error('OpenOrders account not found.');
      }

      // Ensure the OpenOrders account matches the specified market
      if (openOrdersAccount.market.toString() !== marketPubkey.toString()) {
        throw new Error('OpenOrders account does not belong to the specified market.');
      }

      logger.info('Loading market...');
      
      // Load market details from OpenBook
      const market = await Market.load(client, marketPubkey);

      logger.info('Converting UI amounts to native amounts...');
      
      // Convert UI values to native format for placing the order
      const priceNative = market.priceUiToLots(argv.price);
      const sizeNative = market.baseUiToLots(argv.size);
      const maxQuoteLotsIncludingFees = market.quoteUiToLots(argv.price * argv.size);

      logger.info('Fetching associated token account...');
      
      // Determine the associated token account based on order side
      const userTokenAccount = await getAssociatedTokenAddress(
        argv.side === 'bid' ? market.account.quoteMint : market.account.baseMint,
        owner.publicKey
      );

      logger.info('Constructing place order instruction...');
      
      // Construct the limit order instruction
      const args: OpenBookPlaceOrderArgs = {
        side: argv.side as 'bid' | 'ask',
        priceLots: priceNative,
        maxBaseLots: sizeNative,
        maxQuoteLotsIncludingFees,
        clientOrderId: new BN(Date.now()),
        orderType: { limit: {} },
        expiryTimestamp: new BN(0),
        selfTradeBehavior: { decrementTake: {} },
        limit: 16,
      };

      // Generate the order placement instruction
      const [placeOrderIx] = await client.placeOrderIx(
        openOrdersPubkey,
        marketPubkey,
        market.account,
        userTokenAccount,
        args,
        []
      );

      // Fetch the dynamic priority fee for transaction processing
      const finalPriorityFee = await getDynamicPriorityFee(connection);

      // Send the transaction with retry logic
      const signature = await sendWithRetry(provider, connection, [placeOrderIx], finalPriorityFee);

      logger.info(`Order placed successfully. Transaction Signature: ${signature}`);
    } catch (error) {
      logger.error('Error occurred while placing order:', error instanceof Error ? error.message : error);
      
      // Provide additional info if the transaction expired
      if (error instanceof Error && error.message.includes('block height exceeded')) {
        logger.error('Transaction expired. Consider using a higher priority fee or a commercial RPC.');
      }

      process.exit(1);
    }
  },
};

export default placeLimitOrder;
