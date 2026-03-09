"use client";

import { Plus } from "lucide-react";
import { TransactionForm } from "@/components/transaction-form";
import { useState } from "react";

export function MobileNewTransactionFab({ categories }: { categories: any[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-5 md:bottom-5 md:hidden z-40">
      <TransactionForm
        categories={categories}
        open={open}
        onOpenChange={setOpen}
        triggerButton={
          <button className="h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center text-3xl">
            <Plus className="h-6 w-6" />
          </button>
        }
      />
    </div>
  );
}
