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

export type MemberRow = {
  id: string;
  name: string;
  student_number: string;
  grade: number;
  roles: string;
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
        className={`h-3.5 w-3.5 ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}
      />
    </Button>
  );
}

export function MembersTable({ members }: { members: MemberRow[] }) {
  const [sort, setSort] = useState<SortState>(null);
  const [filterName, setFilterName] = useState("");
  const [filterStudentNumber, setFilterStudentNumber] = useState("");
  const [filterGrade, setFilterGrade] = useState<string>("all");

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
                  {g}年
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell className="tabular-nums">
                  {member.student_number}
                </TableCell>
                <TableCell>
                  {member.grade === 0 ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    member.grade
                  )}
                </TableCell>
                <TableCell>{member.roles}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="text-xs text-muted-foreground">
        {sorted.length} / {members.length} 件表示
      </div>
    </div>
  );
}
