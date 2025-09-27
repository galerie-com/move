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
import { TEMPLATE_PACKAGE, PLATFORM_CAP_ID, USDC_TYPE } from './const';

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
  const [, setLastError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLoadingMessage] = useState('');
  

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

  const [totalSupply, setTotalSupply] = useState('1000');
  const [totalPrice, setTotalPrice] = useState('50000');
  const [symbol, setSymbol] = useState('STAR');
  const [assetName, setAssetName] = useState('The Starry Night Digital Edition');
  const [description, setDescription] = useState('Vincent van Gogh\'s mesmerizing masterpiece depicting a swirling night sky over Saint-Rémy, now available for fractional ownership in the digital realm');
  const [iconUrl, setIconUrl] = useState('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg');
  const [buyAmount, setBuyAmount] = useState('1');
  const [saleId, setSaleId] = useState('');

  function parseSaleShareCoinType(saleType: string): string | null {
    const m = saleType.match(/::template::Sale<(.+)>$/);
    return m ? m[1] : null;
  }

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
    }
  }
  
  // ---------- Fetch details for current product (sale + NFT + coin data) ----------
  const { data: product, refetch: refetchProduct } = useQuery({
    queryKey: ['product', route.name === 'product' ? route.id : null],
    enabled: route.name === 'product' && !!route.id,
    queryFn: async () => {
      const saleObj = await client.getObject({ id: route.id!, options: { showContent: true, showType: true, showPreviousTransaction: true } });
      const fields: any = (saleObj as any).data?.content?.fields;
      // Read NFT data from vault
      const nft = fields?.vault?.fields?.nft?.fields;
      const name = nft?.name ?? 'Unknown Asset';
      const description = nft?.description ?? 'No description available';
      const image = nft?.image_url ?? 'https://via.placeholder.com/300x300?text=No+Image';

      // Parse share coin type from sale type
      const saleType: string = (saleObj as any).data?.type;
      const shareCoinType = saleType ? parseSaleShareCoinType(saleType) : null;

      // Get token info: circulating supply and decimals
      let circulating = 0n;
      let shareDecimals = 0;
      
      if (shareCoinType) {
        try {
          // Get coin metadata (decimals, symbol, etc.)
          const meta = await client.getCoinMetadata({ coinType: shareCoinType });
          shareDecimals = meta?.decimals ?? 0;
          
          // Get actual circulating supply
          const supplyResult = await client.getTotalSupply({ coinType: shareCoinType });
          circulating = BigInt(supplyResult?.value ?? '0');
          
        } catch (error) {
          // Fallback: derive circulating supply from ShareBought events for this sale
          try {
            const ev = await client.queryEvents({
              query: { MoveEventType: `${TEMPLATE_PACKAGE}::template::ShareBought` },
              order: 'descending',
              limit: 1000,
            });
            const minted = ev.data
              .filter((e: any) => {
                const sid = e.parsedJson?.sale_id ?? e.parsedJson?.object_id;
                return sid === route.id;
              })
              .reduce((sum: bigint, e: any) => sum + BigInt(e.parsedJson?.amount ?? 0), 0n);
            circulating = minted;
          } catch (eventFallbackError) {
          }
        }
      } else {
      }

      const totalSupplyBig = BigInt(fields?.vault?.fields?.total_supply || 0);
      const totalPriceBig = BigInt(fields?.vault?.fields?.total_price || 0);
      const scale = 10n ** BigInt(shareDecimals);
      const circulatingShares = circulating / scale;
      const remaining = totalSupplyBig > circulatingShares ? (totalSupplyBig - circulatingShares) : 0n;

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
        remaining,
        symbol,
        name,
        description,
        image,
        shareCoinType,
        shareDecimals,
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
  async function fetchNftList() {
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
    queryFn: fetchNftList,
  });


  // =====================================================================================
  // Admin: publish per-asset coin template (2-step flow)
  // =====================================================================================
  async function updateCoinMetadata(pkgId: string, treId: string, metaId: string) {
    if (!account) throw new Error('Connect wallet first.');
    const tx = new Transaction();
    const enc = new TextEncoder();
    tx.moveCall({
      target: `${pkgId}::coin_template::update_all_metadata`,
      arguments: [
        tx.object(treId),
        tx.object(metaId),
        tx.pure.vector('u8', enc.encode(symbol || '')),
        tx.pure.string(assetName || ''),
        tx.pure.string(description || ''),
        tx.pure.string(iconUrl || ''),
      ],
    });
    try { (tx as any).setGasBudget?.(10_000_000); } catch {}
    const res = await signAndExecute({ transaction: tx, chain: 'sui:testnet' });
    await client.waitForTransaction({ digest: res.digest });
  }

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

      // Find TreasuryCap and CoinMetadata
      const tre = oc.find((c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.startsWith(`0x2::coin::TreasuryCap<${pkgId}::coin_template::COIN_TEMPLATE>`));
      const treId = tre?.objectId as string | undefined;
      const meta = oc.find((c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.startsWith(`0x2::coin::CoinMetadata<${pkgId}::coin_template::COIN_TEMPLATE>`));
      const metaId = meta?.objectId as string | undefined;
      if (!treId || !metaId) throw new Error('TreasuryCap or CoinMetadata not found in publish effects.');

      const cType = `${pkgId}::coin_template::COIN_TEMPLATE`;
      setLoadingMessage('Coin published. Updating metadata...');

      // Update coin metadata with current form inputs (symbol/name/description/icon)
      await updateCoinMetadata(pkgId, treId, metaId);
      setLoadingMessage('Coin metadata updated.');

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
      const vfields: any = fields?.vault?.fields;
      const totalSupply = BigInt(vfields?.total_supply ?? 0);
      const totalPrice = BigInt(vfields?.total_price ?? 0);
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
      
      const [pay] = tx.splitCoins(usdcCoin, [tx.pure.u64(Number(cost))]);
      
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
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '40px auto', fontFamily: 'Poppins, system-ui, ui-sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Galerie</h2>
        <div className="row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="#/explore" style={{ fontSize: 14 }}>Explore</a>
          <a href="#/admin" style={{ fontSize: 14 }}>Admin</a>
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
            {saleId && (<div className="nft-meta">Last Sale ID: <code>{saleId}</code></div>)}
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

              <div className="row" style={{ display: 'flex', gap: 24, margin: '10px 0', flexWrap: 'wrap' }}>
                <div>
                  <div className="nft-row-meta">Sale ID</div>
                  <div className="nft-row-id">{product?.id || route.id}</div>
                </div>
                <div style={{ flexBasis: '100%' }} />
                <div>
                  <div className="nft-row-meta">Total supply</div>
                  <div><strong>{product ? product.totalSupply.toString() : '-'}</strong></div>
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
                
              </div>
            </div>
          </div>
        </section>
      )}

      
    </div>
  );
}

