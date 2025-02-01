/**
 * CLI Command: close-open-orders
 * 
 * Description
 * Closes OpenOrders accounts associated with the specified owner and optionally removes the OpenOrders indexer.
 *
 * Example Usage
 * npx ts-node cli.ts close-open-orders --ownerKeypair <KEYPAIR_PATH> --market <MARKET_PUBKEY> --closeIndexer
 *  
 * Parameters
 * --ownerKeypair (Required): Path to the keypair file of the OpenOrders account owner.
 * --market (Optional): Public key of the market. If provided, only closes OpenOrders accounts for this market.
 * --closeIndexer (Optional): If set, also closes the OpenOrders indexer after closing all OpenOrders accounts.
 */

import { CommandModule } from 'yargs';
import {
  createConnection,
  createClient,
  loadKeypair,
  loadPublicKey,
  sendWithRetry,
  getDynamicPriorityFee,
} from '../utils/setup';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { OpenBookV2Client, Market } from '@openbook-dex/openbook-v2';
import logger from '../utils/logger';

interface CloseOpenOrdersArgs {
  ownerKeypair: string;
  market?: string;
  closeIndexer?: boolean;
}

/**
 * CLI command to close OpenOrders accounts and optionally remove the OpenOrders indexer.
 */
const closeOpenOrders: CommandModule<{}, CloseOpenOrdersArgs> = {
  command: 'close-open-orders',
  describe: 'Close OpenOrders accounts and optionally remove OpenOrdersIndexer',
  builder: (yargs) =>
    yargs
      .option('ownerKeypair', {
        type: 'string',
        demandOption: true,
        description: 'Path to the owner keypair file',
      })
      .option('market', {
        type: 'string',
        description: 'Market public key (optional, only closes accounts for this market)',
      })
      .option('closeIndexer', {
        type: 'boolean',
        description: 'Also close the OpenOrders indexer after closing all OpenOrders accounts',
      }),
  handler: async (argv) => {
    // Initialize Solana connection and load the owner keypair
    const connection: Connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);

    // Initialize OpenBook client
    const client = createClient(wallet);

    // Load market public key if provided
    const marketPubkey = argv.market ? loadPublicKey(argv.market) : undefined;

    try {
      logger.info(`Fetching OpenOrders accounts for owner: ${owner.publicKey.toBase58()}`);

      let openOrdersAccounts: PublicKey[];

      if (marketPubkey) {
        logger.info(`Filtering OpenOrders accounts for market: ${marketPubkey.toBase58()}`);
        openOrdersAccounts = await client.findOpenOrdersForMarket(owner.publicKey, marketPubkey);
      } else {
        openOrdersAccounts = await client.findAllOpenOrders(owner.publicKey);
      }

      if (openOrdersAccounts.length === 0) {
        logger.info('No OpenOrders accounts found.');
        return;
      }

      logger.info(`Found ${openOrdersAccounts.length} OpenOrders accounts. Closing them...`);

      for (const openOrdersPubkey of openOrdersAccounts) {
        try {
          // Create close OpenOrders account instruction
          logger.info(`Closing OpenOrders account: ${openOrdersPubkey.toBase58()}`);
          const [closeIx, signers] = await client.closeOpenOrdersAccountIx(
            owner,
            openOrdersPubkey
          );

          // Get dynamic priority fee for transaction
          const priorityFee = await getDynamicPriorityFee(connection);

          // Send the transaction
          const signature = await sendWithRetry(wallet, connection, [closeIx], priorityFee, signers);
          logger.info(`Closed OpenOrders account: ${openOrdersPubkey.toBase58()} (TX: ${signature})`);
        } catch (error) {
          logger.error(`Failed to close OpenOrders account ${openOrdersPubkey.toBase58()}:`, error);
        }
      }

      // Optional: Close the OpenOrders indexer if requested
      if (argv.closeIndexer) {
        try {
          logger.info(`Closing OpenOrders indexer for owner: ${owner.publicKey.toBase58()}`);
          const [closeIndexerIx, signers] = await client.closeOpenOrdersIndexerIx(owner, marketPubkey);

          // Send the transaction
          const priorityFee = await getDynamicPriorityFee(connection);
          const signature = await sendWithRetry(wallet, connection, [closeIndexerIx], priorityFee, signers);

          logger.info(`Closed OpenOrders indexer (TX: ${signature})`);
        } catch (error) {
          logger.error('Failed to close OpenOrders indexer:', error);
        }
      }

      logger.info('All specified OpenOrders accounts have been processed.');
    } catch (error) {
      logger.error('Error occurred while closing OpenOrders accounts:', error);
      process.exit(1);
    }
  },
};

export default closeOpenOrders;
