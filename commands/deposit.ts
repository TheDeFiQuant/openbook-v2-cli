import { CommandModule } from 'yargs';
import {
  createConnection,
  createClient,
  loadKeypair,
  loadPublicKey,
} from '../utils/setup';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { toNative } from '@openbook-dex/openbook-v2';
import {
  PublicKey,
  Connection,
  TransactionInstruction,
} from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import logger from '../utils/logger';
import { sendTransaction } from '@openbook-dex/openbook-v2/dist/cjs/utils/rpc';

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

// Maximum retry attempts for transactions
const MAX_RETRIES = 10;

// Minimum priority fee for transactions in microLamports
const BASE_PRIORITY_FEE = BigInt(10_000);

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
      const calculatedPriorityFee = await getDynamicPriorityFee(connection);
      const finalPriorityFee = calculatedPriorityFee < BASE_PRIORITY_FEE ? BASE_PRIORITY_FEE : calculatedPriorityFee;

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

/**
 * Fetches the dynamic priority fee based on recent network activity.
 * Uses the mean value of non-zero prioritization fees from the last 150 blocks.
 */
async function getDynamicPriorityFee(connection: Connection): Promise<bigint> {
  try {
    logger.info('Fetching recent prioritization fees...');
    const recentFees = await connection.getRecentPrioritizationFees();

    if (!recentFees || recentFees.length === 0) {
      logger.warn('No recent prioritization fees found. Using base priority fee.');
      return BASE_PRIORITY_FEE;
    }

    // Extract and filter out zero fees
    const nonZeroFees: bigint[] = recentFees
      .map(f => BigInt(f.prioritizationFee))
      .filter(fee => fee > 0n);

    if (nonZeroFees.length === 0) {
      logger.warn('All recent prioritization fees are 0. Using base priority fee.');
      return BASE_PRIORITY_FEE;
    }

    // Compute mean (average) priority fee
    const totalFees = nonZeroFees.reduce((acc, fee) => acc + fee, 0n);
    const meanFee = totalFees / BigInt(nonZeroFees.length);

    const finalFee = meanFee < BASE_PRIORITY_FEE ? BASE_PRIORITY_FEE : meanFee;

    logger.info(`Calculated dynamic priority fee (mean): ${meanFee.toString()} microLamports`);
    logger.info(`Using priority fee: ${finalFee.toString()} microLamports`);

    return finalFee;
  } catch (error) {
    logger.warn(`Failed to fetch priority fees: ${error}`);
    return BASE_PRIORITY_FEE;
  }
}

/**
 * Implements a retry mechanism for transactions that fail due to block expiration.
 * The priority fee is incremented based on predefined steps.
 */
async function sendWithRetry(
  provider: AnchorProvider,
  connection: Connection,
  instructions: TransactionInstruction[],
  prioritizationFee: bigint
): Promise<string> {
  let attempt = 0;

  // Predefined escalation steps for retry attempts
  const baseRetrySteps = [
    250_000n, 500_000n, 1_000_000n, 1_500_000n,
    2_000_000n, 4_000_000n, 8_000_000n, 16_000_000n, 
  ];

  while (attempt < MAX_RETRIES) {
    try {
      let latestBlockhash = await connection.getLatestBlockhash('confirmed');
      logger.info(`Attempt ${attempt + 1}/${MAX_RETRIES}: Sending transaction with priority fee ${prioritizationFee.toString()} microLamports`);

      const signature = await sendTransaction(provider, instructions, [], {
        preflightCommitment: 'confirmed',
        maxRetries: 0,
        prioritizationFee: Number(prioritizationFee),
        latestBlockhash,
      });

      await connection.confirmTransaction(
        { signature, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
        'confirmed'
      );

      logger.info(`Transaction ${signature} confirmed.`);
      return signature;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('block height exceeded')) {
        attempt++;

        // Determine next priority fee step
        if (attempt - 1 < baseRetrySteps.length) {
          prioritizationFee = baseRetrySteps[attempt - 1];
        } else {
          prioritizationFee *= 2n;
        }

        logger.warn(`Transaction expired. Retrying with increased fee: ${prioritizationFee.toString()} microLamports...`);
      } else {
        throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  throw new Error('Transaction failed after multiple retries.');
}

export default deposit;
