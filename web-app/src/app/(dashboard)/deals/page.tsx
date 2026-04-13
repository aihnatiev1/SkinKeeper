'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { useDeals } from '@/lib/hooks';
import { useFormatPrice, getItemIconUrl } from '@/lib/utils';
import { TrendingUp, ExternalLink, ArrowRight, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { EcosystemTip } from '@/components/ecosystem-tip';

const SOURCE_COLORS: Record<string, string> = {
  buff: 'text-orange-400',
  csfloat: 'text-blue-400',
  skinport: 'text-pink-400',
  dmarket: 'text-green-400',
  bitskins: 'text-yellow-400',
  csmoney: 'text-red-400',
  youpin: 'text-purple-400',
  lisskins: 'text-cyan-400',
};

export default function DealsPage() {
  const formatPrice = useFormatPrice();
  const [minProfit, setMinProfit] = useState(5);
  const [limit, setLimit] = useState(50);
  const { data, isLoading } = useDeals(minProfit, limit);

  const deals = data?.deals ?? [];

  return (
    <div>
      <Header title="Deals" />
      <div className="p-4 lg:p-6 space-y-4">
        <EcosystemTip
          id="deals-extension"
          icon="💰"
          message="See arbitrage opportunities inline on Steam Market pages with our browser extension."
          ctaText="Install Extension"
          ctaUrl="https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd"
        />
        {/* Info banner */}
        <div className="glass rounded-xl p-4 flex items-start gap-3 border border-primary/20">
          <TrendingUp size={20} className="text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Arbitrage Opportunities</p>
            <p className="text-xs text-muted mt-0.5">
              Items where buying on an external marketplace and selling on Steam is profitable.
              Profit is calculated after Steam&apos;s 15% commission.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 glass rounded-xl px-3 py-2">
            <SlidersHorizontal size={14} className="text-muted" />
            <label className="text-xs text-muted">Min profit:</label>
            <select
              value={minProfit}
              onChange={(e) => setMinProfit(Number(e.target.value))}
              className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
            >
              <option value={2}>2%</option>
              <option value={5}>5%</option>
              <option value={10}>10%</option>
              <option value={15}>15%</option>
              <option value={20}>20%</option>
            </select>
          </div>
          <div className="flex items-center gap-2 glass rounded-xl px-3 py-2">
            <label className="text-xs text-muted">Show:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <span className="text-xs text-muted ml-auto">{deals.length} deals found</span>
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader />
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <TrendingUp size={48} className="mb-3 opacity-30" />
            <p className="text-sm">No profitable deals found</p>
            <p className="text-xs mt-1">Try lowering the minimum profit threshold</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {deals.map((deal, idx) => (
              <div
                key={`${deal.marketHashName}-${deal.buySource}-${idx}`}
                className="glass rounded-xl border border-border/30 overflow-hidden hover:border-border/60 transition-colors"
              >
                {/* Item header */}
                <div className="flex items-center gap-3 p-4 pb-3">
                  {deal.iconUrl && (
                    <img
                      src={getItemIconUrl(deal.iconUrl)}
                      alt=""
                      className="w-14 h-10 object-contain shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{deal.marketHashName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-xs font-medium capitalize ${SOURCE_COLORS[deal.buySource] || 'text-muted'}`}>
                        {deal.buySource}
                      </span>
                      <ArrowRight size={10} className="text-muted" />
                      <span className="text-xs font-medium text-foreground">Steam</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-profit">+{deal.profitPct}%</p>
                    <p className="text-xs text-profit">+{formatPrice(deal.profitUsd)}</p>
                  </div>
                </div>

                {/* Price breakdown */}
                <div className={`grid ${deal.buffBidPrice ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-px bg-border/20`}>
                  <div className="glass p-2 sm:p-2.5 text-center">
                    <p className="text-[10px] text-muted">Buy ({deal.buySource})</p>
                    <p className="text-xs sm:text-sm font-semibold">{formatPrice(deal.buyPrice)}</p>
                  </div>
                  <div className="glass p-2 sm:p-2.5 text-center">
                    <p className="text-[10px] text-muted">Steam</p>
                    <p className="text-xs sm:text-sm font-semibold">{formatPrice(deal.sellPrice)}</p>
                    <p className="text-[9px] text-muted">
                      {deal.sellPrice > 0 ? `${Math.round((deal.buyPrice / deal.sellPrice) * 100)}%` : '—'}
                    </p>
                  </div>
                  {deal.buffBidPrice && (
                    <div className="glass p-2.5 text-center">
                      <p className="text-[10px] text-muted">Buff Bid</p>
                      <p className="text-sm font-semibold text-orange-400">{formatPrice(deal.buffBidPrice)}</p>
                    </div>
                  )}
                  <div className="glass p-2.5 text-center">
                    <p className="text-[10px] text-muted">You Get</p>
                    <p className="text-sm font-semibold text-profit">
                      {formatPrice(deal.sellPrice * 0.85)}
                    </p>
                  </div>
                </div>

                {/* Action links */}
                <div className="flex gap-2 p-3 pt-2">
                  {deal.buyUrl && (
                    <a
                      href={deal.buyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      Buy on {deal.buySource} <ExternalLink size={10} />
                    </a>
                  )}
                  <a
                    href={`https://steamcommunity.com/market/listings/730/${encodeURIComponent(deal.marketHashName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
                  >
                    Steam <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
