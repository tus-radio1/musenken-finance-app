"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createReceiptUploadController } from "@/lib/receipt-upload-controller";

export function useReceiptUpload() {
  const [controller] = useState(createReceiptUploadController);
  useEffect(() => () => controller.cancel(), [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return {
    ...state,
    setFile: controller.setFile,
    upload: controller.upload,
    withSubmission: controller.withSubmission,
    isUploading: state.status === "preparing" || state.status === "uploading",
  };
}
