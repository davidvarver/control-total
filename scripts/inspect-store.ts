import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type StorePayload = {
  organization?: { name?: string };
  products?: Array<{
    masterSku?: string;
    averageUnitCost?: number | null;
  }>;
  pendingCostImports?: unknown[];
};

async function main() {
  const stores = await prisma.localDataStore.findMany();
  console.log("Total stores in DB:", stores.length);
  for (const store of stores) {
    const payload = store.payload as StorePayload;
    const pendingCostImports = payload.pendingCostImports ?? [];
    console.log(`Org ID: ${store.organizationId}`);
    console.log(`Org name: ${payload.organization?.name}`);
    console.log(`Products count: ${payload.products?.length ?? 0}`);
    console.log(`Pending cost imports count: ${pendingCostImports.length}`);
    const noCost =
      payload.products?.filter(
        (product) => !product.averageUnitCost || product.averageUnitCost <= 0,
      ) ?? [];
    console.log(`Products without cost: ${noCost.length}`);
    if (noCost.length > 0) {
      console.log(
        `Examples of products without cost (first 5):`,
        noCost.slice(0, 5).map((product) => product.masterSku),
      );
    }
    if (pendingCostImports.length > 0) {
      console.log(`Examples of pending cost imports (first 5):`, pendingCostImports.slice(0, 5));
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
