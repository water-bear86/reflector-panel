import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

export function useSiws() {
  const { publicKey, signMessage, connected } = useWallet();
  const [siwsAddress, setSiwsAddress] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage || !connected) return;
    setSigning(true);
    try {
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const now = new Date().toISOString();
      const domain = typeof window !== "undefined" ? window.location.host : "reflector-panel.vercel.app";
      const address = publicKey.toBase58();

      const message = `${domain} wants you to sign in with your Solana account:\n${address}\n\nSign In With Solana — Reflector Panel\n\nURI: https://${domain}\nVersion: 1\nChain ID: mainnet\nNonce: ${nonce}\nIssued At: ${now}`;

      const sig = await signMessage(new TextEncoder().encode(message));
      const sigB58 = bs58.encode(sig);

      const res = await fetch("/api/siws/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature: sigB58, publicKey: address }),
      });

      const data = await res.json();
      if (data.ok) setSiwsAddress(data.address);
    } finally {
      setSigning(false);
    }
  }, [publicKey, signMessage, connected]);

  const signOut = useCallback(() => setSiwsAddress(null), []);

  return { siwsAddress, signedIn: !!siwsAddress, signing, signIn, signOut };
}
