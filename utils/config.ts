import { PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// RPC Configuration
export const RPC_CONFIG = {
  MAINNET_URL: process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com',
};

// Program IDs
export const PROGRAM_IDS = {
  OPENBOOK_V2_PROGRAM_ID: new PublicKey('opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb'),
};

// Defaults and Limits
export const DEFAULTS = {
  ORDER_LIMIT: 16, // Default limit for fetching orders
  REFRESH_INTERVAL_MS: 1000, // Default interval for refreshing market data
};

// Utility Functions
export function getRpcUrl(): string {
  return RPC_CONFIG.MAINNET_URL;
}
