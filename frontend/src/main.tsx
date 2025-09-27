import React from 'react';
import ReactDOM from 'react-dom/client';
import { SuiClientProvider, createNetworkConfig, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import './index.css';
import App from './App.tsx';

// choose your network RPC
const { networkConfig } = createNetworkConfig({
  testnet: { url: 'https://fullnode.testnet.sui.io:443' },
  // mainnet: { url: 'https://fullnode.mainnet.sui.io:443' },
  // devnet: { url: 'https://fullnode.devnet.sui.io:443' },
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
