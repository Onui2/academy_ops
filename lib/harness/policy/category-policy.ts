import type { RequestCategory } from "@/types/request";

export const categoryPolicyMap: Record<
  RequestCategory,
  {
    requiredFields: string[];
  }
> = {
  equipment: { requiredFields: ["requestItem", "quantity", "requestedDate"] },
  as: { requiredFields: ["issueMessage", "currentModel", "location"] },
  nas: { requiredFields: ["userEmail", "folderName", "permissionLevel"] },
  tablet: { requiredFields: ["requestedDate", "rentalEndDate", "userName"] },
  other: { requiredFields: ["detail"] },
  software: { requiredFields: ["title", "detail"] },
  network: { requiredFields: ["title", "location", "detail"] },
  parts: { requiredFields: ["requestItem", "quantity", "requestedDate"] }
};
