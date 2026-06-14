const maxExcelUploadBytes = 10 * 1024 * 1024;
const allowedExcelExtensions = [".xlsx", ".xls"];

export function validateExcelUpload(file: File) {
  if (file.size > maxExcelUploadBytes) {
    throw new Error("El archivo Excel no puede pesar mas de 10 MB.");
  }

  const name = file.name.trim().toLowerCase();
  if (!allowedExcelExtensions.some((extension) => name.endsWith(extension))) {
    throw new Error("El archivo debe ser .xlsx o .xls.");
  }
}
