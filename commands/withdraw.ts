/**
 * CLI Command: withdraw
 * 
 * Description
 * Withdraws funds from an OpenOrders account on OpenBook. This allows users to reclaim their base and quote tokens from an active market.
 *
 * Example Usage
 * npx ts-node cli.ts withdraw --market <MARKET_PUBKEY> --openOrders <OPEN_ORDERS_PUBKEY> --ownerKeypair <KEYPAIR_PATH>
 *  
 * Parameters
 * --market (Required): Public key of the market where the OpenOrders account is located.
 * --openOrders (Required): Public key of the OpenOrders account.
 * --ownerKeypair (Required): Path to the keypair file of the account owner.
 */

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
} from '../utils/helper';
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
    // Establish connection to the Solana blockchain
    const connection: Connection = createConnection();

    // Load the keypair of the account owner
    const owner = loadKeypair(argv.ownerKeypair);

    // Create a wallet instance with the owner's keypair
    const wallet = new Wallet(owner);

    // Create an Anchor provider for blockchain interactions
    const provider = createProvider(connection, wallet);

    // Initialize an OpenBook client
    const client = createClient(provider);

    // Load the public keys for market and OpenOrders account
    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      logger.info(`Using wallet: ${owner.publicKey.toBase58()}`);
      logger.info(`Market: ${marketPubkey.toBase58()}`);

      // Fetch and validate market data
      logger.info('Fetching and validating market data...');
      const marketAccount = await validateAndFetchMarket(connection, client, marketPubkey);

      // Deserialize the OpenOrders account
      logger.info('Deserializing OpenOrders account...');
      const openOrdersAccount = await client.deserializeOpenOrderAccount(openOrdersPubkey);
      if (!openOrdersAccount) {
        throw new Error('OpenOrders account not found.');
      }

      // Ensure OpenOrders account is linked to the correct market
      if (openOrdersAccount.market.toBase58() !== marketPubkey.toBase58()) {
        throw new Error('OpenOrders account does not belong to the specified market.');
      }

      // Ensure that the associated token accounts exist
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

      // Prepare the withdrawal instruction
      logger.info('Preparing withdrawal instruction...');
      const [withdrawIx, signers] = await client.settleFundsIx(
        openOrdersPubkey,
        openOrdersAccount,
        marketPubkey,
        marketAccount,
        baseTokenAccount,
        quoteTokenAccount,
        null, // No referrer account specified
        owner.publicKey // The penalty payer is the owner
      );

      // Retrieve the dynamic priority fee for transaction processing
      const finalPriorityFee = await getDynamicPriorityFee(connection);

      // Execute the transaction with retry logic for better reliability
      const signature = await sendWithRetry(provider, connection, [withdrawIx], finalPriorityFee);

      logger.info(`Withdrawal transaction successful. Transaction ID: ${signature}`);
    } catch (error) {
      logger.error('Error during withdrawal:', error);
      process.exit(1);
    }
  },
};

export default withdraw;
