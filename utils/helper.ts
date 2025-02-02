import { Connection, Keypair, PublicKey, TransactionInstruction, Transaction, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import fs from 'fs';
import { Buffer } from 'buffer';
import { OpenBookV2Client } from '@openbook-dex/openbook-v2';
import { RPC_CONFIG, PROGRAM_IDS } from './config';
import logger from './logger';
import { sendTransaction } from '@openbook-dex/openbook-v2/dist/cjs/utils/rpc';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';

// Constants
const BASE_PRIORITY_FEE = BigInt(100_000); // Minimum priority fee
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
  const delay = 1500; // Delay between each check in milliseconds

  for (let i = 0; i < maxChecks; i++) {
    const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });

    if (status && status.value) {
      const confirmationStatus = status.value.confirmationStatus;
      if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
        return true; // Transaction confirmed
      }
    }

    await new Promise(resolve => setTimeout(resolve, delay)); // Wait before checking again
  }

  return false; // Transaction not confirmed within maxChecks
}

/**
 * Fetch and validate market data from Solana RPC.
 * @param connection Solana connection object.
 * @param client OpenBookV2 client instance.
 * @param marketPubkey Public key of the market.
 * @returns Decoded market data.
 */
export async function validateAndFetchMarket(
  connection: Connection,
  client: OpenBookV2Client, 
  marketPubkey: PublicKey
): Promise<any> {
  const marketDataRaw = await connection.getAccountInfo(marketPubkey);
  if (!marketDataRaw || !marketDataRaw.data) {
    throw new Error('Market data not found.');
  }
  logger.info(`Market data for ${marketPubkey.toBase58()} fetched successfully.`);
  return client.decodeMarket(marketDataRaw.data);
}

/**
 * Ensures an Associated Token Account (ATA) exists for a given mint and wallet.
 * If the ATA does not exist, it creates one.
 * @param connection Solana connection object.
 * @param owner Owner keypair.
 * @param mint Token mint public key.
 * @param walletPublicKey Wallet public key to associate the token account with.
 * @returns Public key of the associated token account.
 */
export async function ensureAssociatedTokenAccount(
  connection: Connection,
  payer: Keypair, // Payer funds and signs the transaction
  mint: PublicKey,
  owner: PublicKey // Owner is just a PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner, true);
  const ataInfo = await connection.getAccountInfo(ata);

  if (!ataInfo) {
    logger.info(`Creating associated token account for mint: ${mint.toBase58()}`);

    // Construct the ATA creation instruction
    const createAtaIx: TransactionInstruction = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, // Payer of fees
      ata,             // Associated Token Account address
      owner,           // Owner of the ATA
      mint,            // Token Mint
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Send the transaction with the payer signing
    const transaction = new Transaction().add(createAtaIx);
    const signature = await connection.sendTransaction(transaction, [payer], { skipPreflight: false });

    logger.info(`ATA created successfully. Transaction ID: ${signature}`);
  } else {
    logger.info(`Associated token account already exists for mint: ${mint.toBase58()}`);
  }

  return ata;
}


/**
 * Finds the PDA (Program Derived Address) for an OpenOrders Indexer of a given owner.
 * 
 * @param owner The owner's public key
 * @param programId The OpenBook program ID
 * @returns The PDA (Public Key) of the OpenOrders Indexer
 */
export function findOpenOrdersIndexer(owner: PublicKey, programId: PublicKey): PublicKey {
  const [openOrdersIndexer] = PublicKey.findProgramAddressSync(
    [Buffer.from('OpenOrdersIndexer'), owner.toBuffer()],
    programId
  );
  return openOrdersIndexer;
}

/**
 * Constructs the transaction instruction to close an OpenOrders Indexer.
 * 
 * @param owner The keypair of the owner
 * @param programId The OpenBook program ID
 * @returns The transaction instruction and signers needed
 */
export async function closeOpenOrdersIndexerIx(
  owner: Keypair,
  programId: PublicKey
): Promise<[TransactionInstruction, Keypair[]]> {
  const openOrdersIndexer = findOpenOrdersIndexer(owner.publicKey, programId);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: false }, // Owner
      { pubkey: openOrdersIndexer, isSigner: false, isWritable: true }, // OpenOrdersIndexer PDA
      { pubkey: owner.publicKey, isSigner: false, isWritable: true }, // Rent refund to owner
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // Token Program (for compatibility)
    ],
    programId,
    data: Buffer.alloc(0), // No extra data needed
  });

  return [ix, [owner]];
}

/**
 * Sends a transaction to close the OpenOrders Indexer.
 * 
 * @param connection Solana connection object
 * @param owner The keypair of the owner
 * @param programId The OpenBook program ID
 */
export async function closeOpenOrdersIndexer(
  connection: Connection,
  owner: Keypair,
  programId: PublicKey
) {
  try {
    logger.info(`Closing OpenOrders indexer for owner: ${owner.publicKey.toBase58()}`);

    const [closeIx, signers] = await closeOpenOrdersIndexerIx(owner, programId);

    // Fetch dynamic priority fee
    const prioritizationFee = await getDynamicPriorityFee(connection);

        const signature = await sendWithRetry(
      createProvider(connection, new Wallet(owner)), 
      connection,
      [closeIx],
      prioritizationFee 
    );

    logger.info(`Closed OpenOrders indexer (TX: ${signature})`);
  } catch (error) {
    logger.error('Failed to close OpenOrders indexer:', error);
  }
}

