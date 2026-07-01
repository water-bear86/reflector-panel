import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";

const PUMPPORTAL_TRADE_LOCAL = "https://pumpportal.fun/api/trade-local";

export interface ClaimResult {
  claimed: boolean;
  txid?: string;
  claimedLamports?: number;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForSignature(connection: Connection, txid: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = (await connection.getSignatureStatuses([txid], { searchTransactionHistory: false })).value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await sleep(500);
  }
  throw new Error(`Signature ${txid} was not confirmed before retry timeout`);
}

/* ── Claim Pump.fun creator fees (paid in SOL) via PumpPortal's Local Transaction API ──
   Self-custodial: PumpPortal returns an unsigned VersionedTransaction, we sign it with the
   pipeline's own keypair and submit it ourselves. The local endpoint claims all accrued
   creator fees for the wallet (no per-mint param). Failures — including "nothing to claim" —
   are returned, never thrown, so a claim hiccup never aborts the rest of the pipeline run. */
export async function claimCreatorFees(connection: Connection, keypair: Keypair): Promise<ClaimResult> {
  try {
    const beforeLamports = await connection.getBalance(keypair.publicKey, "confirmed");
    let txid = "";
    let lastError = "";

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(PUMPPORTAL_TRADE_LOCAL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: keypair.publicKey.toBase58(),
          action: "collectCreatorFee",
          priorityFee: 0.00005,
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        return { claimed: false, error: `PumpPortal ${res.status}: ${msg.slice(0, 200)}` };
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) return { claimed: false, error: "empty response from PumpPortal" };

      const tx = VersionedTransaction.deserialize(new Uint8Array(buf));
      tx.sign([keypair]);

      txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
      try {
        await waitForSignature(connection, txid);
        lastError = "";
        break;
      } catch (err: any) {
        lastError = err?.message ?? String(err);
      }
    }

    if (lastError) return { claimed: false, error: lastError };

    const afterLamports = await connection.getBalance(keypair.publicKey, "confirmed");
    return { claimed: true, txid, claimedLamports: Math.max(0, afterLamports - beforeLamports) };
  } catch (err: any) {
    return { claimed: false, error: err?.message ?? String(err) };
  }
}
