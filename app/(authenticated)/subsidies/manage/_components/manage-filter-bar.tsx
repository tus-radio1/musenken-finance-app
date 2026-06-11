"use client";

/**
 * 支援金管理画面: フィルタバー
 * 検索・カテゴリ・期・申請者・状況・ソートの操作UIを提供する。
 */

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpDown, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_VARIANT_MAP as STATUS_MAP } from "@/lib/constants/subsidy";
import type { SortKey, SortOrder } from "./types";

type Profile = { id: string; name: string };

type ManageFilterBarProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedTerm: string;
  onTermChange: (term: string) => void;
  selectedApplicant: string;
  onApplicantChange: (applicant: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSortToggle: (key: SortKey) => void;
  profiles: Profile[];
};

export function ManageFilterBar({
  searchQuery,
  onSearchQueryChange,
  selectedCategory,
  onCategoryChange,
  selectedTerm,
  onTermChange,
  selectedApplicant,
  onApplicantChange,
  selectedStatus,
  onStatusChange,
  sortKey,
  sortOrder,
  onSortToggle,
  profiles,
}: ManageFilterBarProps) {
  return (
    <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="項目名で検索..."
          className="pl-9"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-end flex-wrap">
        <div className="w-full sm:w-auto space-y-1">
          <label className="text-sm font-medium">カテゴリ</label>
          <Tabs
            value={selectedCategory}
            onValueChange={onCategoryChange}
            className="w-full sm:w-64"
          >
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="all">すべて</TabsTrigger>
              <TabsTrigger value="activity">活動</TabsTrigger>
              <TabsTrigger value="league">連盟</TabsTrigger>
              <TabsTrigger value="special">特別</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="w-full sm:w-36 space-y-1">
          <label className="text-sm font-medium">期</label>
          <Select value={selectedTerm} onValueChange={onTermChange}>
            <SelectTrigger>
              <SelectValue placeholder="すべての期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての期</SelectItem>
              <SelectItem value="1">第1期</SelectItem>
              <SelectItem value="2">第2期</SelectItem>
              <SelectItem value="3">第3期</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-40 space-y-1">
          <label className="text-sm font-medium">申請者</label>
          <Select value={selectedApplicant} onValueChange={onApplicantChange}>
            <SelectTrigger>
              <SelectValue placeholder="すべての申請者" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての申請者</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-40 space-y-1">
          <label className="text-sm font-medium">状況</label>
          <Select value={selectedStatus} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="すべての状況" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての状況</SelectItem>
              {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1">
          <Button
            variant={sortKey === "created_at" ? "secondary" : "ghost"}
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => onSortToggle("created_at")}
          >
            申請日
            <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
            {sortKey === "created_at" && (
              <span className="ml-0.5 text-[10px]">
                {sortOrder === "asc" ? "↑" : "↓"}
              </span>
            )}
          </Button>
          <Button
            variant={sortKey === "requested_amount" ? "secondary" : "ghost"}
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => onSortToggle("requested_amount")}
          >
            申請額
            <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
            {sortKey === "requested_amount" && (
              <span className="ml-0.5 text-[10px]">
                {sortOrder === "asc" ? "↑" : "↓"}
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
