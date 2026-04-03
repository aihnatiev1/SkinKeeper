'use client';

import { useState, useEffect } from 'react';
import { Package, ChevronRight, ArrowDown, ArrowUp, Search, Loader2, RefreshCw } from 'lucide-react';
import { useIsDesktop, useStorageUnits, useSteamStatus } from '@/lib/use-desktop';
import { useRouter } from 'next/navigation';
import { InventoryPicker } from '@/components/inventory-picker';
import { toast } from 'sonner';

export default function StorageUnitsPage() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { status } = useSteamStatus();
  const { units, loading, fetchUnits, getContents, moveToUnit, moveFromUnit } = useStorageUnits();
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [unitContents, setUnitContents] = useState<any[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !desktop) {
      router.replace('/portfolio');
    }
  }, [desktop, router]);

  useEffect(() => {
    if (desktop && status.loggedIn) {
      fetchUnits();
    }
  }, [desktop, status.loggedIn, fetchUnits]);

  const handleSelectUnit = async (casketId: string) => {
    setSelectedUnit(casketId);
    setSelectedItems(new Set());
    setLoadingContents(true);
    const contents = await getContents(casketId);
    setUnitContents(contents);
    setLoadingContents(false);
  };

  const handleRefreshContents = async () => {
    if (!selectedUnit) return;
    setLoadingContents(true);
    const contents = await getContents(selectedUnit);
    setUnitContents(contents);
    setLoadingContents(false);
  };

  // Move items FROM inventory TO storage unit
  const handleMoveToUnit = (items: any[]) => {
    if (!selectedUnit) return;
    const itemIds = items.map((i) => i.id);
    setMoving(true);
    moveToUnit(itemIds, selectedUnit).then((result) => {
      setMoving(false);
      if (result.success) {
        toast.success(`Moved ${result.moved} item(s) to storage unit`);
        handleRefreshContents();
      } else {
        toast.error('Failed to move items');
      }
    });
  };

  // Move selected items FROM storage unit TO inventory
  const handleMoveFromUnit = async () => {
    if (!selectedUnit || selectedItems.size === 0) return;
    const itemIds = Array.from(selectedItems);
    setMoving(true);
    const result = await moveFromUnit(itemIds, selectedUnit);
    setMoving(false);
    if (result.success) {
      toast.success(`Moved ${result.moved} item(s) to inventory`);
      setSelectedItems(new Set());
      handleRefreshContents();
    } else {
      toast.error('Failed to move items');
    }
  };

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!desktop) return null;

  if (!status.loggedIn) {
    return (
      <div className="p-6">
        <div className="glass rounded-2xl p-12 text-center">
          <Package size={48} className="mx-auto mb-4 text-muted" />
          <h2 className="text-xl font-bold mb-2">Steam Connection Required</h2>
          <p className="text-muted">Connect to Steam in Settings to manage storage units.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Storage Units</h1>
          <p className="text-muted text-sm mt-1">
            Manage your CS2 storage units — move items in and out without launching the game.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Units list */}
        <div className="glass rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-border/50">
            <h3 className="text-sm font-semibold text-muted">
              Storage Units ({units.length})
            </h3>
            <button
              onClick={fetchUnits}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted" />
            </div>
          ) : units.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">No storage units found</p>
          ) : (
            units.map((unit: any) => (
              <button
                key={unit.id}
                onClick={() => handleSelectUnit(unit.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                  selectedUnit === unit.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-surface-light text-foreground'
                }`}
              >
                <Package size={20} className="shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{unit.name || 'Storage Unit'}</p>
                  <p className="text-xs text-muted">{unit.item_count || 0} items</p>
                </div>
                <ChevronRight size={16} className="text-muted" />
              </button>
            ))
          )}
        </div>

        {/* Unit contents */}
        <div className="lg:col-span-2 glass rounded-2xl p-4">
          {selectedUnit ? (
            <>
              <div className="flex items-center gap-3 pb-3 border-b border-border/50">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search items..."
                    className="w-full pl-9 pr-4 py-2 bg-surface-light rounded-xl text-sm border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <button
                  onClick={() => setPickerOpen(true)}
                  disabled={moving}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
                >
                  <ArrowDown size={16} />
                  Deposit
                </button>
                <button
                  onClick={handleMoveFromUnit}
                  disabled={selectedItems.size === 0 || moving}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
                >
                  {moving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowUp size={16} />
                  )}
                  Withdraw{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
                </button>
              </div>

              {loadingContents ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 size={24} className="animate-spin text-muted" />
                </div>
              ) : unitContents.length === 0 ? (
                <div className="text-center py-24 text-muted">
                  <Package size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">This storage unit is empty</p>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="mt-3 text-xs text-primary hover:text-primary-hover font-medium"
                  >
                    Deposit items from inventory
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-3 max-h-[600px] overflow-y-auto">
                  {unitContents
                    .filter((item: any) =>
                      !search || item.name?.toLowerCase().includes(search.toLowerCase())
                    )
                    .map((item: any) => {
                      const isSelected = selectedItems.has(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          className={`group relative p-3 rounded-xl transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 ring-2 ring-primary'
                              : 'bg-surface-light hover:bg-surface-light/80'
                          }`}
                        >
                          <img
                            src={`https://community.akamai.steamstatic.com/economy/image/${item.icon_url}/128x128`}
                            alt={item.name}
                            className="w-full aspect-square object-contain"
                          />
                          <p className="text-xs font-medium mt-2 truncate">{item.name}</p>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[300px] text-muted">
              <div className="text-center">
                <Package size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">Select a storage unit to view its contents</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inventory Picker for depositing */}
      <InventoryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleMoveToUnit}
        maxItems={50}
        excludeIds={unitContents.map((i: any) => i.id)}
        title="Select Items to Deposit"
      />
    </div>
  );
}
