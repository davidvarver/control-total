export type Channel = "mercado_libre" | "amazon" | "tiktok" | "manual";

export type WarehouseType =
  | "own"
  | "mercado_libre_full"
  | "amazon_fba"
  | "tiktok_fulfillment"
  | "third_party"
  | "returns"
  | "damaged"
  | "transit";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "grace"
  | "suspended"
  | "cancelled";

export type LockMode = "none" | "read_only" | "full_lock";

export type MasterProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  targetInventoryDays: number;
};

export type OnlineSku = {
  id: string;
  sku: string;
  title: string;
  channel: Channel;
  marketplaceAccountId: string;
  components: SkuComponent[];
  safetyBufferUnits: number;
};

export type SkuComponent = {
  masterProductId: string;
  quantityRequired: number;
};

export type Warehouse = {
  id: string;
  name: string;
  type: WarehouseType;
  channel?: Channel;
  isSellable: boolean;
  isExclusive: boolean;
};

export type InventoryBalance = {
  masterProductId: string;
  warehouseId: string;
  physicalQuantity: number;
  reservedQuantity: number;
  blockedQuantity: number;
};

export type SaleChargeType =
  | "marketplace_commission"
  | "shipping"
  | "fulfillment"
  | "advertising"
  | "promotion"
  | "financing"
  | "packaging"
  | "storage"
  | "return_cost"
  | "other";

export type SaleCharge = {
  type: SaleChargeType;
  amount: number;
};

export type SaleItem = {
  onlineSkuId: string;
  quantity: number;
  unitPrice: number;
};

export type SaleOrder = {
  id: string;
  channel: Channel;
  marketplaceAccountId: string;
  orderedAt: string;
  items: SaleItem[];
  charges: SaleCharge[];
};

export type ProductCost = {
  masterProductId: string;
  averageUnitCost: number;
};

export type Subscription = {
  status: SubscriptionStatus;
  expiresAt: string;
  graceDays: number;
  lockMode: LockMode;
  manualOverrideUntil?: string;
};

export type ProductInventorySummary = {
  masterProductId: string;
  physicalQuantity: number;
  reservedQuantity: number;
  blockedQuantity: number;
  availableQuantity: number;
};

export type ProductDemandSummary = {
  masterProductId: string;
  soldUnits: number;
  averageDailyUnits: number;
  daysRemaining: number | null;
  suggestedPurchaseQuantity: number;
};

export type SaleProfitSummary = {
  grossAmount: number;
  productCost: number;
  totalCharges: number;
  netProfit: number;
  marginPercent: number;
};
