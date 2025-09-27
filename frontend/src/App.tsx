// src/App.tsx
import React, { useState, useEffect } from 'react';
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { TEMPLATE_PACKAGE, PLATFORM_CAP_ID, USDC_TYPE, DEFAULT_COIN_TYPE, DEFAULT_TREASURY_CAP_ID } from './const';

function ErrorPanel({ error }: { error: unknown }) {
  if (!error) return null;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  return (
    <div style={{ 
      background: '#fef2f2', 
      border: '2px solid #dc2626', 
      padding: 16, 
      marginTop: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.1)'
    }}>
      <div style={{ fontWeight: 'bold', color: '#dc2626', marginBottom: 8, fontSize: '16px' }}>
        🚨 Error Details:
      </div>
      <div style={{ marginBottom: 8, color: '#dc2626', fontWeight: '500' }}>
        <strong style={{ color: '#991b1b' }}>Message:</strong> {errorMessage}
      </div>
      {errorStack && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#dc2626' }}>Stack Trace</summary>
          <pre style={{ 
            whiteSpace: 'pre-wrap', 
            fontSize: '12px', 
            marginTop: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            padding: 8,
            borderRadius: 4,
            color: '#991b1b'
          }}>
            {errorStack}
          </pre>
        </details>
      )}
    </div>
  );
}

