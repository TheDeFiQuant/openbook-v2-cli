/**
 * CLI Command: closeOOA
 * 
 * Description
 * Closes an OpenOrders account (OOA) associated with the specified owner. If no specific OpenOrders account is provided, it will close all OOAs on the specified market. Optionally, it can also remove the OpenOrders indexer.
 *
 * Example Usage
 * npx ts-node cli.ts closeOOA --ownerKeypair <KEYPAIR_PATH> --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --closeIndexer
 *  
 * Parameters
 * --ownerKeypair (Required): Path to the keypair file of the OpenOrders account owner.
 * --market (Required): Public key of the market.
 * --openOrders (Optional): Public key of a specific OpenOrders account to close.
 * --closeIndexer (Optional): If set, also closes the OpenOrders indexer after closing all OpenOrders accounts.
 */

import { CommandModule } from 'yargs';
import {
  createConnection,
  createClient,
  createProvider,
  loadKeypair,
  loadPublicKey,
  sendWithRetry,
  getDynamicPriorityFee,
} from '../utils/setup';
import { Connection, PublicKey, TransactionInstruction, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { OpenBookV2Client, Market } from '@openbook-dex/openbook-v2';
import logger from '../utils/logger';

interface CloseOOAArgs {
  ownerKeypair: string;
  market: string;
  openOrders?: string;
  closeIndexer?: boolean;
}

/**
 * CLI command to close OpenOrders accounts and optionally remove the OpenOrders indexer.
 */
const closeOOA: CommandModule<{}, CloseOOAArgs> = {
  command: 'closeOOA',
  describe: 'Close an OpenOrders account or all accounts for a market. Optionally remove OpenOrdersIndexer.',
  builder: (yargs) =>
    yargs
      .option('ownerKeypair', {
        type: 'string',
        demandOption: true,
        description: 'Path to the owner keypair file',
      })
      .option('market', {
        type: 'string',
        demandOption: true,
        description: 'Market public key (required)',
      })
      .option('openOrders', {
        type: 'string',
        description: 'Specific OpenOrders account public key to close (optional)',
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
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);

    // Load market public key and market data
    const marketPubkey = loadPublicKey(argv.market);
    const market = await Market.load(client, marketPubkey);
    const marketAccount = market.account;

    try {
      logger.info(`Fetching OpenOrders accounts for owner: ${owner.publicKey.toBase58()}`);

      let openOrdersAccounts: PublicKey[] = [];

      if (argv.openOrders) {
        // If a specific OpenOrders account is provided, only close that one
        openOrdersAccounts = [loadPublicKey(argv.openOrders)];
        logger.info(`Closing specific OpenOrders account: ${argv.openOrders}`);
      } else {
        // Otherwise, close all OpenOrders accounts for the given market
        logger.info(`Fetching all OpenOrders accounts for market: ${marketPubkey.toBase58()}`);
        openOrdersAccounts = await client.findOpenOrdersForMarket(owner.publicKey, marketPubkey);

        if (openOrdersAccounts.length === 0) {
          logger.info('No OpenOrders accounts found.');
          return;
        }
        logger.info(`Found ${openOrdersAccounts.length} OpenOrders accounts. Closing them...`);
      }

      for (const openOrdersPubkey of openOrdersAccounts) {
        try {
          // Find the OpenOrders indexer
          const openOrdersIndexer = client.findOpenOrdersIndexer(owner.publicKey);

          // Create close OpenOrders account instruction
          logger.info(`Closing OpenOrders account: ${openOrdersPubkey.toBase58()}`);
          const [closeIx, signers] = await client.closeOpenOrdersAccountIx(
            owner,
            openOrdersPubkey,
            owner.publicKey, // solDestination is the owner's public key
            openOrdersIndexer
          );

          // Get dynamic priority fee for transaction
          const priorityFee = await getDynamicPriorityFee(connection);

          // Send the transaction
          const signature = await sendWithRetry(provider, connection, [closeIx], priorityFee);
          logger.info(`Closed OpenOrders account: ${openOrdersPubkey.toBase58()} (TX: ${signature})`);
        } catch (error) {
          logger.error(`Failed to close OpenOrders account ${openOrdersPubkey.toBase58()}:`, error);
        }
      }

      // Optional: Close the OpenOrders indexer if requested
      if (argv.closeIndexer) {
        try {
          logger.info(`Closing OpenOrders indexer for owner: ${owner.publicKey.toBase58()}`);
          
          const [closeIndexerIx, signers] = await client.closeOpenOrdersIndexerIx(owner, marketAccount);

          // Send the transaction
          const priorityFee = await getDynamicPriorityFee(connection);
          const signature = await sendWithRetry(provider, connection, [closeIndexerIx], priorityFee);

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

export default closeOOA;
