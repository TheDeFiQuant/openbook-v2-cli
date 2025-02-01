/**
 * CLI Command: closeOOA
 * 
 * Description
 * Closes OpenOrders accounts (OOAs) associated with the specified owner and optionally removes the OpenOrders indexer.
 *
 * Example Usage
 * npx ts-node cli.ts closeOOA --ownerKeypair <KEYPAIR_PATH> --market <MARKET_PUBKEY> --closeIndexer
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
  market?: string;
  closeIndexer?: boolean;
}

/**
 * CLI command to close OpenOrders accounts and optionally remove the OpenOrders indexer.
 */
const closeOOA: CommandModule<{}, CloseOOAArgs> = {
  command: 'closeOOA',
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

    // Create an Anchor provider
    const provider = createProvider(connection, wallet);

    // Initialize OpenBook client
    const client = createClient(provider);

    // Load market public key if provided
    const marketPubkey = argv.market ? loadPublicKey(argv.market) : undefined;
    const market = marketPubkey ? await Market.load(client, marketPubkey) : undefined;

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
          // Fetch OpenOrders indexer
          const openOrdersIndexer = client.findOpenOrdersIndexer(owner.publicKey);

          // Create close OpenOrders account instruction
          logger.info(`Closing OpenOrders account: ${openOrdersPubkey.toBase58()}`);
          const [closeIx, signers] = await client.closeOpenOrdersAccountIx(
            owner,
            openOrdersPubkey,
            owner.publicKey, // solDestination is the owner's public key
            openOrdersIndexer // Pass the indexer
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
        if (!market) {
          throw new Error('Market public key is required to close the OpenOrders indexer.');
        }

        try {
          logger.info(`Closing OpenOrders indexer for owner: ${owner.publicKey.toBase58()}`);
          
          const marketAccount = market.account
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
