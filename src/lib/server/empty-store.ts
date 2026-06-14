import type { LocalStore } from "./local-store";

export function createEmptyStore(): LocalStore {
  return {
    version: 1,
    importedAt: new Date(0).toISOString(),
    inventoryBaselineAt: new Date(0).toISOString(),
    organization: {
      id: "org_control_total",
      name: "Control Total",
    },
    warehouses: [
      {
        id: "wh_main",
        name: "Mi Bodega",
        type: "own",
        channel: null,
        isSellable: true,
        isExclusive: false,
      },
      {
        id: "wh_full",
        name: "Full",
        type: "mercado_libre_full",
        channel: "mercado_libre",
        isSellable: true,
        isExclusive: true,
      },
      {
        id: "wh_returns",
        name: "Devoluciones",
        type: "returns",
        channel: null,
        isSellable: false,
        isExclusive: false,
      },
    ],
    products: [],
    onlineSkus: [],
    marketplaceAccounts: [],
    marketplaceOrders: [],
    integrationEvents: [],
    sales: [],
    inventoryBalances: [],
    inventoryMovements: [],
    fullInventoryLayers: [],
    fullBillingCharges: [],
    costSkuMappings: [],
    ignoredCostSkus: [],
    dismissedRareChargeAlerts: [],
    archivedUnmappedSkus: [],
    dismissedFullAuditAlerts: [],
    pendingCostImports: [],
    operatingExpenses: [],
  };
}
