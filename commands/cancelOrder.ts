/**
 * CLI Command: cancel-order
 * 
 * Description
 * Cancels an existing order on OpenBook by specifying the market, OpenOrders account, and either an `orderId`, `clientOrderId`, or canceling all orders.
 *
 * Example Usage
 * npx ts-node cli.ts cancel-order --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --orderId <ORDER_ID> --ownerKeypair <KEYPAIR_PATH>
 *  
 * Parameters
 * --market (Required): Public key of the market where the order exists.
 * --openOrders (Required): Public key of the OpenOrders account holding the order.
 * --orderId (Optional): Order ID to cancel.
 * --clientOrderId (Optional): Client-specified order ID.
 * --side (Optional): `bid` or `ask` (cancels only orders on that side).
 * --limit (Optional): Maximum number of orders to cancel (only used when `orderId` is not provided).
 * --ownerKeypair (Required): Path to the keypair file of the order owner.
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
import { PublicKey, Connection, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { OpenBookV2Client, Market, OpenOrders } from '@openbook-dex/openbook-v2';
import logger from '../utils/logger';
import { BN } from '@coral-xyz/anchor';

/**
 * Interface defining the required arguments for the cancel-order command.
 */
interface CLICancelOrderArgs {
  market: string;
  openOrders: string;
  ownerKeypair: string;
  orderId?: string;
  clientOrderId?: string;
  side?: 'bid' | 'ask';
  limit?: number;
}

/**
 * CLI command to cancel orders on OpenBook.
 */
const cancelOrder: CommandModule<{}, CLICancelOrderArgs> = {
  command: 'cancel-order',
  describe: 'Cancel an order on OpenBook',
  builder: (yargs) =>
    yargs
      .option('market', { type: 'string', demandOption: true, description: 'Market public key' })
      .option('openOrders', { type: 'string', demandOption: true, description: 'OpenOrders account public key' })
      .option('ownerKeypair', { type: 'string', demandOption: true, description: 'Path to owner keypair file' })
      .option('orderId', { type: 'string', description: 'Order ID to cancel' })
      .option('clientOrderId', { type: 'string', description: 'Client-specified order ID to cancel' })
      .option('side', {
        type: 'string',
        choices: ['bid', 'ask'] as const,
        description: 'Cancel only orders on a specific side (bid or ask)'
      })
      .option('limit', { type: 'number', description: 'Maximum number of orders to cancel when canceling all orders' })
      .check((argv) => {
        if (argv.orderId && argv.clientOrderId) {
          throw new Error('Specify either --orderId or --clientOrderId, but not both.');
        }
        return true;
      }),
  handler: async (argv) => {
    // Initialize Solana connection and load keypair
    const connection: Connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

    // Create OpenBook client
    const client: OpenBookV2Client = createClient(provider);

    // Load public keys for market and OpenOrders accounts
    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      logger.info(`Using wallet: ${owner.publicKey.toBase58()}`);
      logger.info(`Market: ${marketPubkey.toBase58()}`);
      logger.info(`OpenOrders Account: ${openOrdersPubkey.toBase58()}`);

      // Fetch and validate market data
      logger.info('Fetching and validating market data...');
      const market = await Market.load(client, marketPubkey);

      // Fetch OpenOrders account
      logger.info('Deserializing OpenOrders account...');
      const openOrdersAccount = await client.deserializeOpenOrderAccount(openOrdersPubkey);
      if (!openOrdersAccount) {
        throw new Error('OpenOrders account not found.');
      }

      // Check if OpenOrders belongs to the specified market
      if (openOrdersAccount.market.toString() !== marketPubkey.toString()) {
        throw new Error('OpenOrders account does not belong to the specified market.');
      }

      // Prepare transaction instruction for order cancellation
      let cancelIx: TransactionInstruction;

      if (argv.orderId) {
        // Cancel a specific order by order ID
        logger.info(`Cancelling order with ID: ${argv.orderId}`);
        const orderIdBN = new BN(argv.orderId);
        [cancelIx] = await client.cancelOrderByIdIx(
          openOrdersPubkey,
          openOrdersAccount,
          market.account,
          orderIdBN
        );
      } else if (argv.clientOrderId) {
        // Cancel a specific order by clientOrderId
        logger.info(`Cancelling order with Client Order ID: ${argv.clientOrderId}`);
        const clientOrderIdBN = new BN(argv.clientOrderId);
        [cancelIx] = await client.cancelOrderByClientIdIx(
          openOrdersPubkey,
          openOrdersAccount,
          market.account,
          clientOrderIdBN
        );
      } else {
        // Cancel all orders or all orders of a specific side
        logger.info(`Cancelling all orders${argv.side ? ` on ${argv.side} side` : ''}`);
        [cancelIx] = await client.cancelAllOrdersIx(
          openOrdersPubkey,
          openOrdersAccount,
          market.account,
          argv.limit ?? 12, // Default limit to 12 if not specified
          argv.side ?? null
        );
      }

      // Fetch dynamic priority fee
      const finalPriorityFee = await getDynamicPriorityFee(connection);

      // Execute transaction with retry logic
      const signature = await sendWithRetry(provider, connection, [cancelIx], finalPriorityFee);

      logger.info(`Order cancellation successful. Transaction Signature: ${signature}`);
    } catch (error) {
      logger.error('Error occurred while canceling order:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  },
};

export default cancelOrder;
