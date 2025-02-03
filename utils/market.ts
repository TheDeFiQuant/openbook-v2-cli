import { Connection, PublicKey, Message } from '@solana/web3.js';
import { Program, Provider, utils } from '@coral-xyz/anchor';
import { IDL, OpenbookV2 } from '@openbook-dex/openbook-v2';
import { PROGRAM_IDS } from '../utils/config';
import logger from '../utils/logger';

const MAX_SIGNATURES_PER_REQUEST = 100; // Prevents RPC overload
const BATCH_TX_SIZE = 10; // Reduces batch size for getTransactions()
const MAX_RETRIES = 3;

/**
 * Fetch all markets from OpenBook.
 */
export async function findAllMarkets(
  connection: Connection,
  programId: PublicKey = PROGRAM_IDS.OPENBOOK_V2_PROGRAM_ID,
  provider?: Provider
): Promise<Market[]> {
  if (!provider) {
    provider = Provider.local(); // Use default provider if none provided
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

  // **🔄 Paginate signatures to avoid RPC overload**
  while (true) {
    const newSignatures = await connection.getSignaturesForAddress(eventAuthority, {
      limit: MAX_SIGNATURES_PER_REQUEST,
      before: beforeSignature,
    });

    if (newSignatures.length === 0) break;

    signatures.push(...newSignatures.map((x) => x.signature));
    beforeSignature = newSignatures[newSignatures.length - 1].signature;

    // **💡 Break if fewer than MAX_SIGNATURES_PER_REQUEST results are returned**
    if (newSignatures.length < MAX_SIGNATURES_PER_REQUEST) break;
  }

  logger.info(`Fetched ${signatures.length} signatures.`);

  const marketsAll: Market[] = [];

  // **🔄 Fetch transactions in small batches to avoid timeouts**
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
        break; // ✅ Success, break out of retry loop
      } catch (error) {
        attempt++;
        logger.warn(`Retrying batch ${i / BATCH_TX_SIZE + 1}: Attempt ${attempt}`);
        await new Promise((res) => setTimeout(res, 2000)); // Wait before retrying
      }
    }

    // **🚀 Process each transaction**
    for (const tx of allTxs) {
      if (!tx?.meta?.innerInstructions) continue;

      for (const innerIns of tx.meta.innerInstructions) {
        for (const innerIx of innerIns.instructions) {
          if (!innerIx?.accounts || !innerIx.programIdIndex) continue;

          // **Validate correct event authority and program ID**
          const eventAuthorityKey = innerIx.accounts[0];
          const programKey = innerIx.programIdIndex;
          if (
            (tx.transaction.message as Message).staticAccountKeys[eventAuthorityKey].toString() !== eventAuthority.toString() ||
            (tx.transaction.message as Message).staticAccountKeys[programKey].toString() !== programId.toString()
          ) {
            continue;
          }

          try {
            // **Decode the event using Anchor**
            const ixData = utils.bytes.bs58.decode(innerIx.data);
            const eventData = utils.bytes.base64.encode(ixData.slice(8));
            const event = program.coder.events.decode(eventData);

            if (event) {
              marketsAll.push({
                market: (event.data.market as PublicKey).toString(),
                baseMint: (event.data.baseMint as PublicKey).toString(),
                quoteMint: (event.data.quoteMint as PublicKey).toString(),
                name: event.data.name as string,
                timestamp: tx.blockTime,
              });
            }
          } catch (decodeError) {
            logger.warn(`Failed to decode event in transaction: ${tx.transaction.signatures[0]}`);
          }
        }
      }
    }
  }

  logger.info(`✅ Found ${marketsAll.length} markets.`);
  return marketsAll;
}