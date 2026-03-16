"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, LogOut, Trash2, KeyRound } from "lucide-react";
import { AddMemberDialog } from "./add-member-dialog";
import { EditMemberDialog, type RoleOption } from "./edit-member-dialog";
import { retireMember, deleteMember, resetPasswordMember } from "../actions";

export type MemberManageRow = {
  id: string;
  name: string;
  student_number: string;
  grade: number;
  role_names: string[];
  role_ids: string[];
};

type ManageMembersClientProps = {
  members: MemberManageRow[];
  allRoles: RoleOption[];
  isAdmin?: boolean;
};

type SortKey = "name" | "student_number" | "grade";
type SortDirection = "asc" | "desc";

type SortState = {
  key: SortKey;
  direction: SortDirection;
} | null;

function SortableHeader({
  label,
  sortKey,
  current,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  current: SortState;
  onToggle: (key: SortKey) => void;
}) {
  const isActive = current?.key === sortKey;
  const Icon = isActive
    ? current.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 gap-1 text-xs font-medium"
      onClick={() => onToggle(sortKey)}
    >
      {label}
      <Icon
        className={`h-3.5 w-3.5 ${
          isActive ? "text-foreground" : "text-muted-foreground/50"
        }`}
      />
    </Button>
  );
}

export function ManageMembersClient({
  members,
  allRoles,
  isAdmin = false,
}: ManageMembersClientProps) {
  const [retireTarget, setRetireTarget] = useState<MemberManageRow | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<MemberManageRow | null>(
    null,
  );
  const [resetTarget, setResetTarget] = useState<MemberManageRow | null>(null);
  const [retireLoading, setRetireLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Filtering & Sorting State
  const [sort, setSort] = useState<SortState>(null);
  const [filterName, setFilterName] = useState("");
  const [filterStudentNumber, setFilterStudentNumber] = useState("");
  const [filterGrade, setFilterGrade] = useState<string>("all");

  const handleRetire = async () => {
    if (!retireTarget) return;
    setRetireLoading(true);
    try {
      const res = await retireMember(retireTarget.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        toast.success(`${retireTarget.name} さんを退部処理しました`);
        setRetireTarget(null);
      }
    } catch {
      toast.error("退部処理に失敗しました");
    } finally {
      setRetireLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await deleteMember(deleteTarget.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        toast.success(`${deleteTarget.name} さんのアカウントを削除しました`);
        setDeleteTarget(null);
      }
    } catch {
      toast.error("削除に失敗しました");
    } finally {
      setDeleteLoading(false);
    }
  };

  const isOBOG = (member: MemberManageRow) => member.grade === 0;

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const res = await resetPasswordMember(resetTarget.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        toast.success(
          `${resetTarget.name} さんのパスワードを初期値にリセットしました`,
        );
        setResetTarget(null);
      }
    } catch {
      toast.error("パスワードリセットに失敗しました");
    } finally {
      setResetLoading(false);
    }
  };

  // Derived state for filtering and sorting
  const grades = useMemo(() => {
    const set = new Set(members.map((m) => m.grade));
    return Array.from(set).sort((a, b) => a - b);
  }, [members]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key === key) {
        if (prev.direction === "asc") return { key, direction: "desc" };
        return null;
      }
      return { key, direction: "asc" };
    });
  };

  const hasActiveFilter =
    filterName || filterStudentNumber || filterGrade !== "all";

  const clearFilters = () => {
    setFilterName("");
    setFilterStudentNumber("");
    setFilterGrade("all");
  };

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (filterName && !m.name.includes(filterName)) return false;
      if (
        filterStudentNumber &&
        !m.student_number.includes(filterStudentNumber)
      )
        return false;
      if (filterGrade !== "all" && m.grade !== Number(filterGrade))
        return false;
      return true;
    });
  }, [members, filterName, filterStudentNumber, filterGrade]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;

    return [...filtered].sort((a, b) => {
      const { key, direction } = sort;
      let cmp = 0;

      if (key === "grade") {
        cmp = a.grade - b.grade;
      } else {
        cmp = (a[key] ?? "").localeCompare(b[key] ?? "", "ja");
      }

      return direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              氏名
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="名前で検索"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                className="h-9 w-44 pl-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              学籍番号
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="学籍番号で検索"
                value={filterStudentNumber}
                onChange={(e) => setFilterStudentNumber(e.target.value)}
                className="h-9 w-44 pl-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              学年
            </label>
            <Select value={filterGrade} onValueChange={setFilterGrade}>
              <SelectTrigger className="h-9 w-28 text-sm">
                <SelectValue placeholder="全学年" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全学年</SelectItem>
                {grades.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {g === 0 ? "OB・OG (-)" : `${g}年`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1 text-xs text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5" />
              フィルタをクリア
            </Button>
          )}
        </div>
        <AddMemberDialog />
      </div>

      {sorted.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border text-sm text-muted-foreground">
          該当する部員が見つかりません
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader
                  label="氏名"
                  sortKey="name"
                  current={sort}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortableHeader
                  label="学籍番号"
                  sortKey="student_number"
                  current={sort}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortableHeader
                  label="学年"
                  sortKey="grade"
                  current={sort}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>役職</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((member) => (
              <TableRow
                key={member.id}
                className={isOBOG(member) ? "opacity-60" : ""}
              >
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell className="tabular-nums">
                  {member.student_number}
                </TableCell>
                <TableCell>
                  {member.grade === 0 ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    `${member.grade}年`
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {member.role_names.length === 0 ? (
                      <span className="text-muted-foreground text-sm">-</span>
                    ) : (
                      member.role_names.map((name) => (
                        <span
                          key={name}
                          className="inline-block rounded bg-muted px-2 py-0.5 text-xs"
                        >
                          {name}
                        </span>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <EditMemberDialog
                      member={{
                        id: member.id,
                        name: member.name,
                        student_number: member.student_number,
                        grade: member.grade,
                        role_ids: member.role_ids,
                      }}
                      allRoles={allRoles}
                    />
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => setResetTarget(member)}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        PWリセット
                      </Button>
                    )}
                    {!isOBOG(member) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        onClick={() => setRetireTarget(member)}
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        退部
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(member)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      削除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="text-xs text-muted-foreground">
        {sorted.length} / {members.length} 件表示
      </div>

      {/* 退部確認ダイアログ */}
      <Dialog
        open={!!retireTarget}
        onOpenChange={(open) => !open && setRetireTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>退部処理の確認</DialogTitle>
            <DialogDescription>
              <strong>{retireTarget?.name}</strong>{" "}
              さんを退部処理します。学年は「-」に変更され、役職は「OB・OG」に変更されます。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRetireTarget(null)}
              disabled={retireLoading}
            >
              キャンセル
            </Button>
            <Button
              variant="default"
              className="bg-orange-600 hover:bg-orange-700"
              onClick={handleRetire}
              disabled={retireLoading}
            >
              {retireLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              退部処理を実行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>アカウント削除の確認</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong>（
              {deleteTarget?.student_number}
              ）のアカウントを完全に削除します。この操作は取り消すことができません。誤って登録されたアカウントのみ削除してください。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteLoading}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              完全に削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* パスワードリセット確認ダイアログ */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>パスワードリセットの確認</DialogTitle>
            <DialogDescription>
              <strong>{resetTarget?.name}</strong>（
              {resetTarget?.student_number}
              ）のパスワードを初期パスワードにリセットします。リセット後、ユーザーは初期パスワードでログインする必要があります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetTarget(null)}
              disabled={resetLoading}
            >
              キャンセル
            </Button>
            <Button
              variant="default"
              onClick={handleResetPassword}
              disabled={resetLoading}
            >
              {resetLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              リセットする
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
