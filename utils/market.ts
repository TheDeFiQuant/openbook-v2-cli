import { Connection, PublicKey, Message } from '@solana/web3.js';
import { Program, Provider, getProvider, utils } from '@coral-xyz/anchor';
import { IDL, OpenbookV2 } from '@openbook-dex/openbook-v2';
import { PROGRAM_IDS } from '../utils/config';
import logger from '../utils/logger';

const MAX_SIGNATURES_PER_REQUEST = 100; // Pagination limit for signature fetching
const BATCH_TX_SIZE = 10; // Reduced batch size for transactions to avoid overload
const MAX_RETRIES = 3; // Max retries for failed transaction fetching

interface Market {
  market: string;
  baseMint: string;
  quoteMint: string;
  name: string;
  timestamp: number | null;
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

              marketsAll.push({
                market: marketPubkey,
                baseMint,
                quoteMint,
                name: marketName,
                timestamp,
              });
            }
          } catch (decodeError) {
            logger.warn(`Failed to decode event in transaction: ${tx.transaction.signatures[0]}`);
          }
        }
      }
    }
  }

  logger.info(`Found ${marketsAll.length} markets.`);
  return marketsAll;
}
