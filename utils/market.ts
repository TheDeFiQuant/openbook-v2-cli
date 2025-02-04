import { Connection, PublicKey, Message } from '@solana/web3.js';
import { Program, Provider, getProvider, utils } from '@coral-xyz/anchor';
import { IDL, OpenbookV2 } from '@openbook-dex/openbook-v2';
import { PROGRAM_IDS } from '../utils/config';
import logger from '../utils/logger';

const MAX_SIGNATURES_PER_REQUEST = 200; // Pagination limit for signature fetching
const BATCH_TX_SIZE = 5; // Reduced batch size for transactions to avoid overload
const MAX_RETRIES = 3; // Max retries for failed transaction fetching

interface Market {
  market: string;
  baseMint: string;
  quoteMint: string;
  name: string;
  timestamp: number | null;
  baseVault: string | null;
  quoteVault: string | null;
  baseVaultBalance: number | 'Unavailable';
  quoteVaultBalance: number | 'Unavailable';
}

/**
 * Fetch all markets from OpenBook efficiently.
 */
export async function findAllMarkets(
  connection: Connection,
  programId: PublicKey = PROGRAM_IDS.OPENBOOK_V2_PROGRAM_ID,
  provider?: Provider
): Promise<Market[]> {
  if (!provider) {
    provider = getProvider();
  }
  const program = new Program<OpenbookV2>(IDL, programId, provider);

  // Find the Event Authority PDA
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    programId
  );

  logger.info('Fetching all market creation events...');

  let signatures: string[] = [];
  let beforeSignature: string | undefined = undefined;

  // **🔄 Paginate signature fetching to avoid RPC overload**
  while (true) {
    try {
      const newSignatures = await connection.getSignaturesForAddress(eventAuthority, {
        limit: MAX_SIGNATURES_PER_REQUEST,
        before: beforeSignature,
      });

      if (newSignatures.length === 0) break;

      signatures.push(...newSignatures.map((x) => x.signature));
      beforeSignature = newSignatures[newSignatures.length - 1].signature;

      // **💡 Stop fetching if fewer than MAX_SIGNATURES_PER_REQUEST were returned**
      if (newSignatures.length < MAX_SIGNATURES_PER_REQUEST) break;
    } catch (error) {
      logger.error(`Error fetching signatures: ${(error as Error).message}`);
      break; // Stop execution if RPC fails
    }
  }

  logger.info(`Fetched ${signatures.length} signatures.`);

  const marketsAll: Market[] = [];

  // **Fetch transactions in small batches to avoid RPC failures**
  for (let i = 0; i < signatures.length; i += BATCH_TX_SIZE) {
    const batch = signatures.slice(i, i + BATCH_TX_SIZE);

    let allTxs: any[] = [];
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        allTxs = await connection.getTransactions(batch, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        break; // Success, exit retry loop
      } catch (error) {
        attempt++;
        logger.warn(`Retrying batch ${i / BATCH_TX_SIZE + 1}: Attempt ${attempt}`);
        await new Promise((res) => setTimeout(res, 2000)); // Wait before retrying
      }
    }

    // **🚀 Process each transaction**
    for (const tx of allTxs) {
      if (!tx?.meta?.innerInstructions || !tx?.transaction?.message?.staticAccountKeys) continue;

      for (const innerIns of tx.meta.innerInstructions) {
        for (const innerIx of innerIns.instructions) {
          if (!innerIx?.accounts || innerIx.programIdIndex == null) continue;

          try {
            // **Validate event authority and program ID**
            const eventAuthorityKey = innerIx.accounts[0];
            const programKey = innerIx.programIdIndex;

            const staticKeys = tx.transaction.message.staticAccountKeys;
            if (
              eventAuthorityKey >= staticKeys.length ||
              programKey >= staticKeys.length ||
              staticKeys[eventAuthorityKey]?.toString() !== eventAuthority.toString() ||
              staticKeys[programKey]?.toString() !== programId.toString()
            ) {
              continue;
            }

            // **Decode the event using Anchor**
            const ixData = utils.bytes.bs58.decode(innerIx.data);
            const eventData = utils.bytes.base64.encode(ixData.slice(8));
            const event = program.coder.events.decode(eventData);

            if (event && event.data) {
              const marketPubkey = event.data.market ? (event.data.market as PublicKey).toString() : 'N/A';
              const baseMint = event.data.baseMint ? (event.data.baseMint as PublicKey).toString() : 'N/A';
              const quoteMint = event.data.quoteMint ? (event.data.quoteMint as PublicKey).toString() : 'N/A';
              const marketName = event.data.name ? (event.data.name as string) : 'Unknown';
              const timestamp = tx.blockTime ?? null; // Ensure timestamp is not undefined

              // **Extract base and quote vault addresses**
              const baseVault = event.data.market_base_vault
                ? (event.data.market_base_vault as PublicKey).toString()
                : null;
              const quoteVault = event.data.market_quote_vault
                ? (event.data.market_quote_vault as PublicKey).toString()
                : null;

              marketsAll.push({
                market: marketPubkey,
                baseMint,
                quoteMint,
                name: marketName,
                timestamp,
                baseVault,
                quoteVault,
                baseVaultBalance: 'Unavailable',
                quoteVaultBalance: 'Unavailable',
              });
            }
          } catch (decodeError) {
            logger.warn(`Failed to decode event in transaction: ${tx.transaction.signatures[0]}`);
          }
        }
      }
    }
  }

  // **Fetch vault balances for each market**
  for (const market of marketsAll) {
    try {
      if (market.baseVault) {
        market.baseVaultBalance = await getVaultBalance(connection, new PublicKey(market.baseVault));
      }
      if (market.quoteVault) {
        market.quoteVaultBalance = await getVaultBalance(connection, new PublicKey(market.quoteVault));
      }
    } catch (error) {
      logger.warn(`Failed to fetch balances for market ${market.market}`);
    }
  }

  logger.info(`Found ${marketsAll.length} markets.`);
  return marketsAll;
}

/**
 * Fetches the balance of a given vault.
 */
async function getVaultBalance(connection: Connection, vaultAddress: PublicKey): Promise<number | 'Unavailable'> {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const balanceInfo = await connection.getTokenAccountBalance(vaultAddress);
      if (!balanceInfo?.value?.uiAmount) {
        logger.warn(`Vault ${vaultAddress.toString()} returned undefined balance. Full response: ${JSON.stringify(balanceInfo)}`);
        return 'Unavailable';
      }
      return balanceInfo.value.uiAmount;
    } catch (error) {
      attempts++;
      logger.warn(`Retry ${attempts}/${MAX_RETRIES} for vault ${vaultAddress.toString()}. Error: ${(error as Error).message}`);
      await new Promise((res) => setTimeout(res, 1000)); // 1 sec delay before retry
    }
  }
  logger.error(`Final failure: Could not fetch balance for vault ${vaultAddress.toString()} after ${MAX_RETRIES} attempts.`);
  return 'Unavailable';
}
