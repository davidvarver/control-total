import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { importInventoryWorkbook } from "../src/lib/server/import-inventory.ts";

const defaultInput = "C:/Users/david/Downloads/INVENTARIO GITA.xlsx";
const inputPath = process.argv[2] ?? defaultInput;
const outputPath =
  process.argv[3] ?? path.join(process.cwd(), "data", "local-store.json");

const store = await importInventoryWorkbook(inputPath);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      outputPath,
      products: store.products.length,
      onlineSkus: store.onlineSkus.length,
      sales: store.sales.length,
      negativeStockProducts: store.products.filter(
        (product) => product.currentStock < 0,
      ).length,
    },
    null,
    2,
  ),
);
