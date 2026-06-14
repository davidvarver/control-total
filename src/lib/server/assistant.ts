import type { CurrentUser } from "./auth-store";
import { userHasPermission } from "./auth-store";
import { buildStoreDashboard } from "./dashboard-store";

const moneyWords = [
  "utilidad",
  "ganancia",
  "margen",
  "dinero",
  "recibido",
  "cobro",
  "costo",
  "costos",
  "gasto",
  "gastos",
  "perdida",
  "perdidas",
  "facturacion",
  "billing",
];

const salesWords = [
  "venta",
  "ventas",
  "orden",
  "ordenes",
  "pedido",
  "meli",
  "mercado libre",
  "mercadopago",
  "mercado pago",
];

const inventoryWords = [
  "inventario",
  "stock",
  "sku",
  "producto",
  "productos",
  "bodega",
  "full",
  "resurtido",
  "equivalencia",
];

const userWords = ["usuario", "usuarios", "rol", "roles", "permisos", "bloquear", "activar"];
const integrationWords = ["sincronizar", "sync", "conectar", "conexion", "integracion", "webhook"];
const importWords = ["excel", "importar", "subir", "cargar", "plantilla", "archivo"];
const alertWords = ["alerta", "alertas", "pendiente", "pendientes", "que hago"];

export type AssistantReply = {
  answer: string;
  links: Array<{ label: string; href: string }>;
  denied?: boolean;
};

