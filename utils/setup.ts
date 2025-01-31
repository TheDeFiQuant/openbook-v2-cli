import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import fs from 'fs';
import { Buffer } from 'buffer';
import { OpenBookV2Client } from '@openbook-dex/openbook-v2';
import { RPC_CONFIG, PROGRAM_IDS } from './config';
import logger from './logger';

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

// Test RPC Connection
export async function testConnection(connection: Connection): Promise<boolean> {
  try {
    const start = Date.now();
    const version = await connection.getVersion();
    const end = Date.now();
    logger.info(`RPC Connection successful. Node version: ${version['solana-core']}`);
    logger.info(`RPC call latency: ${end - start}ms`);

    // Log block hash to ensure proper RPC response
    const latestBlockhash = await connection.getLatestBlockhash();
    logger.info(`Latest block hash: ${latestBlockhash.blockhash}`);
    return true;
  } catch (error) {
    logger.error('Failed to connect to the RPC endpoint. Please check your network or RPC URL.');
    logger.error(`Error details: ${(error as Error).message}`);
    return false;
  }
}

