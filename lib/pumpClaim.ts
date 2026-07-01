import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";

const PUMPPORTAL_TRADE_LOCAL = "https://pumpportal.fun/api/trade-local";

export interface ClaimResult {
  claimed: boolean;
  txid?: string;
  error?: string;
}

/* ── Claim Pump.fun creator fees (paid in SOL) via PumpPortal's Local Transaction API ──
   Self-custodial: PumpPortal returns an unsigned VersionedTransaction, we sign it with the
   pipeline's own keypair and submit it ourselves. The local endpoint claims all accrued
   creator fees for the wallet (no per-mint param). Failures — including "nothing to claim" —
   are returned, never thrown, so a claim hiccup never aborts the rest of the pipeline run. */
export async function claimCreatorFees(connection: Connection, keypair: Keypair): Promise<ClaimResult> {
  try {
    const res = await fetch(PUMPPORTAL_TRADE_LOCAL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: keypair.publicKey.toBase58(),
        action: "collectCreatorFee",
        priorityFee: 0.00001,
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

    const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature: txid, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
      "confirmed"
    );

    return { claimed: true, txid };
  } catch (err: any) {
    return { claimed: false, error: err?.message ?? String(err) };
  }
}
