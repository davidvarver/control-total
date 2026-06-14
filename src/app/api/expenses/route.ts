import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireWritablePermission } from "@/lib/server/auth-store";
import {
  addOperatingExpense,
  deleteOperatingExpense,
  updateOperatingExpense,
} from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const user = await requireWritablePermission("costs.write");

  try {
    const formData = await request.formData();
    const action = String(formData.get("action") ?? "create");

    if (action === "delete") {
      const expense = await deleteOperatingExpense(
        String(formData.get("expenseId") ?? ""),
      );
      await addAuditLog({
        action: "expense.delete",
        entityType: "expense",
        entityId: expense.id,
        organizationId: user.organizationId,
        before: expense,
      });
      revalidateExpenseViews();

      if (wantsJson) {
        return NextResponse.json({
          ok: true,
          expense,
          redirectUrl: expenseRedirectUrl(formData, "expense_deleted=1"),
        });
      }

      redirectWithMonth(formData, "expense_deleted=1");
    }

    if (action === "update") {
      const result = await updateOperatingExpense(
        String(formData.get("expenseId") ?? ""),
        {
          scope:
            formData.get("scope") === "this_month"
              ? "this_month"
              : "from_now",
          month: String(formData.get("month") ?? ""),
          category: String(formData.get("category") ?? ""),
          description: String(formData.get("description") ?? ""),
          amount: Number(formData.get("amount") ?? 0),
          isRecurring: formData.get("isRecurring") === "on",
          frequency: String(formData.get("frequency") ?? ""),
          periodStart: String(formData.get("periodStart") ?? ""),
          activeUntil: String(formData.get("activeUntil") ?? ""),
        },
      );
      await addAuditLog({
        action: "expense.update",
        entityType: "expense",
        entityId: String(formData.get("expenseId") ?? ""),
        organizationId: user.organizationId,
        before: result.before,
        after: result.after,
      });
      revalidateExpenseViews();

      if (wantsJson) {
        return NextResponse.json({
          ok: true,
          expense: result.after,
          redirectUrl: expenseRedirectUrl(formData, "expense_updated=1"),
        });
      }

      redirectWithMonth(formData, "expense_updated=1");
    }

    const expense = await addOperatingExpense({
      month: String(formData.get("month") ?? ""),
      category: String(formData.get("category") ?? ""),
      description: String(formData.get("description") ?? ""),
      amount: Number(formData.get("amount") ?? 0),
      paidAt: String(formData.get("paidAt") ?? ""),
      isRecurring: formData.get("isRecurring") === "on",
      frequency: String(formData.get("frequency") ?? ""),
      periodStart: String(formData.get("periodStart") ?? ""),
      activeUntil: String(formData.get("activeUntil") ?? ""),
    });
    await addAuditLog({
      action: "expense.create",
      entityType: "expense",
      entityId: expense.id,
      organizationId: user.organizationId,
      after: expense,
    });
    revalidateExpenseViews();

    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        expense,
        redirectUrl: expenseRedirectUrl(formData, "expense_added=1"),
      });
    }

    redirectWithMonth(formData, "expense_added=1");
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo guardar." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "No se pudo guardar el gasto.";
    redirect(`/utilidad?error=${encodeURIComponent(message)}`);
  }
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}

function revalidateExpenseViews() {
  revalidatePath("/");
  revalidatePath("/utilidad");
}

function redirectWithMonth(formData: FormData, flag: string): never {
  redirect(expenseRedirectUrl(formData, flag));
}

function expenseRedirectUrl(formData: FormData, flag: string) {
  const month = String(formData.get("month") ?? "");
  const monthQuery = /^\d{4}-\d{2}$/.test(month)
    ? `month=${encodeURIComponent(month)}&`
    : "";
  return `/utilidad?${monthQuery}${flag}`;
}
