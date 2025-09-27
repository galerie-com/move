// src/App.tsx
import React, { useMemo, useState, useEffect } from 'react';
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { BASE_PACKAGE, TEMPLATE_PACKAGE, OTW_TYPE, PLATFORM_CAP_ID, USDC_TYPE } from './const';

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

  // ---------- Derived types ----------
  // Removed unused computed types

  // ---------- Sanity: base objects (debug) ----------
  // Removed unused base object queries

  // ---------- List owned TokenizedAssets (for holdings display) ----------
  // Do not rely on exact BASE_PACKAGE for the outer type address.
  // Instead, fetch owned objects and filter by the type suffix that encodes the template OTW.
  const tokenizedAssetTypeSuffix = useMemo(() => {
    if (TEMPLATE_PACKAGE.includes('<')) return '';
    return `::tokenized_asset::TokenizedAsset<${TEMPLATE_PACKAGE}::template::${OTW_TYPE}>`;
  }, []);

  const { data: myAssets, refetch: refetchAssets } = useQuery({
    queryKey: ['myAssets', account?.address, tokenizedAssetTypeSuffix, route.name], // Add route to trigger refetch on navigation
    enabled: !!account && !!tokenizedAssetTypeSuffix,
    queryFn: async () => {
      const res = await client.getOwnedObjects({
        owner: account!.address,
        options: { showContent: true, showType: true, showOwner: true },
      });
      
      // Filter to TokenizedAsset<...OTW> regardless of base package address
      const filtered = res.data.filter((o: any) => {
        const t: string | undefined = o.data?.type;
        return typeof t === 'string' && t.endsWith(tokenizedAssetTypeSuffix);
      });
      
      
      return filtered;
    },
  });

  // ---------- Dev helpers: expose to window for console debugging ----------
  useEffect(() => {
    try {
      (window as any).client = client;
      (window as any).TEMPLATE_PACKAGE = TEMPLATE_PACKAGE;
      (window as any).OTW_TYPE = OTW_TYPE;
    } catch {}
  }, [client]);
  useEffect(() => {
    try { (window as any).myAssets = myAssets; } catch {}
  }, [myAssets]);

  // ---------- Helpers ----------
  // Convert USDC units to dollars (assuming 6 decimals like standard USDC)
  function formatUSDC(amount: bigint): string {
    const dollars = Number(amount) / 1_000_000; // USDC has 6 decimals
    return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  }

  // Refresh all data queries
  async function refreshAllData() {
    try {
      await Promise.all([
        refetchAssets(),
        refetchSales(),
        route.name === 'product' && route.id ? refetchProduct() : Promise.resolve(),
        route.name === 'product' && route.id ? refetchHoldings() : Promise.resolve(),
      ]);
    } catch (e) {
      console.warn('Some data refresh failed:', e);
    }
  }

  async function resolveSaleMetadata(client: ReturnType<typeof useSuiClient>, saleObj: any): Promise<any | null> {
    try {
      const fields: any = saleObj?.data?.content?.fields;
      if (!fields) return null;

      // Infer AssetMetadata type from the embedded AssetCap type
      const capTypeStr: string | undefined = fields?.cap?.type;
      const innerDyn = typeof capTypeStr === 'string' ? (capTypeStr.match(/AssetCap<([^>]+)>/)?.[1]) : undefined;
      const metaTypeDyn = innerDyn ? `${BASE_PACKAGE}::tokenized_asset::AssetMetadata<${innerDyn}>` : undefined;

      // 1) Try sale creation tx (works before any mutations like buy)
      const prevTx = (saleObj as any).data?.previousTransaction as string | undefined;
      if (prevTx) {
        const txb = await client.getTransactionBlock({ digest: prevTx, options: { showObjectChanges: true } });
        const oc = (txb.objectChanges || []) as any[];
        let createdMeta = undefined as any;
        if (metaTypeDyn) {
          createdMeta = oc.find((c: any) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType === metaTypeDyn);
        }
        if (!createdMeta && innerDyn) {
          createdMeta = oc.find((c: any) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.includes('AssetMetadata<') && c.objectType.endsWith(`<${innerDyn}>`));
        }
        if (createdMeta) {
          return await client.getObject({ id: createdMeta.objectId, options: { showContent: true } });
        }
      }

      // 2) Try the AssetCap's creation tx (robust even after sale mutations)
      const capId = fields?.cap?.fields?.id?.id as string | undefined;
      if (capId) {
        const capObj = await client.getObject({ id: capId, options: { showPreviousTransaction: true } });
        const capPrevTx = (capObj as any)?.data?.previousTransaction as string | undefined;
        if (capPrevTx) {
          const txb = await client.getTransactionBlock({ digest: capPrevTx, options: { showObjectChanges: true } });
          const oc = (txb.objectChanges || []) as any[];
          let createdMeta = undefined as any;
          if (metaTypeDyn) {
            createdMeta = oc.find((c: any) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType === metaTypeDyn);
          }
          if (!createdMeta && innerDyn) {
            createdMeta = oc.find((c: any) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.includes('AssetMetadata<') && c.objectType.endsWith(`<${innerDyn}>`));
          }
          if (createdMeta) {
            return await client.getObject({ id: createdMeta.objectId, options: { showContent: true } });
          }
        }
      }

      // 3) Fallback: scan recent txs affecting the cap to find the creation
      if (capId) {
        const txs = await client.queryTransactionBlocks({ filter: { ChangedObject: capId }, options: { showObjectChanges: true }, limit: 50 });
        for (const entry of txs.data as any[]) {
          const oc = (entry.objectChanges || []) as any[];
          const capCreated = oc.find((c: any) => c.type === 'created' && c.objectId === capId);
          if (capCreated) {
            let createdMeta = undefined as any;
            if (metaTypeDyn) {
              createdMeta = oc.find((c: any) => c.type === 'created' && c.objectType === metaTypeDyn);
            }
            if (!createdMeta && innerDyn) {
              createdMeta = oc.find((c: any) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.includes('AssetMetadata<') && c.objectType.endsWith(`<${innerDyn}>`));
            }
            if (createdMeta) {
              return await client.getObject({ id: createdMeta.objectId, options: { showContent: true } });
            }
            break;
          }
        }
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  function assetBalance(o: any): bigint {
    try {
      const fields = o?.data?.content?.fields;
      const bal = fields?.balance;
      // Balance may be serialized directly as a string/number under fields.balance
      if (typeof bal === 'string' || typeof bal === 'number' || typeof bal === 'bigint') {
        return BigInt(bal as any);
      }
      const val = bal?.fields?.value ?? bal?.value;
      if (val !== undefined) return BigInt(val);
      return 0n;
    } catch { return 0n; }
  }

  // ---------- Fetch details for current product (sale + metadata) ----------
  const { data: product, refetch: refetchProduct } = useQuery({
    queryKey: ['product', route.name === 'product' ? route.id : null],
    enabled: route.name === 'product' && !!route.id,
    queryFn: async () => {
      const saleObj = await client.getObject({ id: route.id!, options: { showContent: true, showPreviousTransaction: true } });
      const fields: any = (saleObj as any).data?.content?.fields;

      // Removed generic logs in product view
      
      // Prefer direct meta_id on Sale if present; fallback to robust resolver
      let metadata: any | null = null;
      const saleMetaId = fields?.meta_id as string | undefined;
      if (saleMetaId) {
        try { metadata = await client.getObject({ id: saleMetaId, options: { showContent: true } }); } catch {}
      }
      if (!metadata) {
        metadata = await resolveSaleMetadata(client, saleObj);
      }
      
      // Derive circulating from cap.supply if present
      let circulating = 0n;
      try {
        const sup = fields?.cap?.fields?.supply;
        const val = sup?.fields?.value ?? sup?.value;
        if (val !== undefined) circulating = BigInt(val);
      } catch {}
      
      const totalSupplyBig = BigInt(fields?.total_supply || 0);
      const totalPriceBig = BigInt(fields?.total_price || 0);
      const remaining = totalSupplyBig > circulating ? (totalSupplyBig - circulating) : 0n;
      
      // Use metadata if available, otherwise show placeholder values
      const metadataFields = metadata?.data?.content && 'fields' in metadata.data.content ? metadata.data.content.fields as any : null;
      
      // Removed generic logs in product view

      // Compute expected TokenizedAsset type suffix for this sale's asset
      const capTypeStr: string | undefined = fields?.cap?.type;
      const innerType = typeof capTypeStr === 'string' ? (capTypeStr.match(/AssetCap<([^>]+)>/)?.[1]) : undefined;
      const expectedSuffix = innerType ? `::tokenized_asset::TokenizedAsset<${innerType}>` : undefined;
      
      // Removed generic logs in product view
      
      const productData = {
        id: route.id!,
        totalSupply: totalSupplyBig,
        totalPrice: totalPriceBig,
        circulating,
        remaining,
        symbol: metadataFields?.symbol ?? 'UNK',
        name: metadataFields?.name ?? 'Unknown Asset',
        description: metadataFields?.description ?? 'No description available',
        image: metadataFields?.icon_url ?? 'https://via.placeholder.com/300x300?text=No+Image',
        expectedSuffix,
        saleCapId: fields?.cap?.fields?.id?.id, // The AssetCap object ID for this specific sale
      };
      
      return productData;
    },
  });

  // Compute per-asset holdings for current product (track by specific AssetCap)
  const { data: perAssetHoldings, refetch: refetchHoldings } = useQuery({
    queryKey: ['perAssetHoldings', route.name === 'product' ? route.id : null, account?.address, (product as any)?.saleCapId],
    enabled: route.name === 'product' && !!route.id && !!account?.address && !!(product as any)?.saleCapId,
    queryFn: async () => {
      try {
        const saleCapId = (product as any)?.saleCapId;
        const expectedSuffix = (product as any)?.expectedSuffix as string | undefined;
        if (!saleCapId) return 0n;

        const owned = await client.getOwnedObjects({ 
          owner: account!.address, 
          options: { showType: true, showContent: true, showPreviousTransaction: true } 
        });
        const tokenizedAssets = owned.data.filter((o: any) => {
          const type = o?.data?.type;
          if (typeof type !== 'string') return false;
          if (!type.includes('::tokenized_asset::TokenizedAsset<')) return false;
          return expectedSuffix ? type.endsWith(expectedSuffix) : true;
        });
        
        let totalBalance = 0n;
        for (const asset of tokenizedAssets) {
          try {
            const txDigest = asset.data?.previousTransaction;
            if (!txDigest) continue;
            const tx = await client.getTransactionBlock({ digest: txDigest, options: { showObjectChanges: true } });
            const createdObjects = tx.objectChanges?.filter((change: any) => change.type === 'created') || [];
            const mutatedObjects = tx.objectChanges?.filter((change: any) => change.type === 'mutated') || [];
            const assetCreated = createdObjects.find((obj: any) => obj.objectId === asset.data?.objectId);
            if (assetCreated) {
              const changes = [...createdObjects, ...mutatedObjects];
              const matchCap = !!changes.find((obj: any) => obj.objectId === saleCapId);
              const matchSale = !!changes.find((obj: any) => obj.objectId === (product as any)?.id);
              if (matchCap || matchSale) {
                totalBalance += assetBalance(asset);
              }
            }
          } catch {}
        }
        return totalBalance;
      } catch {
        return 0n;
      }
    },
  });

  // ---------- Explore: fetch all sales via events ----------
  const { data: sales, refetch: refetchSales } = useQuery({
    queryKey: ['sales', TEMPLATE_PACKAGE, route.name], // Add route to trigger refetch on navigation
    enabled: !!TEMPLATE_PACKAGE,
    queryFn: async () => {
      const ev = await client.queryEvents({
        query: { MoveEventType: `${TEMPLATE_PACKAGE}::template::SaleStarted` },
        order: 'descending',
        limit: 100,
      });
      
      const saleIds = ev.data.map((e: any) => e.parsedJson?.sale_id ?? e.parsedJson?.object_id).filter(Boolean);
      const unique = Array.from(new Set(saleIds));
      
      // Fetch sale objects (including previousTransaction) and resolve metadata per-sale robustly
      const details = await Promise.all(unique.map(async (id: unknown) => {
        return await client.getObject({ id: String(id), options: { showContent: true, showPreviousTransaction: true } });
      }));

      const salesWithMetadata = await Promise.all(details.map(async (sale: any) => {
        const fields = sale?.data?.content?.fields as any;
        const metaId = fields?.meta_id as string | undefined;
        let metaObj: any = null;
        if (metaId) {
          try { metaObj = await client.getObject({ id: metaId, options: { showContent: true } }); } catch {}
        }
        if (!metaObj) {
          metaObj = await resolveSaleMetadata(client, sale);
        }
        return { ...sale, metadata: metaObj };
      }));

      // ---- DEBUG LOGS (Explore only): print ALL Sale objects & ALL TokenizedAssets for this template ----
      try {
        // Log all Sale objects with full content
        const saleSummaries = salesWithMetadata.map((s: any) => ({
          id: s?.data?.objectId,
          type: s?.data?.type,
          fields: s?.data?.content?.fields,
        }));
        console.groupCollapsed('Explore Debug: ALL SALES');
        console.log(saleSummaries);
        console.groupEnd();

        // Find recent TokenizedAssets created via template::buy
        const buyTxs = await client.queryTransactionBlocks({
          filter: { MoveFunction: { package: TEMPLATE_PACKAGE, module: 'template', function: 'buy' } },
          options: { showObjectChanges: true, showInput: true },
          limit: 100,
        });

        const tokenizedSuffix = `::tokenized_asset::TokenizedAsset<${TEMPLATE_PACKAGE}::template::${OTW_TYPE}>`;
        const createdTaIds = new Set<string>();
        const saleIdSet = new Set<string>(saleSummaries.map((s: any) => String(s.id)));
        const saleCapIdSet = new Set<string>(saleSummaries.map((s: any) => String(s.fields?.cap?.fields?.id?.id)).filter(Boolean));
        const linking: Record<string, { by: 'sale' | 'cap' | 'unknown'; created: string[]; mutated: string[]; tx: string }[]> = {};
        for (const tx of buyTxs.data as any[]) {
          const created = (tx.objectChanges || []).filter((c: any) => c.type === 'created' && typeof c.objectType === 'string');
          for (const c of created) {
            if (typeof c.objectType === 'string' && c.objectType.endsWith(tokenizedSuffix)) {
              createdTaIds.add(c.objectId);
            }
          }
          const mutated = (tx.objectChanges || []).filter((c: any) => c.type === 'mutated');
          const mutatedIds = mutated.map((m: any) => m.objectId);
          const saleMatches = mutatedIds.filter((id: string) => saleIdSet.has(id));
          const capMatches = mutatedIds.filter((id: string) => saleCapIdSet.has(id));
          const createdInTx = created
            .filter((c: any) => typeof c.objectType === 'string' && c.objectType.endsWith(tokenizedSuffix))
            .map((c: any) => c.objectId);
          const key = saleMatches[0] || capMatches[0] || 'unknown';
          const mode: 'sale' | 'cap' | 'unknown' = saleMatches.length > 0 ? 'sale' : (capMatches.length > 0 ? 'cap' : 'unknown');
          if (!linking[key]) linking[key] = [];
          linking[key].push({ by: mode, created: createdInTx, mutated: mutatedIds, tx: String(tx.digest || '') });
        }

        const taIds = Array.from(createdTaIds);
        const taObjs = taIds.length > 0 ? await client.multiGetObjects({ ids: taIds, options: { showContent: true, showType: true, showPreviousTransaction: true } }) : [];
        console.groupCollapsed('Explore Debug: ALL TokenizedAssets (recent buys)');
        console.log({ count: taObjs.length, objects: taObjs });
        console.groupEnd();

        // Print mapping attempts of Sale/Cap -> created TokenizedAssets per transaction
        console.groupCollapsed('Explore Debug: BUY LINKING (Sale/Cap to Created TokenizedAssets)');
        console.log(linking);
        console.groupEnd();
      } catch {}
      
      return salesWithMetadata;
    },
  });

  // =====================================================================================
  // Admin: create asset (cap+meta), mint 1/1 NFT, start & share Sale
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

      // Create asset -> (AssetCap, AssetMetadata)
      let cap, meta;
      try {
        [cap, meta] = tx.moveCall({
          target: `${TEMPLATE_PACKAGE}::template::create_new_asset`,
          arguments: [
            tx.object(PLATFORM_CAP_ID),
            tx.pure.u64(_totalSupply),
            tx.pure.u64(_totalPrice),
            tx.pure.vector('u8', enc.encode(symbol)),
            tx.pure.string(assetName),
            tx.pure.string(description),
            tx.pure.string(iconUrl),
            tx.pure.bool(false),
          ],
        }) as unknown as [any, any];
      } catch (moveCallError) {
        console.error('Move call error:', moveCallError);
        throw new Error(`Failed to create move call: ${moveCallError}`);
      }

      // Start sale first (pass metadata by reference so Sale stores meta_id)
      const sale = tx.moveCall({
        target: `${TEMPLATE_PACKAGE}::template::start_sale`,
        arguments: [
          cap,
          meta,
          tx.pure.u64(_totalSupply),
          tx.pure.u64(_totalPrice),
          tx.pure.address(account.address),
        ],
      }) as unknown as any;
      // Share the Sale object
      tx.moveCall({ target: `${TEMPLATE_PACKAGE}::template::share_sale`, arguments: [sale] });
      // Share the AssetMetadata after it has been used by start_sale
      tx.moveCall({
        target: `0x2::transfer::public_share_object`,
        typeArguments: [`${BASE_PACKAGE}::tokenized_asset::AssetMetadata<${TEMPLATE_PACKAGE}::template::${OTW_TYPE}>`],
        arguments: [meta],
      });

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
      const saleObj = await client.getObject({ id, options: { showContent: true } });
      const fields: any = (saleObj as any).data?.content?.fields;
      const totalSupply = BigInt(fields.total_supply);
      const totalPrice = BigInt(fields.total_price);
      if (totalSupply <= 0n) throw new Error('Invalid total supply');
      const pps = totalPrice / totalSupply;
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
      
      const [fts, change] = tx.moveCall({
        target: `${TEMPLATE_PACKAGE}::template::buy`,
        typeArguments: [USDC_TYPE],
        arguments: [tx.object(id), tx.pure.u64(amt), pay],
      }) as unknown as [any, any];
      
      tx.transferObjects([change, fts], tx.pure.address(account.address));
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
                const id = s.data?.objectId as string;
                const fields: any = s.data?.content?.fields;
                const metadata = s.metadata;
                
                
                // Use metadata if available, otherwise show placeholder values
                const metadataFields = metadata?.data?.content && 'fields' in metadata.data.content ? metadata.data.content.fields as any : null;
                const saleName = metadataFields?.name || 'Unknown Asset';
                const saleSymbol = metadataFields?.symbol || 'UNK';
                const saleImage = metadataFields?.icon_url || 'https://via.placeholder.com/300x300?text=No+Image';
                const pps = formatUSDC(BigInt(fields?.total_price || 0) / BigInt(fields?.total_supply || 1));
                
                
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

