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
import { Connection, TransactionInstruction } from '@solana/web3.js';

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
    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);

    // Load market public key
    const marketPubkey = loadPublicKey(argv.market);

    try {
      logger.info(`Using wallet: ${owner.publicKey.toBase58()}`);
      logger.info(`Market: ${marketPubkey.toBase58()}`);

      logger.info('Creating OpenOrders account...');

      // Create OpenOrders account and retrieve its PublicKey
      const openOrdersAccountPubkey = await client.createOpenOrders(
        owner,
        marketPubkey,
        argv.name
      );

      logger.info(`OpenOrders account created: ${openOrdersAccountPubkey.toBase58()}`);

    } catch (error) {
      logger.error('Error occurred while creating OpenOrders account:');
      if ((error as any).txid) {
        logger.error(`Transaction ID: ${(error as any).txid}`);
        logger.error('Check the transaction details on Solana Explorer.');
      }

      if (error instanceof Error) {
        logger.error('Error details:', error.message);
        if (error.stack) {
          logger.error(`Stack trace: ${error.stack}`);
        }
      } else {
        logger.error('Unknown error:', error);
      }

      process.exit(1);
    }
  },
};

export default createOOA;
