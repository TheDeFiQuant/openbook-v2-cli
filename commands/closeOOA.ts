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
 * npx ts-node cli.ts closeOOA --ownerKeypair <KEYPAIR_PATH> --closeIndexer (does not work right now)
 *
 * Parameters:
 * --ownerKeypair (Required): Path to the keypair file of the OpenOrders account owner.
 * --market (Optional): Public key of the market (required if closing all OpenOrders accounts for a market).
 * --openOrders (Optional): Public key of a specific OpenOrders account to close.
 * --closeIndexer (Optional): If set, closes the OpenOrders indexer. (does not work right now)
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
import { Connection, PublicKey, TransactionInstruction, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Wallet } from '@coral-xyz/anchor';
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
  describe:
    'Close a specific OpenOrders account, all accounts for a market, or the OpenOrders indexer.',
  builder: (yargs) =>
    yargs
      .option('ownerKeypair', {
        type: 'string',
        demandOption: true,
        description: 'Path to the owner keypair file',
      })
      .option('market', {
        type: 'string',
        description:
          'Market public key (required when closing all OpenOrders accounts for a market)',
      })
      .option('openOrders', {
        type: 'string',
        description: 'Specific OpenOrders account public key to close (optional)',
      })
      .option('closeIndexer', {
        type: 'boolean',
        description:
          'Close the OpenOrders indexer (only one per owner, shared across all markets) DOES NOT WORK RIGHT NOW',
      }),
  handler: async (argv) => {
    // Initialize the Solana connection and load the owner's keypair.
    const connection: Connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);
    const programId = client.program.programId;

    try {
      if (argv.openOrders) {
        // Close a specific OpenOrders account
        const openOrdersPubkey = loadPublicKey(argv.openOrders);
        logger.info(`Closing OpenOrders account: ${openOrdersPubkey.toBase58()}`);

        // Derive the OpenOrders indexer PDA for the owner.
        const openOrdersIndexer = findOpenOrdersIndexer(owner.publicKey, programId);
        // Build the instruction and signers for closing the account.
        const [closeIx, signers] = await client.closeOpenOrdersAccountIx(
          owner,
          openOrdersPubkey,
          owner.publicKey,
          openOrdersIndexer
        );

        const priorityFee = await getDynamicPriorityFee(connection);
        // Attempt to send the transaction (sendWithRetry now throws the raw error if it fails)
        const signature = await sendWithRetry(provider, connection, [closeIx], priorityFee);
        logger.info(`Closed OpenOrders account: ${openOrdersPubkey.toBase58()} (TX: ${signature})`);
        return;
      } else if (argv.market) {
        // Close all OpenOrders accounts for a specific market
        const marketPubkey = loadPublicKey(argv.market);
        logger.info(`Fetching all OpenOrders accounts for market: ${marketPubkey.toBase58()}`);

        const openOrdersAccounts = await client.findOpenOrdersForMarket(
          owner.publicKey,
          marketPubkey
        );
        if (openOrdersAccounts.length === 0) {
          logger.info('No OpenOrders accounts found for the specified market.');
          return;
        }

        logger.info(`Found ${openOrdersAccounts.length} OpenOrders accounts. Closing them...`);
        for (const openOrdersPubkey of openOrdersAccounts) {
          try {
            // For each OpenOrders account, derive the indexer and attempt to close it.
            const openOrdersIndexer = findOpenOrdersIndexer(owner.publicKey, programId);
            logger.info(`Closing OpenOrders account: ${openOrdersPubkey.toBase58()}`);

            const [closeIx, signers] = await client.closeOpenOrdersAccountIx(
              owner,
              openOrdersPubkey,
              owner.publicKey,
              openOrdersIndexer
            );

            const priorityFee = await getDynamicPriorityFee(connection);
            const signature = await sendWithRetry(provider, connection, [closeIx], priorityFee);
            logger.info(`Closed OpenOrders account: ${openOrdersPubkey.toBase58()} (TX: ${signature})`);
          } catch (error) {
            // Log a friendly message and process the error via our custom error handler.
            logger.error(`Failed to close OpenOrders account ${openOrdersPubkey.toBase58()}.`);
            handleOpenBookError(error);
            // Continue processing remaining accounts.
          }
        }
        return;
      } else if (argv.closeIndexer) {
        // Close the OpenOrders indexer
        logger.info(`Closing OpenOrders indexer for owner: ${owner.publicKey.toBase58()}`);

        try {
          const openOrdersIndexer = findOpenOrdersIndexer(owner.publicKey, programId);
          const [closeIndexerIx, signers] = await closeOpenOrdersIndexerIx(
            owner,
            connection,
            programId,
            openOrdersIndexer
          );
          const priorityFee = await getDynamicPriorityFee(connection);
          const signature = await sendWithRetry(provider, connection, [closeIndexerIx], priorityFee);
          logger.info(`Closed OpenOrders indexer (TX: ${signature})`);
          return;
        } catch (error) {
          logger.error(`Failed to close OpenOrders indexer. Currently there is a Bug in Openbooks code that prevents the OOAindexer to be closed.`);
          handleOpenBookError(error);
          // On a critical failure in closing the indexer, log a friendly message and exit.
          process.exit(1);
        }
      } else {
        // If none of the valid options are provided, log an error and exit.
        logger.error('Invalid command: Provide either --openOrders, --market, or --closeIndexer.');
        process.exit(1);
      }
    } catch (error) {
      // Log a generic error message (without printing the raw error details) and exit.
      logger.error('An unexpected error occurred. Please check the logs for details.');
      handleOpenBookError(error);
      process.exit(1);
    }
  },
};

export default closeOOA;

/**
 * Parses OpenBook errors and logs a human-readable message.
 * Returns `true` if an OpenBook error was identified and handled; otherwise, returns false.
 */
function handleOpenBookError(error: any): boolean {
  try {
    if (!error || typeof error !== 'object') {
      logger.error(`Invalid error format.`);
      return false;
    }

    // Check if the error contains an InstructionError field.
    if (error?.err?.InstructionError) {
      const [_, errorData] = error.err.InstructionError;
      if (typeof errorData === 'object' && errorData !== null && 'Custom' in errorData) {
        const errorCode = errorData.Custom;
        const errorMessage = getOpenBookErrorMessage(errorCode);
        logger.error(`OpenBook Error (${errorCode}): ${errorMessage}`);
        return true;
      }
    }
    return false;
  } catch (e) {
    logger.error('Error processing OpenBook error.');
    return false;
  }
}

/**
 * Derives the OpenOrdersIndexer PDA for a given owner.
 */
function findOpenOrdersIndexer(owner: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('OpenOrdersIndexer'), owner.toBuffer()],
    programId
  )[0];
}

/**
 * Constructs the transaction instruction to close the OpenOrders indexer.
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
