import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import fs from 'fs';
import { Buffer } from 'buffer';
import { OpenBookV2Client } from '@openbook-dex/openbook-v2';
import { RPC_CONFIG, PROGRAM_IDS } from './config';
import logger from './logger';
import { sendTransaction } from '@openbook-dex/openbook-v2/dist/cjs/utils/rpc';

// Constants
const BASE_PRIORITY_FEE = BigInt(10_000); // Minimum priority fee
const MAX_RETRIES = 10; // Maximum retry attempts for transactions

// Initialize Solana Connection
export function createConnection(url: string = RPC_CONFIG.MAINNET_URL): Connection {
  return new Connection(url, 'confirmed');
}

// Load Signer Keypair from a File
export function loadKeypair(filePath: string): Keypair {
  try {
    const keyData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(Buffer.from(keyData));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load keypair from file: ${filePath}. Error: ${error.message}`);
    }
    throw new Error(`Failed to load keypair from file: ${filePath}.`);
  }
}

// Create a Read-Only Wallet
export function createStubWallet(): Wallet {
  const stubKeypair = Keypair.generate();
  return new Wallet(stubKeypair);
}

// Create AnchorProvider
export function createProvider(connection: Connection, wallet: Wallet): AnchorProvider {
  return new AnchorProvider(connection, wallet, {
    preflightCommitment: 'confirmed',
  });
}

// Initialize OpenBookV2 Client
export function createClient(provider: AnchorProvider): OpenBookV2Client {
  return new OpenBookV2Client(provider, PROGRAM_IDS.OPENBOOK_V2_PROGRAM_ID);
}

// Load Public Key
export function loadPublicKey(key: string): PublicKey {
  try {
    return new PublicKey(key);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid public key: ${key}. Error: ${error.message}`);
    }
    throw new Error(`Invalid public key: ${key}.`);
  }
}

/**
 * Fetches the dynamic priority fee based on recent network activity.
 * Uses the mean value of non-zero prioritization fees from the last 150 blocks.
 */
export async function getDynamicPriorityFee(connection: Connection): Promise<bigint> {
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
export async function sendWithRetry(
  provider: AnchorProvider,
  connection: Connection,
  instructions: TransactionInstruction[],
  prioritizationFee: bigint
): Promise<string> {
  let attempt = 0;
  let signature: string | null = null;

  // Predefined escalation steps for retry attempts
  const baseRetrySteps = [
    250_000n, 500_000n, 1_000_000n, 1_500_000n,
    2_000_000n, 4_000_000n, 8_000_000n, 16_000_000n, 32_000_000n
  ];

  while (attempt < MAX_RETRIES) {
    try {
      let latestBlockhash = await connection.getLatestBlockhash('confirmed');
      logger.info(`Attempt ${attempt + 1}/${MAX_RETRIES}: Sending transaction with priority fee ${prioritizationFee.toString()} microLamports`);

      // Send the transaction and store the signature
      signature = await sendTransaction(provider, instructions, [], {
        preflightCommitment: 'confirmed',
        maxRetries: 0,
        prioritizationFee: Number(prioritizationFee),
        latestBlockhash,
      });

      // Check for transaction confirmation
      const confirmationResult = await confirmTransactionWithPolling(connection, signature);

      if (confirmationResult) {
        logger.info(`Transaction ${signature} confirmed.`);
        return signature;
      }

      // If transaction is still pending, allow additional time before retrying
      logger.warn(`Transaction ${signature} is still pending. Retrying after grace period...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Short grace period

    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('block height exceeded')) {
        attempt++;

        // Before increasing the fee, re-check if the transaction landed
        if (signature) {
          const confirmationResult = await confirmTransactionWithPolling(connection, signature);
          if (confirmationResult) {
            logger.info(`Transaction ${signature} confirmed after retry check.`);
            return signature;
          }
        }

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

/**
 * Confirms a transaction using getSignatureStatus() with polling.
 * This function provides a more reliable confirmation strategy compared to confirmTransaction().
 */
export async function confirmTransactionWithPolling(connection: Connection, signature: string): Promise<boolean> {
  const maxChecks = 10; // Number of times to check before giving up
  const delay = 3000; // Delay between each check in milliseconds

  for (let i = 0; i < maxChecks; i++) {
    const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });

    if (status && status.value) {
      const confirmationStatus = status.value.confirmationStatus;
      if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
        return true;
      }
    }

    await new Promise(resolve => setTimeout(resolve, delay)); // Wait before checking again
  }

  return false;
}
