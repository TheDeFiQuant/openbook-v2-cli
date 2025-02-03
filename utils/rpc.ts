import { type AnchorProvider } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import {
  type AddressLookupTableAccount,
  ComputeBudgetProgram,
  MessageV0,
  type Signer,
  type TransactionInstruction,
  VersionedTransaction,
  Transaction,
} from '@solana/web3.js';

export async function sendTransaction(
  provider: AnchorProvider,
  ixs: TransactionInstruction[],
  alts: AddressLookupTableAccount[],
  opts: any = {},
): Promise<string> {
  const connection = provider.connection;
  const additionalSigners = opts?.additionalSigners || [];

  if ((connection as any).banksClient !== undefined) {
    const tx = new Transaction();
    for (const ix of ixs) {
      tx.add(ix);
    }
    tx.feePayer = provider.wallet.publicKey;
    [tx.recentBlockhash] = await (
      connection as any
    ).banksClient.getLatestBlockhash();

    for (const signer of additionalSigners) {
      tx.partialSign(signer);
    }

    await (connection as any).banksClient.processTransaction(tx);
    return '';
  }

  const latestBlockhash =
    opts?.latestBlockhash ??
    (await connection.getLatestBlockhash(
      opts?.preflightCommitment ??
        provider.opts.preflightCommitment ??
        'finalized',
    ));

  const payer = provider.wallet;

  if (opts?.prioritizationFee !== null && opts.prioritizationFee !== 0) {
    ixs = [createComputeBudgetIx(opts.prioritizationFee), ...ixs];
  }

  const message = MessageV0.compile({
    payerKey: payer.publicKey,
    instructions: ixs,
    recentBlockhash: latestBlockhash.blockhash,
    addressLookupTableAccounts: alts,
  });
  let vtx = new VersionedTransaction(message);

  if (additionalSigners !== undefined && additionalSigners.length !== 0) {
    vtx.sign([...additionalSigners]);
  }

  if (
    typeof payer.signTransaction === 'function' &&
    !(payer instanceof NodeWallet || payer.constructor.name === 'NodeWallet')
  ) {
    vtx = (await payer.signTransaction(
      vtx as any,
    )) as unknown as VersionedTransaction;
  } else {
    // Possibly the NodeWallet path.
    vtx.sign([(payer as any).payer as Signer]);
  }

  const signature = await connection.sendRawTransaction(vtx.serialize(), {
    skipPreflight: true, // mergedOpts.skipPreflight,
  });

  // If a post-send callback is provided, call it.
  if (opts?.postSendTxCallback !== undefined && opts?.postSendTxCallback !== null) {
    try {
      opts.postSendTxCallback({ txid: signature });
    } catch (e) {
      console.warn(`postSendTxCallback error`, e);
    }
  }

  const txConfirmationCommitment = opts?.txConfirmationCommitment ?? 'processed';
  let result: any;
  if (
    latestBlockhash.blockhash != null &&
    latestBlockhash.lastValidBlockHeight != null
  ) {
    result = (
      await connection.confirmTransaction(
        {
          signature: signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        txConfirmationCommitment,
      )
    ).value;
  } else {
    result = (await connection.confirmTransaction(signature, txConfirmationCommitment)).value;
  }

  // If there is an error, log the result and throw a custom error that preserves the raw error object.
  if (result.err !== '' && result.err !== null) {
    console.warn('Tx failed result: ', result);
    throw new OpenBookError({
      txid: signature,
      err: result.err,
    });
  }

  return signature;
}

export const createComputeBudgetIx = (
  microLamports: number,
): TransactionInstruction => {
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports,
  });
  return computeBudgetIx;
};

/**
 * Custom error class for OpenBook transactions.
 * This error preserves the raw error object (in the `err` property)
 * so that downstream error handlers can inspect nested properties (e.g. InstructionError).
 */
class OpenBookError extends Error {
  txid: string;
  err: any;
  constructor({ txid, err }: { txid: string; err: any }) {
    // Pass a simple message to super. (The raw error object is preserved separately.)
    super(`Transaction failed with error: ${JSON.stringify(err)}`);
    this.txid = txid;
    this.err = err;
    // Set the prototype explicitly (required for extending built-ins)
    Object.setPrototypeOf(this, OpenBookError.prototype);
  }
}
