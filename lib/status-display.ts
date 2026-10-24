import type { BadgeVariant } from "@/components/ui/badge";

export type StatusDomain = "transaction" | "subsidy";

export type StatusDisplay = {
  label: string;
  variant: BadgeVariant;
  description: string;
};

export const TRANSACTION_STATUS_DISPLAY = {
  pending: {
    label: "受付中",
    variant: "warning",
    description: "申請が提出され、確認待ちの状態です",
  },
  accepted: {
    label: "受付済",
    variant: "info",
    description: "担当者が申請を受理しました",
  },
  approved: {
    label: "承認済",
    variant: "success",
    description: "申請内容が承認され、次の処理へ進みます",
  },
  rejected: {
    label: "却下",
    variant: "danger",
    description: "申請が却下されました",
  },
  receipt_received: {
    label: "領収書受領済",
    variant: "success",
    description: "領収書の提出が確認されました",
  },
  refunded: {
    label: "処理済(確定)",
    variant: "neutral",
    description: "支払処理が確定しました",
  },
  received: {
    label: "受領済",
    variant: "neutral",
    description: "金額の受領が完了しました",
  },
} as const satisfies Record<string, StatusDisplay>;

export const SUBSIDY_STATUS_DISPLAY = {
  pending: {
    label: "受付中",
    variant: "warning",
    description: "申請が提出され、確認待ちの状態です",
  },
  accounting_received: {
    label: "受付済",
    variant: "info",
    description: "担当者が申請を受理しました",
  },
  approved: {
    label: "審査通過",
    variant: "success",
    description: "支援金の審査を通過しました",
  },
  rejected: {
    label: "却下",
    variant: "danger",
    description: "申請が却下されました",
  },
  application_in_progress: {
    label: "申請中",
    variant: "info",
    description: "申請の準備または確認が進行中です",
  },
  application_rejected: {
    label: "申請拒否",
    variant: "danger",
    description: "申請内容の不備等により拒否されました",
  },
  receipt_submitted: {
    label: "領収書提出済",
    variant: "success",
    description: "審査を通過し、領収書が提出されました",
  },
  receipt_received: {
    label: "領収書受領済",
    variant: "success",
    description: "領収書の提出が確認されました",
  },
  paid: {
    label: "受領済",
    variant: "neutral",
    description: "金額の受領が完了しました",
  },
  unexecuted: {
    label: "未執行",
    variant: "neutral",
    description: "まだ執行処理が行われていません",
  },
} as const satisfies Record<string, StatusDisplay>;

const STATUS_DISPLAY_BY_DOMAIN = {
  transaction: TRANSACTION_STATUS_DISPLAY,
  subsidy: SUBSIDY_STATUS_DISPLAY,
} as const;

export function getStatusDisplay(
  domain: StatusDomain,
  status: string,
): StatusDisplay {
  const display = STATUS_DISPLAY_BY_DOMAIN[domain][
    status as keyof (typeof STATUS_DISPLAY_BY_DOMAIN)[typeof domain]
  ];

  return display ?? {
    label: status,
    variant: "neutral",
    description: "ステータス情報",
  };
}

export function getStatusOptions(
  domain: StatusDomain,
): Array<{ value: string } & StatusDisplay> {
  return Object.entries(STATUS_DISPLAY_BY_DOMAIN[domain]).map(
    ([value, display]) => ({ value, ...display }),
  );
}
