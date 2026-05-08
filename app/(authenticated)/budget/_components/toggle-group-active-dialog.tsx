"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleAccountingGroupActive } from "../actions";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";

type GroupItem = {
  id: string;
  name: string;
  isActive: boolean;
};

interface ToggleGroupActiveDialogProps {
  groups: GroupItem[];
}

export function ToggleGroupActiveDialog({
  groups,
}: ToggleGroupActiveDialogProps) {
  const [open, setOpen] = useState(false);
  const [localGroups, setLocalGroups] = useState<GroupItem[]>(groups);
  const [isPending, startTransition] = useTransition();
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLocalGroups(groups);
      setError(null);
    }
  };

  const handleToggle = (groupId: string, currentIsActive: boolean) => {
    const newIsActive = !currentIsActive;
    setError(null);
    setPendingGroupId(groupId);

    startTransition(async () => {
      const result = await toggleAccountingGroupActive(groupId, newIsActive);
      setPendingGroupId(null);

      if (result.error) {
        setError(result.error);
      } else {
        setLocalGroups((prev) =>
          prev.map((g) =>
            g.id === groupId ? { ...g, isActive: newIsActive } : g,
          ),
        );
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Power className="h-4 w-4 mr-1.5" />
          グループ有効/無効
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>グループの有効/無効切り替え</DialogTitle>
          <DialogDescription>
            会計グループの有効・無効状態を切り替えます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {localGroups.map((group) => {
            const isThisPending = isPending && pendingGroupId === group.id;
            return (
              <div
                key={group.id}
                className="flex items-center justify-between py-2 px-3 rounded-md border"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{group.name}</span>
                  {group.isActive ? (
                    <Badge variant="default">有効</Badge>
                  ) : (
                    <Badge variant="outline">無効</Badge>
                  )}
                </div>
                <Button
                  variant={group.isActive ? "outline" : "default"}
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleToggle(group.id, group.isActive)}
                >
                  {isThisPending
                    ? "処理中..."
                    : group.isActive
                      ? "無効にする"
                      : "有効にする"}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
