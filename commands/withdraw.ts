import { CommandModule } from 'yargs';
import {
  createConnection,
  createProvider,
  createClient,
  loadKeypair,
  loadPublicKey,
  sendWithRetry,
  getDynamicPriorityFee,
  validateAndFetchMarket,
  ensureAssociatedTokenAccount
} from '../utils/setup';
import {
  PublicKey,
  Connection,
  TransactionInstruction
} from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import logger from '../utils/logger';

/**
 * Interface defining the required arguments for the withdraw command.
 */
interface WithdrawArgs {
  market: string;
  openOrders: string;
  ownerKeypair: string;
}

/**
 * CLI command to withdraw funds from an OpenOrders account.
 */
const withdraw: CommandModule<{}, WithdrawArgs> = {
  command: 'withdraw',
  describe: 'Withdraw funds from OpenOrders account',
  builder: (yargs) =>
    yargs
      .option('market', {
        type: 'string',
        demandOption: true,
        description: 'Market public key',
      })
      .option('openOrders', {
        type: 'string',
        demandOption: true,
        description: 'OpenOrders account public key',
      })
      .option('ownerKeypair', {
        type: 'string',
        demandOption: true,
        description: 'Path to owner keypair file',
      }),
  handler: async (argv) => {
    // Initialize Solana connection and load keypair
    const connection: Connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);

    // Load market and OpenOrders public keys
    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      logger.info(`Using wallet: ${owner.publicKey.toBase58()}`);
      logger.info(`Market: ${marketPubkey.toBase58()}`);

      // Fetch market data
      logger.info('Fetching and validating market data...');
      const marketAccount = await validateAndFetchMarket(connection, client, marketPubkey);

      // Deserialize OpenOrders account
      logger.info('Deserializing OpenOrders account...');
      const openOrdersAccount = await client.deserializeOpenOrderAccount(openOrdersPubkey);
      if (!openOrdersAccount) {
        throw new Error('OpenOrders account not found.');
      }

      // Ensure OpenOrders account belongs to the specified market
      if (openOrdersAccount.market.toBase58() !== marketPubkey.toBase58()) {
        throw new Error('OpenOrders account does not belong to the specified market.');
      }

      // Ensure associated token accounts exist
      logger.info('Ensuring associated token accounts exist...');
      const baseTokenAccount = await ensureAssociatedTokenAccount(
        connection,
        owner,
        marketAccount.baseMint,
        owner.publicKey
      );
      const quoteTokenAccount = await ensureAssociatedTokenAccount(
        connection,
        owner,
        marketAccount.quoteMint,
        owner.publicKey
      );

      // Prepare withdrawal instruction
      logger.info('Preparing withdrawal instruction...');
      const [withdrawIx, signers] = await client.settleFundsIx(
        openOrdersPubkey,
        openOrdersAccount,
        marketPubkey,
        marketAccount,
        baseTokenAccount,
        quoteTokenAccount,
        null, // Referrer account
        owner.publicKey // Penalty payer
      );

      // Fetch dynamic priority fee
      const finalPriorityFee = await getDynamicPriorityFee(connection);

      // Execute withdrawal transaction with retry logic
      const signature = await sendWithRetry(provider, connection, [withdrawIx], finalPriorityFee);

      logger.info(`Withdrawal transaction successful. Transaction ID: ${signature}`);
    } catch (error) {
      logger.error('Error during withdrawal:', error);
      process.exit(1);
    }
  },
};

export default withdraw;
