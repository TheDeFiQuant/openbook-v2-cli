/**
 * CLI Command: createOOA
 * 
 * Description
 * Creates an OpenOrders account (OOA) for a specified market, allowing users to manage their trades on OpenBook.
 *
 * Example Usage
 * npx ts-node cli.ts createOOA --market <MARKET_PUBKEY> --ownerKeypair <KEYPAIR_FILE_PATH> --name <ACCOUNT_NAME>
 *  
 * Parameters
 * --market (Required): Public key of the market where the OpenOrders account will be created.
 * --ownerKeypair (Required): Path to the keypair file of the owner.
 * --name (Optional, default: "default"): Name for the OpenOrders account.
 * 
 */
import { CommandModule } from 'yargs';
import {
  createConnection,
  createProvider,
  createClient,
  loadKeypair,
  loadPublicKey,
  sendWithRetry,
  getDynamicPriorityFee,
} from '../utils/setup';
import { Wallet } from '@coral-xyz/anchor';
import logger from '../utils/logger';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';

/**
 * Interface defining the required arguments for the createOOA command.
 */
interface CreateOOAArgs {
  market: string;
  ownerKeypair: string;
  name: string;
}

/**
 * CLI command to create an OpenOrders account (OOA) for a given market.
 */
const createOOA: CommandModule<{}, CreateOOAArgs> = {
  command: 'createOOA',
  describe: 'Create an OpenOrders account for a market',
  builder: (yargs) =>
    yargs
      .option('market', {
        type: 'string',
        demandOption: true,
        description: 'Market public key',
      })
      .option('ownerKeypair', {
        type: 'string',
        demandOption: true,
        description: 'Path to the owner keypair file',
      })
      .option('name', {
        type: 'string',
        default: 'default',
        description: 'Name for the OpenOrders account',
      }),
  handler: async (argv) => {
    // Initialize Solana connection
    const connection: Connection = createConnection();

    // Load the owner's keypair
    const owner = loadKeypair(argv.ownerKeypair);

    // Create a wallet and provider
    const wallet = new Wallet(owner);
    const provider = createProvider(connection, wallet);

    // Create an OpenBook client
    const client = createClient(provider);

    // Load the market public key
    const marketPubkey = loadPublicKey(argv.market);

    try {
      // Logging user and market info
      logger.info(`Using wallet: ${owner.publicKey.toBase58()}`);
      logger.info(`Market: ${marketPubkey.toBase58()}`);
      logger.info('Creating OpenOrders account...');

      // Determine the OpenOrders Indexer for the owner
      const openOrdersIndexer = client.findOpenOrdersIndexer(owner.publicKey);

      // Fetch a dynamic priority fee
      const priorityFee = await getDynamicPriorityFee(connection);

      // Construct transaction instructions
      const [createOpenOrdersIx, openOrdersAccountPubkey] = await client.createOpenOrdersIx(
        marketPubkey,      // Market PublicKey
        argv.name,         // Account name
        owner.publicKey,   // Owner's PublicKey
        null,              // No delegate account
        openOrdersIndexer  // OpenOrders Indexer
      );

      // Send transaction with retry mechanism
      const txSignature = await sendWithRetry(provider, connection, createOpenOrdersIx, priorityFee);

      // Log success message
      logger.info(`OpenOrders account created successfully: ${openOrdersAccountPubkey.toBase58()}`);
      logger.info(`Transaction Signature: ${txSignature}`);

    } catch (error) {
      // Handle errors and log details
      logger.error('Error occurred while creating OpenOrders account:');
      if ((error as any).txid) {
        logger.error(`Transaction ID: ${(error as any).txid}`);
        logger.error('Check the transaction details on Solana Explorer.');
      }

      if (error instanceof Error) {
        logger.error(`Error details: ${error.message}`);
        if (error.stack) {
          logger.error(`Stack trace: ${error.stack}`);
        }
      } else {
        logger.error(`Unknown error: ${error}`);
      }

      process.exit(1);
    }
  },
};

export default createOOA;