export async function buildAssistantReply(input: {
  message: string;
  user: CurrentUser;
}): Promise<AssistantReply> {
  const message = input.message.trim();
  const normalized = normalize(message);
  const denied = getDeniedReason(normalized, input.user);
  if (denied) {
    return denied;
  }

  if (matchesAny(normalized, ["que puedo hacer", "qué puedo hacer", "permisos", "mi rol"])) {
    return describeAllowedWork(input.user);
  }

  if (matchesAny(normalized, ["mapear", "equivalencia", "sku sin mapear"])) {
    return {
      answer:
        "Para mapear un SKU, ve a Por resolver y abre SKUs sin mapear. Si el SKU maestro no existe, usa Crear y mapear desde esa misma fila. Asi la venta ya sabe de que producto descontar y calcular costo.",
      links: [
        { label: "Resolver SKUs", href: "/setup#mapear" },
        { label: "Inventario", href: "/inventario" },
      ],
    };
  }

  if (matchesAny(normalized, ["costo", "costos", "precio compra", "promedio"])) {
    return {
      answer:
        "Para corregir costos, entra a Inventario o sube el Excel de costos. El sistema recalcula pendientes cuando el SKU maestro ya tiene costo promedio. Si quedaron costos sin ligar, revisalos en Por resolver.",
      links: [
        { label: "Cargar costos", href: "/importar#costos" },
        { label: "Costos pendientes", href: "/setup#costos-sin-ligar" },
        { label: "Productos sin costo", href: "/inventario?stock=no_cost" },
      ],
    };
  }

  if (matchesAny(normalized, ["perdida", "perdidas", "salio mal", "salió mal", "margen"])) {
    return {
      answer:
        "Para entender una perdida, abre la venta: primero revisa recibido Meli, despues cargos, despues costo de producto y Full. Si el dinero esta pendiente o raro, usa Recalcular con Meli antes de decidir.",
      links: [
        { label: "Ventas con perdida", href: "/utilidad#ventas-con-perdida" },
        { label: "Ventas con problemas", href: "/alertas#ventas-problemas" },
      ],
    };
  }

  if (matchesAny(normalized, ["cargo raro", "cargos raros", "reclamar", "reclamo"])) {
    return {
      answer:
        "Los cargos raros aparecen cuando una venta trae cobros que no entran claro en comision, envio, impuesto o Full esperado. Entra a Alertas, refresca con Meli y si sigue raro usa esa evidencia para reclamar.",
      links: [
        { label: "Cargos raros", href: "/alertas#cargos-raros" },
        { label: "Ventas con problemas", href: "/alertas#ventas-problemas" },
      ],
    };
  }

  if (matchesAny(normalized, ["full", "almacenamiento", "stock antiguo", "cargos full"])) {
    return {
      answer:
        "Full tiene dos revisiones: stock real contra Control Total y cargos mensuales de almacenamiento. Sincroniza stock Full diario y cargos Full mensuales para que el margen por SKU incluya esos cobros.",
      links: [
        { label: "Mercado Libre Full", href: "/meli#full-billing" },
        { label: "Diferencias Full", href: "/alertas#diferencias-full" },
      ],
    };
  }

  if (matchesAny(normalized, ["inventario", "conteo", "contar", "reset", "stock real"])) {
    return {
      answer:
        "Para contar sin parar ventas, usa el modo conteo por SKU: resetea ese SKU, captura lo fisico y Control Total suma lo apartado por ventas pendientes para estimar el disponible real.",
      links: [
        { label: "Inventario", href: "/inventario" },
        { label: "Guia de conteo", href: "/guia#conteo" },
      ],
    };
  }

  if (matchesAny(normalized, ["comparar", "comparacion", "comparación", "sku vs", "cual vende mejor"])) {
    return {
      answer:
        "Para comparar productos, ve a Utilidad y usa Comparar SKUs. El numero principal es margen operativo antes de gastos generales; tambien se muestra utilidad final SKU cuando ya hay cargos Full ligados.",
      links: [{ label: "Comparar SKUs", href: "/utilidad#comparador-skus" }],
    };
  }

  if (matchesAny(normalized, importWords)) {
    return {
      answer:
        "Para subir informacion, entra a Cargar datos. Usa plantilla cuando sea posible; si el archivo trae filas incompletas, el sistema las manda a Por resolver para no contaminar utilidad o inventario.",
      links: [
        { label: "Cargar datos", href: "/importar" },
        { label: "Por resolver", href: "/setup" },
      ],
    };
  }

  if (matchesAny(normalized, integrationWords)) {
    return {
      answer:
        "La sincronizacion de Meli trabaja automatica: ventas por hora cerrada, stock Full diario y cargos Full mensuales. Revisa la bitacora de Meli y, si una venta puntual se ve rara, reparala desde el detalle.",
      links: [
        { label: "Mercado Libre", href: "/meli" },
        { label: "Diagnostico", href: "/salud" },
      ],
    };
  }

  if (matchesAny(normalized, alertWords)) {
    return buildDailySummary(input.user);
  }

  return {
    answer:
      "Soy ayuda (beta): puedo orientarte dentro de Control Total y respeto tus permisos. Preguntame cosas como: como mapeo un SKU, por que una venta salio en perdida, como cargo costos, como reviso Full o como comparo dos SKUs.",
    links: [
      { label: "Inicio", href: "/dashboard" },
      { label: "Guia de uso", href: "/guia" },
      { label: "Alertas", href: "/alertas" },
    ],
  };
}

function getDeniedReason(
  message: string,
  user: CurrentUser,
): AssistantReply | null {
  if (matchesAny(message, userWords) && !userHasPermission(user, "users.manage")) {
    return deny("usuarios, roles o bloqueo de cuentas", "/usuarios");
  }

  if (matchesAny(message, integrationWords) && !userHasPermission(user, "integrations.write")) {
    return deny("integraciones o sincronizaciones de Mercado Libre", "/meli");
  }

  if (matchesAny(message, moneyWords) && !userHasPermission(user, "profit.view")) {
    return deny("dinero, utilidad, margenes, costos o gastos", "/utilidad");
  }

  if (matchesAny(message, salesWords) && !userHasPermission(user, "sales.view")) {
    return deny("ventas, ordenes o datos de Mercado Libre", "/ventas");
  }

  if (matchesAny(message, inventoryWords) && !userHasPermission(user, "inventory.view")) {
    return deny("inventario, stock, SKUs o productos", "/inventario");
  }

  if (matchesAny(message, importWords) && !userHasPermission(user, "imports.write")) {
    return deny("importacion de archivos", "/importar");
  }

  if (matchesAny(message, alertWords) && !userHasPermission(user, "dashboard.view")) {
    return deny("alertas y resumen del negocio", "/alertas");
  }

  return null;
}

