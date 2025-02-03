/**
 * CLI Command: closeOOA
 * 
 * Description:
 * - If `--openOrders` is provided, closes the specified OpenOrders account.
 * - If `--market` is provided, closes all OpenOrders accounts for that market.
 * - If `--closeIndexer` is provided, closes the OpenOrders indexer (only after all OpenOrders are closed).
 *
 * Example Usage:
 * npx ts-node cli.ts closeOOA --ownerKeypair <KEYPAIR_PATH> --openOrders <OPEN_ORDERS_PUBKEY>
 * npx ts-node cli.ts closeOOA --ownerKeypair <KEYPAIR_PATH> --market <MARKET_PUBKEY>
 * npx ts-node cli.ts closeOOA --ownerKeypair <KEYPAIR_PATH> --closeIndexer
 *
 * Parameters:
 * --ownerKeypair (Required): Path to the keypair file of the OpenOrders account owner.
 * --market (Optional): Public key of the market (required if closing all OpenOrders accounts for a market).
 * --openOrders (Optional): Public key of a specific OpenOrders account to close.
 * --closeIndexer (Optional): If set, closes the OpenOrders indexer.
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
} from '../utils/helper';
import { Connection, PublicKey, TransactionInstruction, Keypair, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { getOpenBookErrorMessage } from '../utils/error';
import logger from '../utils/logger';

/**
 * Interface defining the required arguments for the closeOOA command.
 */
interface CloseOOAArgs {
  ownerKeypair: string;
  market?: string;
  openOrders?: string;
  closeIndexer?: boolean;
}

/**
 * CLI command to close OpenOrders accounts and optionally remove the OpenOrders indexer.
 */
const closeOOA: CommandModule<{}, CloseOOAArgs> = {
  command: 'closeOOA',
  describe: 'Close a specific OpenOrders account, all accounts for a market, or the OpenOrders indexer.',
  builder: (yargs) =>
    yargs
      .option('ownerKeypair', {
        type: 'string',
        demandOption: true,
        description: 'Path to the owner keypair file',
      })
      .option('market', {
        type: 'string',
        description: 'Market public key (required when closing all OpenOrders accounts for a market)',
      })
      .option('openOrders', {
        type: 'string',
        description: 'Specific OpenOrders account public key to close (optional)',
      })
      .option('closeIndexer', {
        type: 'boolean',
        description: 'Close the OpenOrders indexer (only one per owner, shared across all markets)',
      }),
  handler: async (argv) => {
    // Initialize Solana connection and load the owner keypair
    const connection: Connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);
    const programId = client.program.programId; // Extract program ID

    try {
      if (argv.closeIndexer) {
        logger.info(`Closing OpenOrders indexer for owner: ${owner.publicKey.toBase58()}`);

        try {
          const openOrdersIndexer = findOpenOrdersIndexer(owner.publicKey, programId);
          const [closeIndexerIx, signers] = await closeOpenOrdersIndexerIx(owner, connection, programId, openOrdersIndexer);
          const priorityFee = await getDynamicPriorityFee(connection);
          const signature = await sendWithRetry(provider, connection, [closeIndexerIx], priorityFee);

          logger.info(`Closed OpenOrders indexer (TX: ${signature})`);
          return;
        } catch (error) {
          // Ensure correct error logging and avoid empty `{}` errors
          logger.error(`Raw error object: ${JSON.stringify(error, null, 2)}`);

          if (!handleOpenBookError(error)) {
            logger.error("Failed to close OpenOrders indexer:", error);
          }

          throw new Error(`Failed to close OpenOrders indexer: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    } catch (error) {
      // Ensure correct error logging and avoid empty `{}` errors
      logger.error(`Raw error object: ${JSON.stringify(error, null, 2)}`);

      if (!handleOpenBookError(error)) {
        logger.error("Unexpected error occurred:", error);
      }

      throw new Error(`Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};

export default closeOOA;

/**
 * Parses OpenBook errors and displays human-readable messages.
 * Returns `true` if an OpenBook error was handled, `false` otherwise.
 */
function handleOpenBookError(error: any): boolean {
  try {
    if (!error || typeof error !== "object") {
      logger.error(`Invalid error format: ${JSON.stringify(error, null, 2)}`);
      return false;
    }

    if (error?.err?.InstructionError) {
      const [_, errorData] = error.err.InstructionError;

      if (typeof errorData === "object" && errorData !== null && "Custom" in errorData) {
        const errorCode = errorData.Custom;
        const errorMessage = getOpenBookErrorMessage(errorCode);

        logger.error(`OpenBook Error (${errorCode}): ${errorMessage}`);
        return true; // The error was identified and logged
      }
    }

    return false; // Not an OpenBook error, allow generic logging
  } catch (e) {
    logger.error("Error processing OpenBook error:", e);
    return false;
  }
}

/**
 * Finds the OpenOrdersIndexer PDA for an owner.
 */
function findOpenOrdersIndexer(owner: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('OpenOrdersIndexer'), owner.toBuffer()],
    programId
  )[0];
}

/**
 * Constructs the transaction instruction to close the OpenOrders Indexer.
 */
async function closeOpenOrdersIndexerIx(
  owner: Keypair,
  connection: Connection,
  programId: PublicKey,
  openOrdersIndexer: PublicKey
): Promise<[TransactionInstruction, Keypair[]]> {
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: false },
      { pubkey: openOrdersIndexer, isSigner: false, isWritable: true },
      { pubkey: owner.publicKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId,
    data: Buffer.alloc(0),
  });

  return [ix, [owner]];
}
