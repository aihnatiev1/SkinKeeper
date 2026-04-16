'use client';

import { Header } from '@/components/header';
import { ExtensionGate } from '@/components/extension-gate';
import { ArrowLeftRight, Package } from 'lucide-react';

export default function StorageUnitsPage() {
  return (
    <ExtensionGate>
      <div>
        <Header title="Storage Units" />
        <div className="p-4 lg:p-6">
          <div className="glass rounded-xl p-12 border border-border/50 text-center">
            <Package size={40} className="mx-auto mb-4 text-muted" />
            <h3 className="text-lg font-semibold mb-2">Storage Unit Management</h3>
            <p className="text-sm text-muted">
              Manage your CS2 storage units — move items in and out, organize your inventory.
            </p>
          </div>
        </div>
      </div>
    </ExtensionGate>
  );
}