function deny(scope: string, href: string): AssistantReply {
  return {
    denied: true,
    answer: `No puedo mostrarte ni explicarte datos de ${scope} porque tu usuario no tiene ese permiso. Pidele a un administrador que ajuste tu rol si lo necesitas para tu trabajo.`,
    links: [{ label: "Pagina relacionada", href }],
  };
}

function describeAllowedWork(user: CurrentUser): AssistantReply {
  const allowed: string[] = [];
  if (userHasPermission(user, "dashboard.view")) allowed.push("ver inicio y pendientes");
  if (userHasPermission(user, "profit.view")) allowed.push("ver utilidad, margenes y reportes");
  if (userHasPermission(user, "sales.view")) allowed.push("consultar ventas");
  if (userHasPermission(user, "sales.write")) allowed.push("crear ventas manuales o cargos");
  if (userHasPermission(user, "inventory.view")) allowed.push("ver inventario y SKUs");
  if (userHasPermission(user, "inventory.write")) allowed.push("ajustar inventario");
  if (userHasPermission(user, "costs.write")) allowed.push("editar costos y gastos");
  if (userHasPermission(user, "imports.write")) allowed.push("subir archivos Excel");
  if (userHasPermission(user, "integrations.write")) allowed.push("sincronizar Mercado Libre");
  if (userHasPermission(user, "users.manage")) allowed.push("administrar usuarios y roles");

  return {
    answer:
      allowed.length > 0
        ? `Con tu rol puedo ayudarte con: ${allowed.join(", ")}. Si preguntas algo fuera de esos permisos, lo voy a bloquear.`
        : "Tu usuario no tiene permisos operativos en esta organizacion. Pide acceso a un administrador.",
    links: [
      { label: "Inicio", href: "/dashboard" },
      { label: "Guia", href: "/guia" },
    ],
  };
}

async function buildDailySummary(user: CurrentUser): Promise<AssistantReply> {
  const dashboard = await buildStoreDashboard();
  const issues = [
    userHasPermission(user, "inventory.view")
      ? ["stock negativo", dashboard.kpis.negativeStock]
      : null,
    userHasPermission(user, "inventory.view")
      ? ["SKUs sin mapear", dashboard.kpis.unmappedItems]
      : null,
    userHasPermission(user, "sales.view")
      ? ["ventas esperando Meli", dashboard.kpis.pendingBilling]
      : null,
    userHasPermission(user, "sales.view")
      ? ["cargos raros", dashboard.kpis.rareCharges]
      : null,
    userHasPermission(user, "inventory.view")
      ? ["diferencias Full", dashboard.kpis.fullAuditAlerts]
      : null,
    userHasPermission(user, "profit.view")
      ? ["ventas con perdida", dashboard.kpis.lossOrders]
      : null,
  ].filter(
    (issue): issue is [string, number] =>
      Array.isArray(issue) && Number(issue[1]) > 0,
  );

  return {
    answer:
      issues.length > 0
        ? `Hoy conviene atender primero: ${issues
            .map(([label, value]) => `${value} ${label}`)
            .join(", ")}. Empieza por Alertas para resolverlo en orden.`
        : "Ahora no veo pendientes fuertes en la cola diaria. Puedes revisar utilidad, resurtido o comparar SKUs.",
    links: [
      { label: "Alertas", href: "/alertas" },
      { label: "Utilidad", href: "/utilidad" },
    ],
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesAny(message: string, words: string[]) {
  return words.some((word) => message.includes(normalize(word)));
}
