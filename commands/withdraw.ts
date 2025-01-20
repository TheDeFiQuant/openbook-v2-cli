import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadKeypair, loadPublicKey } from '../utils/setup';
import logger from '../utils/logger';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } from '@openbook-dex/openbook-v2';

interface WithdrawArgs {
  market: string;
  openOrders: string;
  ownerKeypair: string;
}

const withdraw: CommandModule = {
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
        description: 'Path to the owner keypair file',
      }),
  handler: async (argv: WithdrawArgs) => {
    const connection = createConnection();
    const owner = loadKeypair(argv.ownerKeypair);
    const provider = createProvider(connection, { publicKey: owner.publicKey });
    const client = createClient(provider);

    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      logger.info('Fetching market data...');
      const marketAccount = await client.loadMarket(marketPubkey);

      logger.info('Deserializing OpenOrders account...');
      const openOrdersAccount = await client.deserializeOpenOrderAccount(openOrdersPubkey);

      if (!openOrdersAccount) {
        throw new Error('OpenOrders account not found.');
      }

      if (openOrdersAccount.market.toBase58() !== marketPubkey.toBase58()) {
        throw new Error('OpenOrders account does not belong to the specified market.');
      }

      logger.info('Ensuring associated token accounts...');
      const baseTokenAccount = await ensureAssociatedTokenAccount(connection, owner, marketAccount.baseMint, owner.publicKey);
      const quoteTokenAccount = await ensureAssociatedTokenAccount(connection, owner, marketAccount.quoteMint, owner.publicKey);

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

      const transaction = new Transaction().add(withdrawIx);

      logger.info('Sending transaction...');
      const signature = await connection.sendTransaction(transaction, [owner, ...signers], { skipPreflight: false });
      logger.info(`Withdrawal transaction sent successfully. Transaction ID: ${signature}`);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error during withdrawal: ${err.message}`);
      process.exit(1);
    }
  },
};

// Helper function for ensuring associated token accounts
async function ensureAssociatedTokenAccount(
  connection,
  owner,
  mint: PublicKey,
  walletPublicKey: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, walletPublicKey, true);
  const ataInfo = await connection.getAccountInfo(ata);

  if (!ataInfo) {
    logger.info(`Creating associated token account for mint: ${mint.toBase58()}`);
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, walletPublicKey, mint);
    const transaction = new Transaction().add(createAtaIx);
    const signature = await connection.sendTransaction(transaction, [owner], { skipPreflight: false });
    logger.info(`ATA created successfully. Transaction ID: ${signature}`);
  } else {
    logger.info(`Associated token account already exists for mint: ${mint.toBase58()}`);
  }

  return ata;
}

export default withdraw;
