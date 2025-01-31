import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadKeypair, loadPublicKey, testConnection } from '../utils/setup';
import { Wallet } from '@coral-xyz/anchor';
import logger from '../utils/logger';

interface CreateOOAArgs {
  market: string;
  ownerKeypair: string;
  name: string;
}

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
    const connection = createConnection();

    // Test the RPC connection before proceeding
    const isConnected = await testConnection(connection);
    if (!isConnected) {
      process.exit(1);
    }

    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);

    const marketPubkey = loadPublicKey(argv.market);

    try {
      logger.info(`Using wallet: ${owner.publicKey.toBase58()}`);
      logger.info(`Market: ${marketPubkey.toBase58()}`);

      // Measure RPC latency
      const start = Date.now();
      logger.info('Creating OpenOrders account...');
      const openOrdersAccountPubkey = await client.createOpenOrders(
        owner,
        marketPubkey,
        argv.name
      );
      const end = Date.now();
      logger.info(`RPC call latency: ${end - start}ms`);

      logger.info(`OpenOrders account created successfully: ${openOrdersAccountPubkey.toBase58()}`);
    } catch (error) {
      logger.error('Error occurred while creating OpenOrders account:');
      if ((error as any).txid) {
        logger.error(`Transaction ID: ${(error as any).txid}`);
        logger.error('Check the transaction details on Solana Explorer.');
      }

      // Check if the error is related to expired block height
      if (
        error instanceof Error &&
        error.message.includes('block height exceeded')
      ) {
        logger.error(
          'This error is due to using a public RPC endpoint. Please use a commercial RPC node and update the .env file accordingly.'
        );
      }

      // Log full error details for debugging
      logger.error('Error details:', error instanceof Error ? error.message : error);
      if (error instanceof Error && error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }

      process.exit(1);
    }
  },
};

export default createOOA;
