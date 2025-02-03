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
      if (argv.openOrders) {
        // Close a specific OpenOrders account
        const openOrdersPubkey = loadPublicKey(argv.openOrders);
        logger.info(`Closing OpenOrders account: ${openOrdersPubkey.toBase58()}`);

        const openOrdersIndexer = findOpenOrdersIndexer(owner.publicKey, programId);
        const [closeIx, signers] = await client.closeOpenOrdersAccountIx(
          owner,
          openOrdersPubkey,
          owner.publicKey,
          openOrdersIndexer
        );

        const priorityFee = await getDynamicPriorityFee(connection);
        const signature = await sendWithRetry(provider, connection, [closeIx], priorityFee);
        logger.info(`Closed OpenOrders account: ${openOrdersPubkey.toBase58()} (TX: ${signature})`);
        return;
      }

      if (argv.market) {
        // Close all OpenOrders accounts for a specific market
        const marketPubkey = loadPublicKey(argv.market);
        logger.info(`Fetching all OpenOrders accounts for market: ${marketPubkey.toBase58()}`);

        const openOrdersAccounts = await client.findOpenOrdersForMarket(owner.publicKey, marketPubkey);
        if (openOrdersAccounts.length === 0) {
          logger.info('No OpenOrders accounts found for the specified market.');
          return;
        }

        logger.info(`Found ${openOrdersAccounts.length} OpenOrders accounts. Closing them...`);
        for (const openOrdersPubkey of openOrdersAccounts) {
          try {
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
            logger.error(`Failed to close OpenOrders account ${openOrdersPubkey.toBase58()}:`, error);
            handleOpenBookError(error);
          }
        }
        return;
      }

      if (argv.closeIndexer) {
        // Close the OpenOrders indexer
        logger.info(`Closing OpenOrders indexer for owner: ${owner.publicKey.toBase58()}`);

        try {
          const openOrdersIndexer = findOpenOrdersIndexer(owner.publicKey, programId);
          const [closeIndexerIx, signers] = await closeOpenOrdersIndexerIx(owner, connection, programId, openOrdersIndexer);
          const priorityFee = await getDynamicPriorityFee(connection);
          const signature = await sendWithRetry(provider, connection, [closeIndexerIx], priorityFee);

          logger.info(`Closed OpenOrders indexer (TX: ${signature})`);
          return;
        } catch (error) {
          logger.error(`Failed to close OpenOrders indexer:`, error);
          handleOpenBookError(error);

          throw new Error(`Failed to close OpenOrders indexer: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    } catch (error) {
      logger.error('Unexpected error occurred:', error);
      handleOpenBookError(error);

      throw new Error(`Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};

export default closeOOA;

/**
 * Parses OpenBook errors and displays human-readable messages.
 */
function handleOpenBookError(error: any) {
  try {
    // Convert error to an object to avoid empty `{}` in JSON.stringify
    const rawErrorMessage = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    logger.error(`Raw error response: ${JSON.stringify(rawErrorMessage, null, 2)}`);

    if (error?.err?.InstructionError) {
      const [_, errorData] = error.err.InstructionError;

      logger.error(`Detailed InstructionError: ${JSON.stringify(errorData, null, 2)}`);

      if (typeof errorData === "object" && "Custom" in errorData) {
        const errorCode = errorData.Custom;
        const errorMessage = getOpenBookErrorMessage(errorCode);
        logger.error(`OpenBook Error (${errorCode}): ${errorMessage}`);
        return;
      }
    }

    logger.error(`Unexpected error format: ${JSON.stringify(rawErrorMessage, null, 2)}`);
  } catch (e) {
    logger.error('Error processing OpenBook error:', e);
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
