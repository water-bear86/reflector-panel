import {
  Connection,
  Keypair,
  Transaction,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createCloseAccountInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";

/* ── Collect this pipeline's creator-fee share via Pump.fun fee sharing ──
   Replaces the old PumpPortal `collectCreatorFee` path (which only served the
   primary creator and required custody of the creator's own key).

   Model (sole-receiver, perpad-style): the creator has set THIS pipeline's
   generated wallet as the token's sole fee receiver (a single-shareholder
   SharingConfig at 100%). `distributeCreatorFees` is PERMISSIONLESS — any
   wallet can crank it — so the pipeline's own wallet signs and pays for the
   distribute, and the entire creator-fee balance lands in its account.

   Creator fees settle as wSOL; we unwrap to native SOL afterward so the rest
   of the pipeline (which treats the source as native SOL) works unchanged. */

export interface CollectResult {
  collected: boolean;
  txid?: string;
  collectedLamports?: number;
  note?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const COLLECT_PRIORITY_MICROLAMPORTS = 700_000;
const REBROADCAST_INTERVAL_MS = 2_000;

// Pump.fun's own minimum-distributable-fee check is very permissive — often barely more than
// what OUR distribute transaction itself costs in network + priority fees (~147k lamports at
// the priority rate above). Below this floor, the fee we'd pay to collect would eat most or
// all of what's collected, so we skip the (paid) distribute attempt and let it keep accruing.
// The free read-only accrual check above this still runs every poll — this only gates the
// on-chain transaction.
export const MIN_ECONOMICAL_DISTRIBUTE_LAMPORTS = 500_000; // ~3.4x the tx cost

/* Same reliable confirmation as pumpClaim: re-broadcast the one signed tx until
   its own blockhash expires, rather than a fixed wall-clock timeout. */
async function sendAndTrack(
  connection: Connection,
  signed: Transaction
): Promise<{ landed: boolean; txid: string; error?: string }> {
  const raw = signed.serialize();
  const txid = await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 5 });
  const blockhash = signed.recentBlockhash!;

  while (true) {
    const [statusRes, validRes] = await Promise.all([
      connection.getSignatureStatuses([txid], { searchTransactionHistory: false }),
      connection.isBlockhashValid(blockhash, { commitment: "confirmed" }),
    ]);
    const status = statusRes.value[0];
    if (status?.err) return { landed: false, txid, error: `tx failed: ${JSON.stringify(status.err)}` };
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return { landed: true, txid };
    }
    if (!validRes.value) {
      const finalStatus = (
        await connection.getSignatureStatuses([txid], { searchTransactionHistory: true })
      ).value[0];
      if (finalStatus?.confirmationStatus === "confirmed" || finalStatus?.confirmationStatus === "finalized") {
        return { landed: true, txid };
      }
      return { landed: false, txid, error: "blockhash expired before confirmation" };
    }
    await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
    await sleep(REBROADCAST_INTERVAL_MS);
  }
}

async function signSendConfirm(
  connection: Connection,
  keypair: Keypair,
  instructions: TransactionInstruction[]
): Promise<{ landed: boolean; txid: string; error?: string }> {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COLLECT_PRIORITY_MICROLAMPORTS }),
    ...instructions
  );
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);
  return sendAndTrack(connection, tx);
}

/* Unwrap any wSOL sitting in the wallet's native-mint ATA back to native SOL by
   closing the account (closing a wSOL ATA credits its lamports to the owner). */
async function unwrapWsol(connection: Connection, keypair: Keypair): Promise<void> {
  const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, keypair.publicKey);
  const info = await connection.getAccountInfo(wsolAta, "confirmed");
  if (!info) return; // no wSOL account to unwrap
  const ix = createCloseAccountInstruction(wsolAta, keypair.publicKey, keypair.publicKey);
  await signSendConfirm(connection, keypair, [ix]).catch(() => {});
}

/* Distribute (crank) the token's creator fees. The pipeline wallet must be the
   configured sole fee receiver; entitlement is validated separately at deploy
   time (see feeSharing.checkEntitlement). Never throws — a hiccup is returned
   so it can't abort the rest of the pipeline run. */
export async function collectSharedCreatorFees(
  connection: Connection,
  keypair: Keypair,
  feeMint: PublicKey
): Promise<CollectResult> {
  try {
    const sdk = new OnlinePumpSdk(connection);

    const min = await sdk.getMinimumDistributableFee(feeMint, keypair.publicKey);
    if (!min.canDistribute) {
      return {
        collected: false,
        note: `below minimum distributable fee (accrued ${min.distributableFees.toString()} lamports, need ${min.minimumRequired.toString()})`,
      };
    }

    // Pump.fun says there's enough to distribute, but check it against OUR OWN economic floor
    // before spending gas — its own minimum is often barely above what our distribute tx costs.
    const accrued = min.distributableFees.toNumber();
    if (accrued < MIN_ECONOMICAL_DISTRIBUTE_LAMPORTS) {
      return {
        collected: false,
        note: `accrued ${accrued} lamports — below the ${MIN_ECONOMICAL_DISTRIBUTE_LAMPORTS}-lamport break-even floor (this poll's network fee would eat most of it), waiting for more`,
      };
    }

    const before = await connection.getBalance(keypair.publicKey, "confirmed");

    const { instructions } = await sdk.buildDistributeCreatorFeesInstructions(feeMint);
    if (!instructions.length) return { collected: false, note: "SDK returned no distribute instructions" };

    const res = await signSendConfirm(connection, keypair, instructions);
    if (!res.landed) return { collected: false, error: res.error || "distribute did not confirm" };

    // Fees arrive as wSOL; unwrap so downstream sees native SOL.
    await unwrapWsol(connection, keypair);

    const after = await connection.getBalance(keypair.publicKey, "confirmed");
    return {
      collected: true,
      txid: res.txid,
      collectedLamports: Math.max(0, after - before),
    };
  } catch (err: any) {
    return { collected: false, error: err?.message ?? String(err) };
  }
}
