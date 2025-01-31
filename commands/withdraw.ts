import { CommandModule } from 'yargs';
import { 
  createConnection, 
  createProvider, 
  createClient, 
  loadKeypair, 
  loadPublicKey 
} from '../utils/setup';
import { 
  PublicKey, 
  Transaction, 
  Connection, 
  Keypair, 
  TransactionInstruction 
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountIdempotentInstruction 
} from '@openbook-dex/openbook-v2';
import { Wallet } from '@coral-xyz/anchor';
import logger from '../utils/logger';

interface WithdrawArgs {
  market: string;
  openOrders: string;
  ownerKeypair: string;
}

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
    const connection: Connection = createConnection();
    const owner: Keypair = loadKeypair(argv.ownerKeypair);
    const wallet = new Wallet(owner);
    const provider = createProvider(connection, wallet);
    const client = createClient(provider);

    const marketPubkey = loadPublicKey(argv.market);
    const openOrdersPubkey = loadPublicKey(argv.openOrders);

    try {
      logger.info(`Using wallet: ${owner.publicKey.toBase58()}`);
      logger.info(`Market: ${marketPubkey.toBase58()}`);

      // Fetch market data
      logger.info('Fetching and validating market data...');
      const marketAccount = await validateAndFetchMarket(connection, client, marketPubkey);

      logger.info('Deserializing OpenOrders account...');
      const openOrdersAccount = await client.deserializeOpenOrderAccount(openOrdersPubkey);

      if (!openOrdersAccount) {
        throw new Error('OpenOrders account not found.');
      }

      if (openOrdersAccount.market.toBase58() !== marketPubkey.toBase58()) {
        throw new Error('OpenOrders account does not belong to the specified market.');
      }

      logger.info('Ensuring associated token accounts...');
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
      logger.error('Error during withdrawal:');
      
      if ((error as any).message?.includes('block height exceeded')) {
        logger.error('This error is due to using a public RPC endpoint. Please use a commercial RPC node and update the .env file!');
      }

      logger.error(`Error details: ${(error as Error).message}`);
      process.exit(1);
    }
  },
};

// **Helper function to fetch market data (restored from old code)**
async function validateAndFetchMarket(
  connection: Connection,
  client: any, 
  marketPubkey: PublicKey
): Promise<any> {
  const marketDataRaw = await connection.getAccountInfo(marketPubkey);
  if (!marketDataRaw || !marketDataRaw.data) {
    throw new Error('Market data not found.');
  }
  logger.info('Market data fetched successfully.');
  return client.decodeMarket(marketDataRaw.data);
}

// **Helper function to ensure Associated Token Account (ATA)**
async function ensureAssociatedTokenAccount(
  connection: Connection,
  owner: Keypair,
  mint: PublicKey,
  walletPublicKey: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, walletPublicKey, true);
  const ataInfo = await connection.getAccountInfo(ata);

  if (!ataInfo) {
    logger.info(`Creating associated token account for mint: ${mint.toBase58()}`);
    
    // **Fix: Await the creation instruction**
    const createAtaIx: TransactionInstruction = await createAssociatedTokenAccountIdempotentInstruction(
      owner.publicKey,
      walletPublicKey,
      mint
    );

    const transaction = new Transaction().add(createAtaIx);
    const signature = await connection.sendTransaction(transaction, [owner], { skipPreflight: false });
    
    logger.info(`ATA created successfully. Transaction ID: ${signature}`);
  } else {
    logger.info(`Associated token account already exists for mint: ${mint.toBase58()}`);
  }

  return ata;
}

export default withdraw;
