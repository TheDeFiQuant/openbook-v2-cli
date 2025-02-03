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
import { Connection, PublicKey, TransactionInstruction, Keypair } from '@solana/web3.js';
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
      } else if (argv.market) {
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
            handleOpenBookError(error);
          }
        }
      } else if (argv.closeIndexer) {
        // Close the OpenOrders indexer
        logger.info(`Closing OpenOrders indexer for owner: ${owner.publicKey.toBase58()}`);

        try {
          const [closeIndexerIx, signers] = await closeOpenOrdersIndexerIx(owner, connection, programId);
          const priorityFee = await getDynamicPriorityFee(connection);
          const signature = await sendWithRetry(provider, connection, [closeIndexerIx], priorityFee);

          logger.info(`Closed OpenOrders indexer (TX: ${signature})`);
        } catch (error) {
          handleOpenBookError(error);
        }
      } else {
        logger.error('Invalid command: Provide either --openOrders, --market, or --closeIndexer');
        process.exit(1);
      }

      logger.info('Operation completed successfully.');
    } catch (error) {
      handleOpenBookError(error);
    }
  },
};

export default closeOOA;

/**
 * Finds the OpenOrdersIndexer PDA for an owner.
 */
function findOpenOrdersIndexer(owner: PublicKey, programId: PublicKey): PublicKey {
  const [openOrdersIndexer] = PublicKey.findProgramAddressSync(
    [Buffer.from('OpenOrdersIndexer'), owner.toBuffer()],
    programId
  );
  return openOrdersIndexer;
}

/**
 * Constructs the transaction instruction to close the OpenOrders Indexer.
 */
async function closeOpenOrdersIndexerIx(
  owner: Keypair,
  connection: Connection,
  programId: PublicKey
): Promise<[TransactionInstruction, Keypair[]]> {
  const openOrdersIndexer = findOpenOrdersIndexer(owner.publicKey, programId);

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

/**
 * Handles OpenBook errors and provides a human-readable response.
 */
function handleOpenBookError(error: any) {
  if (error && error.err && error.err.InstructionError) {
    const [_, errData] = error.err.InstructionError;
    if (errData.Custom !== undefined) {
      const errorMessage = getOpenBookErrorMessage(errData.Custom);
      logger.error(`OpenBook Error: ${errorMessage}`);
    } else {
      logger.error(`Transaction failed with unknown error: ${JSON.stringify(error)}`);
    }
  } else {
    logger.error('Unexpected error occurred:', error);
  }
  process.exit(1);
}
