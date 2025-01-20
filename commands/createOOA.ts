import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadKeypair, loadPublicKey } from '../utils/setup';
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
    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);

    const marketPubkey = loadPublicKey(argv.market);

    try {
      logger.info(`Using wallet: ${owner.publicKey.toBase58()}`);
      logger.info(`Market: ${marketPubkey.toBase58()}`);

      logger.info('Creating OpenOrders account...');
      const openOrdersAccountPubkey = await client.createOpenOrders(
        owner,
        marketPubkey,
        argv.name
      );

      logger.info(`OpenOrders account created successfully: ${openOrdersAccountPubkey.toBase58()}`);
    } catch (error) {
      logger.error('Error occurred while creating OpenOrders account:');
      if ((error as any).txid) {
        logger.error(`Transaction ID: ${(error as any).txid}`);
        logger.error('Check the transaction details on Solana Explorer.');
      }
      logger.error('Error details:', (error as Error).message);
      process.exit(1);
    }
  },
};

export default createOOA;
