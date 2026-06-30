import "../styles/globals.css";
import type { AppProps } from "next/app";
import { SolanaWalletProvider } from "../components/SolanaWalletProvider";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SolanaWalletProvider>
      <Component {...pageProps} />
    </SolanaWalletProvider>
  );
}
