import { prisma } from "../src/lib/server/prisma";
import { listOrganizationStores } from "../src/lib/server/local-store";

async function main() {
  let updated = 0;
  const stores = await listOrganizationStores();

  for (const { organizationId, store } of stores) {
    const rows = store.marketplaceOrders.map((order) => ({
      id: order.id,
      payload: order,
    }));

    for (const chunk of chunkRows(rows, 100)) {
      const values = chunk
        .map(
          (row) =>
            `('${escapeSql(row.id)}', '${escapeSql(JSON.stringify(row.payload))}'::jsonb)`,
        )
        .join(", ");

      if (!values) {
        continue;
      }

      await prisma.$executeRawUnsafe(`
        UPDATE "SaleOrder" AS s
        SET "payload" = v.payload
        FROM (VALUES ${values}) AS v(id, payload)
        WHERE s."organizationId" = '${escapeSql(organizationId)}'
          AND s."id" = v.id
      `);
      updated += chunk.length;
    }
  }

  console.log(JSON.stringify({ ok: true, organizations: stores.length, updated }, null, 2));
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function escapeSql(value: string) {
  return value.replace(/'/g, "''");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
