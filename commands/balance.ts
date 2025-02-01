/**
 * Command	Description
 * balance	Fetches the base and quote token balances for an OpenOrders account on a specified market.
 *  
 * Example Usage
 * npx ts-node cli.ts balance --openOrders <OPEN_ORDERS_PUBKEY> --market <MARKET_PUBKEY>
 * 
 * Parameters
 * --openOrders: The public key of the OpenOrders account.
 * --market: The public key of the market.
 *  
 */
import { CommandModule } from 'yargs';
import { createConnection, createProvider, createClient, loadPublicKey, createStubWallet } from '../utils/helper';
import { Market, OpenOrders } from '@openbook-dex/openbook-v2'; 
import logger from '../utils/logger';

// Define CLI argument types
interface BalanceArgs {
  openOrders: string;
  market: string;
}

// Define the CLI command structure
const balance: CommandModule<{}, BalanceArgs> = {
  command: 'balance',
  describe: 'Fetch balances from OpenBook trading account',
  builder: (yargs) =>
    yargs
      .option('openOrders', {
        type: 'string',
        demandOption: true,
        description: 'OpenOrders account public key',
      })
      .option('market', {
        type: 'string',
        demandOption: true,
        description: 'Market public key',
      }),
  handler: async (argv) => {
    // Initialize a connection to the Solana blockchain
    const connection = createConnection();

    // Create a read-only wallet (since this command is read-only)
    const wallet = createStubWallet();
    
    // Create a provider for interacting with the blockchain
    const provider = createProvider(connection, wallet);
    
    // Initialize OpenBook client
    const client = createClient(provider);

    // Convert the input arguments (public keys) into Solana PublicKey objects
    const openOrdersPubkey = loadPublicKey(argv.openOrders);
    const marketPubkey = loadPublicKey(argv.market);

    try {
      logger.info(`Fetching balances for OpenOrders account: ${openOrdersPubkey.toBase58()}`);

      // Load the market using the OpenBookV2 client
      logger.info(`Loading market: ${marketPubkey.toBase58()}...`);
      const market = await Market.load(client, marketPubkey);

      // Load OpenOrders account associated with the given market
      const openOrders = await OpenOrders.load(openOrdersPubkey, market, client);
      if (!openOrders) {
        throw new Error('Failed to load OpenOrders account.');
      }

      // Fetch balances in user-friendly UI format
      const baseBalanceUi = openOrders.getBaseBalanceUi();
      const quoteBalanceUi = openOrders.getQuoteBalanceUi();

      // Log the retrieved balances
      logger.info('Balances:');
      logger.info(`  Base Token Balance: ${baseBalanceUi}`);
      logger.info(`  Quote Token Balance: ${quoteBalanceUi}`);
    } catch (error) {
      // Handle errors and exit if fetching balances fails
      logger.error(`Error fetching balances: ${(error as Error).message}`);
      process.exit(1);
    }
  },
};

// Export the command for use in the CLI
export default balance;