function DebugPanel({ 
  title, 
  data, 
  isVisible = false 
}: { 
  title: string; 
  data: any; 
  isVisible?: boolean;
}) {
  if (!isVisible) return null;
  
  return (
    <div style={{ 
      background: '#f0f9ff', 
      border: '1px solid #0ea5e9', 
      padding: 12, 
      marginTop: 8,
      borderRadius: 6,
      fontSize: '13px'
    }}>
      <div style={{ fontWeight: 'bold', color: '#0369a1', marginBottom: 8 }}>
        🔍 {title}
      </div>
      <pre style={{ 
        whiteSpace: 'pre-wrap', 
        fontSize: '12px',
        background: '#f8fafc',
        padding: 8,
        borderRadius: 4,
        overflow: 'auto',
        maxHeight: '300px'
      }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function LoadingSpinner({ message }: { message: string }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 8, 
      padding: 12,
      background: '#f0f9ff',
      border: '1px solid #0ea5e9',
      borderRadius: 6,
      marginTop: 8
    }}>
      <div style={{ 
        width: 16, 
        height: 16, 
        border: '2px solid #0ea5e9', 
        borderTop: '2px solid transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <span style={{ color: '#0369a1', fontWeight: '500' }}>{message}</span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#94a3b8' }}>{label}</span>
      {children}
    </label>
  );
}

export default function App() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [lastError, setLastError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [debugMode, setDebugMode] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);

  // -------- Router (hash-based) --------
  type Route = { name: 'explore' | 'admin' | 'product'; id?: string };
  const [route, setRoute] = useState<Route>({ name: 'explore' });
  function parseHash(): Route {
    const h = (window.location.hash || '').replace(/^#\/?/, '');
    if (h.startsWith('admin')) return { name: 'admin' };
    if (h.startsWith('product/')) return { name: 'product', id: h.slice('product/'.length) };
    return { name: 'explore' };
  }
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // ---------- UI state: New Asset & Sale ----------
  const [totalSupply, setTotalSupply] = useState('1000');
  const [totalPrice, setTotalPrice] = useState('50000');
  const [symbol, setSymbol] = useState('MONA');
  const [assetName, setAssetName] = useState('Mona Lisa Digital Masterpiece');
  const [description, setDescription] = useState('Leonardo da Vinci\'s iconic masterpiece, now tokenized for digital ownership and fractional investment opportunities');
  const [iconUrl, setIconUrl] = useState('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/687px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg');
  const [buyAmount, setBuyAmount] = useState('1');
  const [saleId, setSaleId] = useState('');
  // Admin does not need to fill coin type / treasury cap; resolve automatically

  // ---------- Helpers ----------
  function parseSaleShareCoinType(saleType: string): string | null {
    // expects something like 0x...::template::Sale<COIN_TYPE>
    const m = saleType.match(/::template::Sale<(.+)>$/);
    return m ? m[1] : null;
  }

  // ---------- Dev helpers: expose to window for console debugging ----------
  useEffect(() => {
    try {
      (window as any).client = client;
      (window as any).TEMPLATE_PACKAGE = TEMPLATE_PACKAGE;
    } catch {}
  }, [client]);

  // Convert USDC units to dollars (assuming 6 decimals like standard USDC)
  function formatUSDC(amount: bigint): string {
    const dollars = Number(amount) / 1_000_000; // USDC has 6 decimals
    return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  }

  // Refresh all data queries
  async function refreshAllData() {
    try {
      await Promise.all([
        refetchSales(),
        route.name === 'product' && route.id ? refetchProduct() : Promise.resolve(),
        route.name === 'product' && route.id ? refetchHoldings() : Promise.resolve(),
      ]);
    } catch (e) {
      console.warn('Some data refresh failed:', e);
    }
  }
  

  // ---

  // ---------- Fetch details for current product (sale + NFT + coin data) ----------
  const { data: product, refetch: refetchProduct } = useQuery({
    queryKey: ['product', route.name === 'product' ? route.id : null],
    enabled: route.name === 'product' && !!route.id,
    queryFn: async () => {
      const saleObj = await client.getObject({ id: route.id!, options: { showContent: true, showPreviousTransaction: true } });
      const fields: any = (saleObj as any).data?.content?.fields;
      // Read NFT data from vault
      const nft = fields?.vault?.fields?.nft?.fields;
      const name = nft?.name ?? 'Unknown Asset';
      const description = nft?.description ?? 'No description available';
      const image = nft?.image_url ?? 'https://via.placeholder.com/300x300?text=No+Image';

      // Parse share coin type from sale type
      const saleType: string = (saleObj as any).data?.type;
      const shareCoinType = saleType ? parseSaleShareCoinType(saleType) : null;

      // Circulating = coin supply from TreasuryCap<T>
      let circulating = 0n;
      try {
        const treasuryId = fields?.vault?.fields?.treasury?.fields?.id?.id as string | undefined;
        if (treasuryId) {
          const treObj = await client.getObject({ id: treasuryId, options: { showContent: true } });
          const tsVal = (treObj as any)?.data?.content?.fields?.total_supply?.fields?.value;
          if (tsVal !== undefined) circulating = BigInt(tsVal);
        }
      } catch {}

      const totalSupplyBig = BigInt(fields?.vault?.fields?.total_supply || 0);
      const totalPriceBig = BigInt(fields?.vault?.fields?.total_price || 0);
      const remaining = totalSupplyBig > circulating ? (totalSupplyBig - circulating) : 0n;

      // Coin symbol via metadata endpoint (best effort)
      let symbol = 'SHARE';
      try {
        if (shareCoinType) {
          const meta = await client.getCoinMetadata({ coinType: shareCoinType });
          if (meta?.symbol) symbol = meta.symbol;
        }
      } catch {}

      const productData = {
        id: route.id!,
        totalSupply: totalSupplyBig,
        totalPrice: totalPriceBig,
        circulating,
        remaining,
        symbol,
        name,
        description,
        image,
        shareCoinType,
      };
      
      return productData;
    },
  });

  // Compute per-asset holdings for current product (sum Coin<T> balances)
  const { data: perAssetHoldings, refetch: refetchHoldings } = useQuery({
    queryKey: ['perAssetHoldings', route.name === 'product' ? route.id : null, account?.address, (product as any)?.shareCoinType],
    enabled: route.name === 'product' && !!route.id && !!account?.address && !!(product as any)?.shareCoinType,
    queryFn: async () => {
      try {
        const shareCoinType = (product as any)?.shareCoinType as string;
        const coins = await client.getCoins({ owner: account!.address, coinType: shareCoinType });
        return coins.data.reduce((sum: bigint, c: any) => sum + BigInt(c.balance), 0n);
      } catch {
        return 0n;
      }
    },
  });

  // ---------- Explore: fetch all sales via events ----------
  async function fetch_nft_list() {
    const ev = await client.queryEvents({
      query: { MoveEventType: `${TEMPLATE_PACKAGE}::template::SaleStarted` },
      order: 'descending',
      limit: 100,
    });
    const saleIds: string[] = ev.data.map((e: any) => e.parsedJson?.sale_id ?? e.parsedJson?.object_id).filter(Boolean);
    const unique = Array.from(new Set(saleIds));
    if (unique.length === 0) return [];

    const sales = await client.multiGetObjects({
      ids: unique,
      options: { showContent: true, showType: true },
    });

    const items = await Promise.all(sales.map(async (sale: any) => {
      const id: string = sale?.data?.objectId;
      const fields: any = sale?.data?.content?.fields;
      const saleType: string = sale?.data?.type;
      const shareCoinType = saleType ? parseSaleShareCoinType(saleType) : null;
      const nft = fields?.vault?.fields?.nft?.fields;
      const totalSupply = BigInt(fields?.vault?.fields?.total_supply || 0);
      const totalPrice = BigInt(fields?.vault?.fields?.total_price || 0);
      const pps = totalSupply > 0n ? totalPrice / totalSupply : 0n;
      let symbol = 'SHARE';
      try { if (shareCoinType) { const meta = await client.getCoinMetadata({ coinType: shareCoinType }); if (meta?.symbol) symbol = meta.symbol; } } catch {}
      return {
        id,
        name: nft?.name || 'Unknown Asset',
        description: nft?.description || '',
        image: nft?.image_url || 'https://via.placeholder.com/300x300?text=No+Image',
        totalSupply,
        totalPrice,
        pps,
        symbol,
        shareCoinType,
      };
    }));

    return items;
  }

  const { data: sales, refetch: refetchSales } = useQuery({
    queryKey: ['sales_v2', TEMPLATE_PACKAGE, route.name],
    enabled: !!TEMPLATE_PACKAGE,
    queryFn: fetch_nft_list,
  });

  // =====================================================================================
  // Admin: create NFT+Coin vault, start & share Sale
  // =====================================================================================
  async function createAssetAndSale() {
    setLastError(null);
    setIsLoading(true);
    setLoadingMessage('Creating asset and sale...');
    
    try {
      if (!account) throw new Error('Connect wallet first.');
      
      // Validate required fields
      if (!symbol || !assetName || !description || !iconUrl) {
        throw new Error('All fields (symbol, name, description, image URL) are required');
      }
      // Resolve coin type and TreasuryCap: prefer defaults in consts, else auto-detect
      let resolvedCoinType = DEFAULT_COIN_TYPE;
      let treasuryId: string | undefined = DEFAULT_TREASURY_CAP_ID || undefined;
      if (!resolvedCoinType || !treasuryId) {
        setLoadingMessage('Resolving coin type and TreasuryCap...');
        const owned = await client.getOwnedObjects({ owner: account.address, options: { showType: true } });
        if (!resolvedCoinType) {
          const anyCap = owned.data.find((o: any) => typeof (o.data as any)?.type === 'string' && (o.data as any).type.startsWith('0x2::coin::TreasuryCap<'));
          if (!anyCap) throw new Error('No TreasuryCap found in your wallet. Please publish a coin and hold its TreasuryCap.');
          const t = (anyCap.data as any).type as string;
          const m = t.match(/^0x2::coin::TreasuryCap<(.+)>$/);
          if (!m) throw new Error('Failed to parse TreasuryCap type.');
          resolvedCoinType = m[1];
        }
        if (!treasuryId) {
          const targetType = `0x2::coin::TreasuryCap<${resolvedCoinType}>`;
          const cap = owned.data.find((o: any) => (o.data as any)?.type === targetType);
          if (!cap || !cap.data || !('objectId' in cap.data)) throw new Error(`TreasuryCap not found in your wallet for ${resolvedCoinType}.`);
          treasuryId = (cap.data as any).objectId as string;
        }
      }
      
      const enc = new TextEncoder();
      const _totalSupply = BigInt(totalSupply || '0');
      const _totalPrice = BigInt(totalPrice || '0');
      if (_totalSupply <= 0n) throw new Error('Total supply must be > 0.');

      setLoadingMessage('Building transaction...');
      
      // Debug logging
      console.log('Creating asset with:', {
        symbol,
        assetName,
        description,
        iconUrl,
        totalSupply: _totalSupply,
        totalPrice: _totalPrice
      });
      
      const tx = new Transaction();

      // Resolve PlatformCap (owned) and Registry (shared) for the current TEMPLATE_PACKAGE
      let platformCapId = PLATFORM_CAP_ID;
      try {
        const owned = await client.getOwnedObjects({ owner: account.address, options: { showType: true } });
        const exactType = `${TEMPLATE_PACKAGE}::template::PlatformCap`;
        const match = owned.data.find((o: any) => (o.data as any)?.type === exactType);
        if (match && (match.data as any)?.objectId) platformCapId = (match.data as any).objectId;
      } catch {}

      // Registry is no longer required in start_sale

      // Create asset -> Vault<T>
      let vault;
      try {
        vault = tx.moveCall({
          target: `${TEMPLATE_PACKAGE}::template::create_new_asset`,
          typeArguments: [resolvedCoinType],
          arguments: [
            tx.object(platformCapId),
            tx.pure.u64(_totalSupply),
            tx.pure.u64(_totalPrice),
            tx.pure.vector('u8', enc.encode(symbol)),
            tx.pure.string(assetName),
            tx.pure.string(description),
            tx.pure.string(iconUrl),
            tx.pure.bool(false),
            tx.object(treasuryId),
          ],
        }) as unknown as any;
      } catch (moveCallError) {
        console.error('Move call error:', moveCallError);
        throw new Error(`Failed to create move call: ${moveCallError}`);
      }

      // Start sale (indexes in registry)
      const sale = tx.moveCall({
        target: `${TEMPLATE_PACKAGE}::template::start_sale`,
        typeArguments: [resolvedCoinType],
        arguments: [
          vault,
          tx.pure.u64(_totalSupply),
          tx.pure.u64(_totalPrice),
          tx.pure.address(account.address),
        ],
      }) as unknown as any;
      // Share the Sale object
      tx.moveCall({ target: `${TEMPLATE_PACKAGE}::template::share_sale`, typeArguments: [resolvedCoinType], arguments: [sale] });

      setLoadingMessage('Executing transaction...');
      // Set explicit gas budget to avoid dry-run budget inference issues
      try { (tx as any).setGasBudget?.(100000000); } catch {}
      let res;
      try {
        res = await signAndExecute({ transaction: tx, chain: 'sui:testnet' });
      } catch (execError) {
        console.error('Transaction execution error:', execError);
        throw new Error(`Transaction execution failed: ${execError}`);
      }
      
      setLoadingMessage('Waiting for transaction confirmation...');
      let full;
      try {
        full = await client.waitForTransaction({ digest: res.digest, options: { showObjectChanges: true } });
      } catch (waitError) {
        console.error('Transaction wait error:', waitError);
        throw new Error(`Transaction confirmation failed: ${waitError}`);
      }
      
      // Store debug data
      setDebugData({
        transaction: res,
        objectChanges: full.objectChanges,
        effects: full.effects,
        timestamp: new Date().toISOString()
      });
      
      // Find the created Sale ID
      const oc = (full.objectChanges || []) as any[];
      const createdSale = oc.find((c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.includes('::template::Sale<'));
      
      if (createdSale?.objectId) setSaleId(createdSale.objectId);
      
      setLoadingMessage('Refreshing data...');
      await refreshAllData();
      
      setLoadingMessage('Success!');
      setTimeout(() => setIsLoading(false), 1000);
      alert(`Asset created. Sale shared. Sale ID: ${createdSale?.objectId || 'unknown'}`);
    } catch (e) { 
      setIsLoading(false);
      setLastError(e instanceof Error ? e.message : String(e));
      console.error('Create Asset Error:', e);
    }
  }

  // =====================================================================================
  // Admin: publish per-asset coin template (2-step flow)
  // =====================================================================================
  async function publishCoinTemplate(autoProceed: boolean) {
    setLastError(null);
    setIsLoading(true);
    setLoadingMessage('Publishing coin template...');
    try {
      if (!account) throw new Error('Connect wallet first.');

      // Lazy import coin bytecode
      // Expecting a file generated by: sui move build --dump-bytecode-as-base64 > src/coin_template.json
      const coinDataMod = await import('./coin_template.json');
      const coinData: any = (coinDataMod as any).default ?? coinDataMod;
      const modules: string[] = coinData.modules as string[]; // dump-bytecode-as-base64 yields base64 strings
      const dependencies: string[] = coinData.dependencies as string[];
      if (!modules?.length || !dependencies?.length) throw new Error('coin_template.json missing modules/dependencies.');

      const tx = new Transaction();
      const [upgradeCap] = tx.publish({ modules, dependencies });
      // Prevent UnusedValueWithoutDrop: explicitly transfer the UpgradeCap back to sender
      tx.transferObjects([upgradeCap], tx.pure.address(account.address));
      try { (tx as any).setGasBudget?.(30_000_000); } catch {}
      const res = await signAndExecute({ transaction: tx, chain: 'sui:testnet' });
      const full = await client.waitForTransaction({ digest: res.digest, options: { showObjectChanges: true } });

      // Parse new package id
      const oc = (full.objectChanges || []) as any[];
      const published = oc.find((c) => c.type === 'published');
      const pkgId = published?.packageId as string | undefined;
      if (!pkgId) throw new Error('Publish succeeded but packageId not found.');

      // Find TreasuryCap
      const tre = oc.find((c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.startsWith(`0x2::coin::TreasuryCap<${pkgId}::coin_template::COIN_TEMPLATE>`));
      const treId = tre?.objectId as string | undefined;
      if (!treId) throw new Error('TreasuryCap not found in publish effects.');

      const cType = `${pkgId}::coin_template::COIN_TEMPLATE`;
      setDebugData({ publishDigest: res.digest, packageId: pkgId, treasuryCapId: treId });
      setLoadingMessage('Coin published.');

      if (autoProceed) {
        // proceed to create sale using the freshly published coin
        await createAssetAndSaleWithOverrides(cType, treId);
      } else {
        setIsLoading(false);
        alert(`Coin published. Package: ${pkgId}`);
      }
    } catch (e) {
      setIsLoading(false);
      setLastError(e instanceof Error ? e.message : String(e));
      console.error('Publish Coin Error:', e);
    }
  }

  async function createAssetAndSaleWithOverrides(cType: string, treId: string) {
    await createAssetAndSaleInternal(cType, treId);
  }

  async function createAssetAndSaleInternal(resolvedCoinTypeParam?: string, treasuryIdParam?: string) {
    // Internal variant of createAssetAndSale using explicit overrides
    setLastError(null);
    setIsLoading(true);
    setLoadingMessage('Creating asset and sale...');
    try {
      if (!account) throw new Error('Connect wallet first.');
      if (!symbol || !assetName || !description || !iconUrl) {
        throw new Error('All fields (symbol, name, description, image URL) are required');
      }

      const resolvedCoinType = resolvedCoinTypeParam!;
      const treasuryId = treasuryIdParam!;
      if (!resolvedCoinType || !treasuryId) throw new Error('Missing coin overrides.');

      const enc = new TextEncoder();
      const _totalSupply = BigInt(totalSupply || '0');
      const _totalPrice = BigInt(totalPrice || '0');
      if (_totalSupply <= 0n) throw new Error('Total supply must be > 0.');

      const tx = new Transaction();

      // Resolve PlatformCap for current package
      let platformCapId = PLATFORM_CAP_ID;
      try {
        const owned = await client.getOwnedObjects({ owner: account.address, options: { showType: true } });
        const exactType = `${TEMPLATE_PACKAGE}::template::PlatformCap`;
        const match = owned.data.find((o: any) => (o.data as any)?.type === exactType);
        if (match && (match.data as any)?.objectId) platformCapId = (match.data as any).objectId;
      } catch {}

      const vault = tx.moveCall({
        target: `${TEMPLATE_PACKAGE}::template::create_new_asset`,
        typeArguments: [resolvedCoinType],
        arguments: [
          tx.object(platformCapId),
          tx.pure.u64(_totalSupply),
          tx.pure.u64(_totalPrice),
          tx.pure.vector('u8', enc.encode(symbol)),
          tx.pure.string(assetName),
          tx.pure.string(description),
          tx.pure.string(iconUrl),
          tx.pure.bool(false),
          tx.object(treasuryId),
        ],
      }) as unknown as any;

      const sale = tx.moveCall({
        target: `${TEMPLATE_PACKAGE}::template::start_sale`,
        typeArguments: [resolvedCoinType],
        arguments: [
          vault,
          tx.pure.u64(_totalSupply),
          tx.pure.u64(_totalPrice),
          tx.pure.address(account.address),
        ],
      }) as unknown as any;

      tx.moveCall({ target: `${TEMPLATE_PACKAGE}::template::share_sale`, typeArguments: [resolvedCoinType], arguments: [sale] });

      try { (tx as any).setGasBudget?.(100000000); } catch {}
      const res = await signAndExecute({ transaction: tx, chain: 'sui:testnet' });
      const full = await client.waitForTransaction({ digest: res.digest, options: { showObjectChanges: true } });
      const oc = (full.objectChanges || []) as any[];
      const createdSale = oc.find((c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.includes('::template::Sale<'));
      if (createdSale?.objectId) setSaleId(createdSale.objectId);
      setIsLoading(false);
      alert(`Asset created. Sale shared. Sale ID: ${createdSale?.objectId || 'unknown'}`);
    } catch (e) {
      setIsLoading(false);
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }

  // =====================================================================================
  // Product: buy from Sale (now uses USDC)
  // =====================================================================================
  async function buyFromSale(id: string) {
    setLastError(null);
    setIsLoading(true);
    setLoadingMessage('Processing purchase...');
    
    try {
      if (!account) throw new Error('Connect wallet first.');
      const amt = BigInt(buyAmount || '0');
      if (amt <= 0n) throw new Error('Amount must be > 0.');

      setLoadingMessage('Loading sale details...');
      // Load sale to compute pps
      const saleObj = await client.getObject({ id, options: { showContent: true, showType: true } });
      const fields: any = (saleObj as any).data?.content?.fields;
      const totalSupply = BigInt(fields.total_supply);
      const totalPrice = BigInt(fields.total_price);
      if (totalSupply <= 0n) throw new Error('Invalid total supply');
      const pps = totalPrice / totalSupply;
      // Determine share coin type from sale type
      const saleType: string = (saleObj as any)?.data?.type;
      const shareCoinType = saleType ? parseSaleShareCoinType(saleType) : null;
      if (!shareCoinType) throw new Error('Cannot determine share coin type from sale.');
      const cost = pps * amt;

      setLoadingMessage('Finding USDC coins...');
      // Get USDC coins from wallet
      const usdcCoins = await client.getCoins({
        owner: account.address,
        coinType: USDC_TYPE,
      });
      
      if (usdcCoins.data.length === 0) {
        throw new Error('No USDC coins found in wallet. Please get some USDC first.');
      }
      
      // Find sufficient USDC balance
      let totalBalance = 0n;
      const coinsToUse: string[] = [];
      for (const coin of usdcCoins.data) {
        totalBalance += BigInt(coin.balance);
        coinsToUse.push(coin.coinObjectId);
        if (totalBalance >= cost) break;
      }
      
      if (totalBalance < cost) {
        throw new Error(`Insufficient USDC balance. Need ${cost}, have ${totalBalance}`);
      }

      setLoadingMessage('Building transaction...');
      const tx = new Transaction();
      
      // Merge USDC coins if needed and split the exact amount
      let usdcCoin;
      if (coinsToUse.length === 1) {
        usdcCoin = tx.object(coinsToUse[0]);
      } else {
        usdcCoin = tx.object(coinsToUse[0]);
        if (coinsToUse.length > 1) {
          tx.mergeCoins(usdcCoin, coinsToUse.slice(1).map(id => tx.object(id)));
        }
      }
      
      const [pay] = tx.splitCoins(usdcCoin, [tx.pure.u64(cost)]);
      
      const [shares, change] = tx.moveCall({
        target: `${TEMPLATE_PACKAGE}::template::buy`,
        typeArguments: [USDC_TYPE, shareCoinType],
        arguments: [tx.object(id), tx.pure.u64(amt), pay],
      }) as unknown as [any, any];
      
      tx.transferObjects([change, shares], tx.pure.address(account.address));
      // Transfer remaining USDC back to user
      tx.transferObjects([usdcCoin], tx.pure.address(account.address));

      setLoadingMessage('Executing purchase...');
      const res = await signAndExecute({ transaction: tx, chain: 'sui:testnet' });
      await client.waitForTransaction({ digest: res.digest });
      
      setLoadingMessage('Refreshing data...');
      await refreshAllData();
      
      setLoadingMessage('Success!');
      setTimeout(() => setIsLoading(false), 1000);
      alert('Tokens purchased with USDC.');
    } catch (e) { 
      setIsLoading(false);
      setLastError(e instanceof Error ? e.message : String(e));
      console.error('Buy Error:', e);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '40px auto', fontFamily: 'Poppins, system-ui, ui-sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Galerie</h2>
        <div className="row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="#/explore" style={{ fontSize: 14 }}>Explore</a>
          <a href="#/admin" style={{ fontSize: 14 }}>Admin</a>
          <button 
            onClick={() => setDebugMode(!debugMode)}
            style={{ 
              fontSize: 12, 
              padding: '4px 8px', 
              background: debugMode ? '#dc2626' : '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            {debugMode ? '🔍 Debug ON' : '🔍 Debug OFF'}
          </button>
        </div>
        <ConnectButton />
      </header>

      {/* Admin Page */}
      {route.name === 'admin' && (
        <section className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Create asset & start sale</h3>
          <div className="grid" style={{ marginTop: 8 }}>
            <Field label="Total supply"><input type="number" min={1} value={totalSupply} onChange={(e) => setTotalSupply(e.target.value)} /></Field>
            <Field label="Total price ($)"><input type="number" min={0} step="0.01" value={(Number(totalPrice) / 1_000_000).toString()} onChange={(e) => setTotalPrice((Number(e.target.value) * 1_000_000).toString())} /></Field>
            <Field label="Symbol (ASCII)"><input value={symbol} onChange={(e) => setSymbol(e.target.value)} /></Field>
            <Field label="Name"><input value={assetName} onChange={(e) => setAssetName(e.target.value)} /></Field>
            <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field label="Image URL"><input value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} /></Field>
            {/* Coin type and TreasuryCap resolved automatically */}
            <div className="row" style={{ gap: 12 }}>
              <button 
                onClick={() => publishCoinTemplate(false)}
                disabled={!account || isLoading}
                style={{ background: isLoading ? '#6b7280' : '#10b981', color: 'white', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: isLoading ? 'not-allowed' : 'pointer' }}
              >
                {isLoading ? '⏳ Publishing...' : 'Publish Coin Template'}
              </button>
              <button 
                onClick={async () => {
                  setLastError(null);
                  try {
                    const coinDataMod = await import('./coin_template.json');
                    const coinData: any = (coinDataMod as any).default ?? coinDataMod;
                    if (!coinData?.modules?.length) { alert('coin_template.json missing. Build first.'); return; }
                    await publishCoinTemplate(true);
                  } catch (e) {
                    setLastError(e instanceof Error ? e.message : String(e));
                  }
                }}
                disabled={!account || isLoading}
                style={{ background: isLoading ? '#6b7280' : '#2563eb', color: 'white', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: isLoading ? 'not-allowed' : 'pointer' }}
              >
                {isLoading ? '⏳ Auto Flow...' : 'Publish Coin + Create Sale'}
              </button>
            </div>
            <div className="row">
              <button 
                onClick={createAssetAndSale} 
                disabled={!account || isLoading}
                style={{ 
                  background: isLoading ? '#6b7280' : '#3b82f6',
                  cursor: isLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {isLoading ? '⏳ Processing...' : 'Create & Share Sale'}
              </button>
            </div>
            {isLoading && <LoadingSpinner message={loadingMessage} />}
            {saleId && (<div className="nft-meta">Last Sale ID: <code>{saleId}</code></div>)}
            <ErrorPanel error={lastError} />
            <DebugPanel title="Transaction Debug Data" data={debugData} isVisible={debugMode} />
          </div>
        </section>
      )}

      {/* Explore Page */}
      {route.name === 'explore' && (
        <section className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Sales</h3>
          {!sales ? (
            <p>Loading…</p>
          ) : (sales as any[]).length === 0 ? (
            <p>No sales found.</p>
          ) : (
            <div className="nft-list">
              {(sales as any[]).map((s: any) => {
                const id = s.id as string;
                const saleName = s.name as string;
                const saleSymbol = s.symbol as string;
                const saleImage = s.image as string;
                const pps = formatUSDC(s.pps as bigint);
                return (
                  <div key={id} className="nft-row" onClick={() => { window.location.hash = `#/product/${id}`; }} style={{ cursor: 'pointer' }}>
                    <div className="nft-thumb-wrap">
                      <img className="nft-thumb" src={saleImage} alt={saleSymbol} onError={(e)=>{(e.target as HTMLImageElement).style.display='none';}} />
                    </div>
                    <div className="nft-row-main">
                      <div className="nft-row-title">{saleName}</div>
                      <div className="nft-row-id">{id}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="nft-row-meta">Price/share</div>
                      <div><strong>{pps}</strong></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Product Page */}
      {route.name === 'product' && (
        <section className="card" style={{ marginTop: 14 }}>
          <div className="row" style={{ alignItems: 'stretch' }}>
            <div style={{ width: 380 }}>
              <div className="nft-img-wrap" style={{ height: 380 }}>
                <img className="nft-img" src={product?.image} alt={product?.name || 'Asset'} onError={(e)=>{(e.target as HTMLImageElement).style.display='none';}} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ marginTop: 0 }}>{product?.name}</h3>
              <div className="nft-meta" style={{ marginBottom: 8 }}>{product?.symbol}</div>
              <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{product?.description}</p>

              <div className="row" style={{ gap: 24, margin: '10px 0' }}>
                <div>
                  <div className="nft-row-meta">Sale ID</div>
                  <div className="nft-row-id">{product?.id || route.id}</div>
                </div>
                <div>
                  <div className="nft-row-meta">Total supply</div>
                  <div><strong>{product ? product.totalSupply.toString() : '-'}</strong></div>
                </div>
                <div>
                  <div className="nft-row-meta">Circulating</div>
                  <div><strong>{product ? product.circulating?.toString() : '-'}</strong></div>
                </div>
                <div>
                  <div className="nft-row-meta">Remaining shares</div>
                  <div><strong>{product ? product.remaining?.toString() : '-'}</strong></div>
                </div>
                <div>
                  <div className="nft-row-meta">Total price</div>
                  <div><strong>{product ? formatUSDC(product.totalPrice) : '-'}</strong></div>
                </div>
                <div>
                  <div className="nft-row-meta">Price/share</div>
                  <div><strong>{product ? formatUSDC(product.totalPrice / product.totalSupply) : '-'}</strong></div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 8 }}>
                <div className="grid" style={{ gap: 10 }}>
                  <Field label="Amount of shares"><input type="number" min={1} value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} /></Field>
                  <div className="nft-meta" style={{ marginBottom: 8 }}>
                    Total cost for {buyAmount} shares: <strong>{product ? formatUSDC((product.totalPrice / product.totalSupply) * BigInt(buyAmount || '0')) : '-'}</strong>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                     <div className="nft-meta">You hold for this asset: <strong>{perAssetHoldings === undefined ? '...' : perAssetHoldings.toString()}</strong> shares</div>
                    <button 
                      onClick={() => buyFromSale(route.id!)} 
                      disabled={!account || !route.id || isLoading}
                      style={{ 
                        background: isLoading ? '#6b7280' : '#3b82f6',
                        cursor: isLoading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isLoading ? '⏳ Processing...' : 'Buy shares'}
                    </button>
                  </div>
                </div>
                {isLoading && <LoadingSpinner message={loadingMessage} />}
                <DebugPanel title="Product Debug Data" data={{ product, perAssetHoldings }} isVisible={debugMode} />
              </div>
            </div>
          </div>
        </section>
      )}

      <ErrorPanel error={lastError} />
    </div>
  );
}

