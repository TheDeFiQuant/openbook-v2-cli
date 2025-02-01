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
import { toNative } from '@openbook-dex/openbook-v2';
import {
  Connection,
  TransactionInstruction,
} from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import logger from '../utils/logger';

/**
 * Interface defining the required arguments for the deposit command.
 */
interface DepositArgs {
  market: string;
  openOrders: string;
  ownerKeypair: string;
  baseAmount: number;
  quoteAmount: number;
}

/**
 * Deposit command for adding funds to an OpenOrders account.
 * This command interacts with OpenBook DEX and executes a deposit transaction.
 */
const deposit: CommandModule<{}, DepositArgs> = {
  command: 'deposit',
  describe: 'Deposit funds into OpenOrders account',
  builder: (yargs) =>
    yargs
      .option('market', { type: 'string', demandOption: true, description: 'Market public key' })
      .option('openOrders', { type: 'string', demandOption: true, description: 'OpenOrders account public key' })
      .option('ownerKeypair', { type: 'string', demandOption: true, description: 'Path to owner keypair file' })
      .option('baseAmount', { type: 'number', demandOption: true, description: 'Amount of base currency to deposit' })
      .option('quoteAmount', { type: 'number', demandOption: true, description: 'Amount of quote currency to deposit' }),
  handler: async (argv) => {
    // Initialize Solana connection and load keypair
    const connection: Connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);

    const wallet = new Wallet(owner);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

    // Create OpenBook DEX client
    const client = createClient(provider);

    // Load public keys for market and OpenOrders accounts
    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      // Fetch and validate market data
      logger.info('Fetching and validating market data...');
      const marketDataRaw = await connection.getAccountInfo(marketPubkey);
      if (!marketDataRaw || !marketDataRaw.data) {
        throw new Error('Market data not found.');
      }
      const marketAccount = client.decodeMarket(marketDataRaw.data);

      // Fetch and validate OpenOrders account
      logger.info('Deserializing OpenOrders account...');
      const openOrdersAccount = await client.deserializeOpenOrderAccount(openOrdersPubkey);
      if (!openOrdersAccount) {
        throw new Error('OpenOrders account not found.');
      }

      // Ensure OpenOrders account matches the specified market
      if (openOrdersAccount.market.toString() !== marketPubkey.toString()) {
        throw new Error('OpenOrders account does not belong to the specified market.');
      }

      // Ensure associated token accounts exist
      logger.info('Ensuring associated token accounts...');
      const baseTokenAccount = await getAssociatedTokenAddress(marketAccount.baseMint, owner.publicKey, true);
      const quoteTokenAccount = await getAssociatedTokenAddress(marketAccount.quoteMint, owner.publicKey, true);

      // Convert UI amounts to native token amounts
      logger.info('Converting UI amounts to native amounts...');
      const baseAmountNative = toNative(argv.baseAmount, marketAccount.baseDecimals);
      const quoteAmountNative = toNative(argv.quoteAmount, marketAccount.quoteDecimals);

      // Prepare transaction instruction for deposit
      logger.info('Preparing token deposit...');
      const depositIx: TransactionInstruction = await client.depositIx(
        openOrdersPubkey,
        openOrdersAccount,
        marketAccount,
        baseTokenAccount,
        quoteTokenAccount,
        baseAmountNative,
        quoteAmountNative
      );

      // Fetch dynamic priority fee
      const finalPriorityFee = await getDynamicPriorityFee(connection);

      // Execute transaction with retry logic
      const signature = await sendWithRetry(provider, connection, [depositIx], finalPriorityFee);

      logger.info(`Transaction ${signature} successfully confirmed.`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Error occurred while depositing funds:', error.message);
      } else {
        logger.error('Unknown error occurred during deposit process.');
      }
      process.exit(1);
    }
  },
};

export default deposit;
