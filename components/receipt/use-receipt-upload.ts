"use client";

import { useState, useSyncExternalStore } from "react";
import { createReceiptUploadController } from "@/lib/receipt-upload-controller";

export function useReceiptUpload() {
  const [controller] = useState(createReceiptUploadController);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return {
    ...state,
    setFile: controller.setFile,
    upload: controller.upload,
    isUploading: state.status === "preparing" || state.status === "uploading",
  };
}
