import crypto from "node:crypto";
import type { LockMode, Prisma, SubscriptionStatus, UserStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";

const sessionCookieName = "ct_session";
const sessionDays = 30;

export type SystemRoleName =
  | "owner"
  | "admin"
  | "platform_admin"
  | "stock"
  | "sales"
  | "analyst"
  | "read_only"
  | "staff";

export type RoleName = SystemRoleName | (string & {});

export type PermissionCode =
  | "dashboard.view"
  | "reports.view"
  | "reports.export"
  | "profit.view"
  | "health.view"
  | "inventory.view"
  | "inventory.write"
  | "sales.view"
  | "sales.write"
  | "costs.write"
  | "imports.write"
  | "integrations.write"
  | "users.manage";

type AuthUser = {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: RoleName;
  permissions: PermissionCode[];
  isPlatformAdmin: boolean;
  isPlatformOnly: boolean;
  createdAt: string;
};

export type CurrentUser = Omit<AuthUser, "passwordHash" | "passwordSalt">;

export const roleLabels: Record<SystemRoleName, string> = {
  owner: "Dueno",
  admin: "Admin",
  platform_admin: "Admin plataforma",
  stock: "Inventario",
  sales: "Ventas",
  analyst: "Analista",
  read_only: "Solo lectura",
  staff: "Staff",
};

export const editableRoles: RoleName[] = [
  "admin",
  "stock",
  "sales",
  "analyst",
  "read_only",
];

export const permissionDefinitions: Array<{
  code: PermissionCode;
  label: string;
  group: string;
}> = [
  { code: "dashboard.view", label: "Ver inicio y pendientes", group: "Inicio" },
  { code: "reports.view", label: "Ver reportes operativos", group: "Reportes" },
  { code: "reports.export", label: "Exportar reportes", group: "Reportes" },
  { code: "profit.view", label: "Ver utilidad y margenes", group: "Finanzas" },
  { code: "health.view", label: "Ver salud/escala/costos", group: "Finanzas" },
  { code: "inventory.view", label: "Ver inventario", group: "Inventario" },
  { code: "inventory.write", label: "Editar inventario", group: "Inventario" },
  { code: "sales.view", label: "Ver ventas", group: "Ventas" },
  { code: "sales.write", label: "Editar ventas/cargos", group: "Ventas" },
  { code: "costs.write", label: "Editar costos/gastos", group: "Costos" },
  { code: "imports.write", label: "Importar archivos", group: "Importaciones" },
  { code: "integrations.write", label: "Conectar Meli/sync", group: "Integraciones" },
  { code: "users.manage", label: "Usuarios y roles", group: "Usuarios" },
];

const rolePermissions: Record<SystemRoleName, PermissionCode[]> = {
  owner: [
    "dashboard.view",
    "reports.view",
    "reports.export",
    "profit.view",
    "health.view",
    "inventory.view",
    "inventory.write",
    "sales.view",
    "sales.write",
    "costs.write",
    "imports.write",
    "integrations.write",
    "users.manage",
  ],
  admin: [
    "dashboard.view",
    "reports.view",
    "reports.export",
    "profit.view",
    "health.view",
    "inventory.view",
    "inventory.write",
    "sales.view",
    "sales.write",
    "costs.write",
    "imports.write",
    "integrations.write",
    "users.manage",
  ],
  platform_admin: [],
  stock: ["dashboard.view", "inventory.view", "inventory.write", "imports.write"],
  sales: ["dashboard.view", "inventory.view", "sales.view", "sales.write"],
  analyst: [
    "dashboard.view",
    "reports.view",
    "reports.export",
    "profit.view",
    "inventory.view",
    "sales.view",
  ],
  read_only: ["dashboard.view", "inventory.view", "sales.view"],
  staff: ["dashboard.view", "inventory.view", "sales.view"],
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createSessionToken() {
  return `ses_${crypto.randomUUID()}_${crypto.randomBytes(24).toString("hex")}`;
}

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicDbUser(input: {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  organizations: Array<{
    status?: UserStatus;
    organization: {
      id: string;
      name: string;
    };
    role: {
      name: string;
      permissions?: Array<{
        permission: {
          code: string;
        };
      }>;
    };
  }>;
}): CurrentUser {
  const membership =
    input.organizations.find((entry) => entry.status === "active") ??
    input.organizations[0];
  const isPlatformAdmin = isPlatformAdminEmail(input.email);
  const isPlatformOnly = isPlatformAdmin && !membership;

  return {
    id: input.id,
    organizationId: membership?.organization.id ?? "platform",
    organizationName: membership?.organization.name ?? "Control Total",
    name: input.name,
    email: input.email,
    role: isPlatformOnly ? "platform_admin" : membership?.role.name ?? "staff",
    permissions: isPlatformOnly ? [] : getRolePermissionCodes(membership?.role),
    isPlatformAdmin,
    isPlatformOnly,
    createdAt: input.createdAt.toISOString(),
  };
}

function getRolePermissionCodes(role?: {
  name?: string | null;
  permissions?: Array<{ permission: { code: string } }>;
}) {
  const fromDatabase =
    role?.permissions
      ?.map((entry) => entry.permission.code)
      .filter((code): code is PermissionCode => isPermissionCode(code)) ?? [];

  if (fromDatabase.length > 0) {
    return [...new Set(fromDatabase)];
  }

  return rolePermissions[role?.name as SystemRoleName] ?? rolePermissions.staff;
}

function isPermissionCode(code: string): code is PermissionCode {
  return permissionDefinitions.some((permission) => permission.code === code);
}

async function hashPassword(
  password: string,
  salt = crypto.randomBytes(16).toString("hex"),
) {
  const hash = await new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("hex"));
    });
  });

  return { hash, salt };
}

function constantTimeEqual(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  organizationName?: string;
}) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;
  const organizationName = input.organizationName?.trim() || name || "Mi empresa";

  if (!name || !email || password.length < 8) {
    throw new Error("Completa nombre, email y una contrasena de 8 caracteres minimo.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new Error("Ya existe una cuenta con ese email.");
  }

  const passwordData = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: organizationName,
      },
    });
    await ensureDefaultRolesForOrganization(organization.id, tx);
    await ensureDefaultSubscriptionForOrganization(organization.id, tx);
    const role = await tx.role.findUniqueOrThrow({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: "owner",
        },
      },
    });
    const createdUser = await tx.user.create({
      data: {
        name,
        email,
        passwordHash: passwordData.hash,
        passwordSalt: passwordData.salt,
        organizations: {
          create: {
            organizationId: organization.id,
            roleId: role.id,
          },
        },
      },
      include: {
        organizations: {
          include: {
            organization: true,
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
          take: 1,
        },
      },
    });

    return createdUser;
  });

  return publicDbUser(user);
}

export async function verifyPasswordLogin(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      organizations: {
        where: { status: "active" },
        include: {
          organization: true,
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!user || user.status !== "active") {
    return null;
  }

  if (user.organizations.length === 0 && !isPlatformAdminEmail(user.email)) {
    return null;
  }

  const passwordData = await hashPassword(password, user.passwordSalt);
  if (!constantTimeEqual(passwordData.hash, user.passwordHash)) {
    return null;
  }

  return publicDbUser(user);
}

export async function findUserByEmail(emailInput: string) {
  const email = normalizeEmail(emailInput);
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      organizations: {
        where: { status: "active" },
        include: {
          organization: true,
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
        take: 1,
      },
    },
  });

  return user ? publicDbUser(user) : null;
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  const session = {
    id: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000),
  };

  await prisma.authSession.create({
    data: session,
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionDays * 24 * 60 * 60,
    expires: session.expiresAt,
  });

  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(sessionCookieName)?.value;

  if (sessionToken) {
    await prisma.authSession.deleteMany({
      where: {
        id: {
          in: [hashSessionToken(sessionToken), sessionToken],
        },
      },
    });
  }

  cookieStore.delete(sessionCookieName);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(sessionCookieName)?.value;

  if (!sessionToken) {
    return null;
  }

  const session = await prisma.authSession.findFirst({
    where: {
      id: {
        in: [hashSessionToken(sessionToken), sessionToken],
      },
    },
    include: {
      user: {
        include: {
          organizations: {
            where: { status: "active" },
            include: {
              organization: true,
              role: {
                include: {
                  permissions: {
                    include: { permission: true },
                  },
                },
              },
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  if (
    session.user.organizations.length === 0 &&
    !isPlatformAdminEmail(session.user.email)
  ) {
    return null;
  }

  return publicDbUser(session.user);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export function isPlatformAdminEmail(email: string) {
  const configuredEmails =
    process.env.PLATFORM_ADMIN_EMAILS ??
    process.env.SUPER_ADMIN_EMAILS ??
    "";
  const allowedEmails = configuredEmails
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

  return allowedEmails.includes(normalizeEmail(email));
}

export async function requirePlatformAdmin() {
  const user = await requireCurrentUser();

  if (!isPlatformAdminEmail(user.email)) {
    redirect("/dashboard?error=sin_permiso_admin");
  }

  return user;
}

export async function createPlatformAdminUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const name = input.name.trim() || "Admin Control Total";
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!email || password.length < 12) {
    throw new Error("El admin necesita email y una contrasena de al menos 12 caracteres.");
  }

  if (!isPlatformAdminEmail(email)) {
    throw new Error("El email debe estar incluido en PLATFORM_ADMIN_EMAILS.");
  }

  const passwordData = await hashPassword(password);
  return prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      status: "active",
    },
    update: {
      name,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      status: "active",
    },
    select: { id: true, email: true, name: true, status: true },
  });
}

export function userHasPermission(user: CurrentUser, permission: PermissionCode) {
  if (user.permissions.includes(permission)) {
    return true;
  }

  if (permission === "dashboard.view") {
    return user.permissions.some((entry) =>
      ["reports.view", "inventory.view", "sales.view"].includes(entry),
    );
  }

  if (
    ["profit.view", "health.view", "reports.export"].includes(permission) &&
    user.permissions.includes("reports.view")
  ) {
    return (
      ["owner", "admin", "analyst"].includes(String(user.role)) ||
      user.permissions.includes("users.manage") ||
      user.permissions.includes("costs.write")
    );
  }

  return false;
}

export async function requirePermission(permission: PermissionCode) {
  const user = await requireCurrentUser();

  if (user.isPlatformOnly) {
    redirect("/admin?error=sin_permiso_operativo");
  }

  if (!userHasPermission(user, permission)) {
    redirect("/dashboard?error=sin_permiso");
  }

  const access = await getOrganizationAccess(user.organizationId);
  const allowedWhileFullyLocked: PermissionCode[] = ["users.manage"];
  if (
    access.lockMode === "full_lock" &&
    !allowedWhileFullyLocked.includes(permission)
  ) {
    redirect(`/cuenta?locked=${access.lockMode}`);
  }

  return user;
}

export async function requireWritablePermission(permission: PermissionCode) {
  const user = await requirePermission(permission);
  const access = await getOrganizationAccess(user.organizationId);

  if (!access.canWrite) {
    redirect(`/cuenta?locked=${access.lockMode}`);
  }

  return user;
}

export async function requireApiUser() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, response: null };
}

export async function requireApiPermission(permission: PermissionCode) {
  const auth = await requireApiUser();
  if (auth.response || !auth.user) {
    return auth;
  }

  if (auth.user.isPlatformOnly) {
    return {
      user: auth.user,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (!userHasPermission(auth.user, permission)) {
    return {
      user: auth.user,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const access = await getOrganizationAccess(auth.user.organizationId);
  const allowedWhileFullyLocked: PermissionCode[] = ["users.manage"];
  if (
    access.lockMode === "full_lock" &&
    !allowedWhileFullyLocked.includes(permission)
  ) {
    return {
      user: auth.user,
      response: NextResponse.json(
        { error: "Cuenta bloqueada por suscripcion." },
        { status: 402 },
      ),
    };
  }

  return auth;
}

export async function requireApiWritablePermission(permission: PermissionCode) {
  const auth = await requireApiPermission(permission);
  if (auth.response || !auth.user) {
    return auth;
  }

  const access = await getOrganizationAccess(auth.user.organizationId);
  if (!access.canWrite) {
    return {
      user: auth.user,
      response: NextResponse.json(
        { error: "Cuenta bloqueada o en solo lectura por suscripcion." },
        { status: 402 },
      ),
    };
  }

  return auth;
}

export async function getOrganizationAccess(organizationId: string) {
  const subscription = await ensureDefaultSubscriptionForOrganization(organizationId);
  const now = new Date();
  const expiresAt = subscription.expiresAt;
  const graceUntil = subscription.graceUntil;
  const expired = now.getTime() > expiresAt.getTime();
  const inGrace = expired && now.getTime() <= graceUntil.getTime();
  const isSuspended =
    subscription.status === "suspended" ||
    subscription.status === "cancelled" ||
    (expired && !inGrace);
  const lockMode: LockMode = isSuspended ? subscription.lockMode : "none";

  return {
    subscription,
    status: isSuspended
      ? ("suspended" as SubscriptionStatus)
      : inGrace
        ? ("grace" as SubscriptionStatus)
        : subscription.status,
    isLocked: lockMode !== "none",
    canWrite: lockMode !== "read_only" && lockMode !== "full_lock",
    lockMode,
  };
}

export async function listOrganizationUsers(organizationId: string) {
  await ensureDefaultRolesForOrganization(organizationId);
  return prisma.organizationUser.findMany({
    where: { organizationId },
    include: {
      user: {
        select: { id: true, name: true, email: true, status: true, createdAt: true },
      },
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listOrganizationRoles(organizationId: string) {
  await ensureDefaultRolesForOrganization(organizationId);
  return prisma.role.findMany({
    where: { organizationId },
    include: {
      permissions: {
        include: { permission: true },
      },
      _count: {
        select: { users: true },
      },
    },
    orderBy: [{ isSystemRole: "desc" }, { name: "asc" }],
  });
}

export async function createOrganizationUser(input: {
  organizationId: string;
  name: string;
  email: string;
  password: string;
  role: RoleName;
}) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const roleName = normalizeEditableRoleInput(input.role);

  if (!name || !email || input.password.length < 8) {
    throw new Error("Completa nombre, email y contrasena minima de 8 caracteres.");
  }

  const passwordData = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    await ensureDefaultRolesForOrganization(input.organizationId, tx);
    const role = await tx.role.findUnique({
      where: {
        organizationId_name: {
          organizationId: input.organizationId,
          name: roleName,
        },
      },
    });

    if (!role || role.name === "owner") {
      throw new Error("Rol invalido para usuario nuevo");
    }

    let user = await tx.user.findUnique({ where: { email } });
    if (!user) {
      user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash: passwordData.hash,
          passwordSalt: passwordData.salt,
        },
      });
    }

    return tx.organizationUser.upsert({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: user.id,
        },
      },
      create: {
        organizationId: input.organizationId,
        userId: user.id,
        roleId: role.id,
        status: "active",
      },
      update: {
        roleId: role.id,
        status: "active",
      },
    });
  });
}

export async function updateOrganizationUser(input: {
  organizationId: string;
  membershipId: string;
  role: RoleName;
  status: UserStatus;
}) {
  const roleName = normalizeEditableRoleInput(input.role);
  await ensureDefaultRolesForOrganization(input.organizationId);
  const membership = await prisma.organizationUser.findUnique({
    where: { id: input.membershipId, organizationId: input.organizationId },
    include: { role: true },
  });

  if (!membership) {
    throw new Error("Usuario no encontrado");
  }

  if (membership.role.name === "owner") {
    throw new Error("El dueno no se edita aqui");
  }

  const role = await prisma.role.findUnique({
    where: {
      organizationId_name: {
        organizationId: input.organizationId,
        name: roleName,
      },
    },
  });

  if (!role || role.name === "owner") {
    throw new Error("Rol invalido");
  }

  return prisma.organizationUser.update({
    where: { id: input.membershipId, organizationId: input.organizationId },
    data: {
      roleId: role.id,
      status: input.status,
    },
  });
}

export async function createOrganizationRole(input: {
  organizationId: string;
  name: string;
  permissions: string[];
}) {
  const name = normalizeCustomRoleName(input.name);
  const permissionCodes = normalizePermissionInputs(input.permissions);

  if (reservedRoleNames.has(name.toLowerCase())) {
    throw new Error("Ese nombre esta reservado para roles del sistema");
  }

  await ensureDefaultRolesForOrganization(input.organizationId);
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        organizationId: input.organizationId,
        name,
        isSystemRole: false,
      },
    });
    await replaceRolePermissions(tx, role.id, permissionCodes);
    return role;
  });
}

export async function updateOrganizationRole(input: {
  organizationId: string;
  roleId: string;
  permissions: string[];
}) {
  await ensureDefaultRolesForOrganization(input.organizationId);
  const role = await prisma.role.findUnique({
    where: { id: input.roleId, organizationId: input.organizationId },
  });

  if (!role) {
    throw new Error("Rol no encontrado");
  }

  if (role.name === "owner") {
    throw new Error("El rol dueno no se puede limitar");
  }

  const permissionCodes = normalizePermissionInputs(input.permissions);
  await prisma.$transaction(async (tx) => {
    await replaceRolePermissions(tx, role.id, permissionCodes);
  });

  return role;
}

function normalizeEditableRoleInput(role: string) {
  const roleName = role.trim();
  if (!roleName) {
    return "read_only";
  }

  return roleName;
}

function normalizeCustomRoleName(input: string) {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < 3) {
    throw new Error("El rol necesita nombre de al menos 3 caracteres");
  }

  return name;
}

const reservedRoleNames = new Set<string>([
  "owner",
  "admin",
  "stock",
  "sales",
  "analyst",
  "read_only",
  "staff",
]);

function normalizePermissionInputs(permissions: string[]) {
  return [...new Set(permissions.filter(isPermissionCode))];
}

export async function updateCurrentOrganizationSubscription(input: {
  organizationId: string;
  status: SubscriptionStatus;
  lockMode: LockMode;
  expiresAt: Date;
  graceUntil: Date;
}) {
  const subscription = await ensureDefaultSubscriptionForOrganization(input.organizationId);
  return prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: input.status,
      lockMode: input.lockMode,
      expiresAt: input.expiresAt,
      graceUntil: input.graceUntil,
    },
  });
}

export async function recordManualSubscriptionPayment(input: {
  organizationId: string;
  amount: number;
  method: string;
  coveredUntil: Date;
  notes?: string;
  createdById?: string;
}) {
  const subscription = await ensureDefaultSubscriptionForOrganization(input.organizationId);
  const coveredUntil = input.coveredUntil;
  const graceUntil = new Date(coveredUntil);
  graceUntil.setDate(graceUntil.getDate() + 10);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId: subscription.id,
        amount: Math.max(0, input.amount),
        method: input.method.trim() || "manual",
        paidAt: new Date(),
        coveredUntil,
        notes: input.notes?.trim() || undefined,
        createdById: input.createdById,
      },
    });

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "active",
        lockMode: "read_only",
        expiresAt: coveredUntil,
        graceUntil,
      },
    });

    return payment;
  });
}

export async function listSubscriptionPayments(organizationId: string) {
  return prisma.subscriptionPayment.findMany({
    where: { organizationId },
    orderBy: { paidAt: "desc" },
    take: 25,
  });
}

export async function listPlatformOrganizations() {
  return prisma.organization.findMany({
    include: {
      users: {
        include: {
          user: { select: { id: true, name: true, email: true, status: true } },
          role: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      marketplaceAccounts: {
        select: {
          id: true,
          channel: true,
          alias: true,
          authStatus: true,
          lastSyncAt: true,
          isActive: true,
        },
      },
      subscriptions: {
        include: { plan: true },
        orderBy: { startsAt: "desc" },
        take: 1,
      },
      subscriptionPayments: {
        orderBy: { paidAt: "desc" },
        take: 12,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updatePlatformOrganizationSubscription(input: {
  organizationId: string;
  status: SubscriptionStatus;
  lockMode: LockMode;
  expiresAt: Date;
  graceUntil: Date;
}) {
  const subscription = await ensureDefaultSubscriptionForOrganization(input.organizationId);
  return prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: input.status,
      lockMode: input.lockMode,
      expiresAt: input.expiresAt,
      graceUntil: input.graceUntil,
    },
  });
}

export async function recordPlatformSubscriptionPayment(input: {
  organizationId: string;
  amount: number;
  method: string;
  coveredUntil: Date;
  notes?: string;
  createdById?: string;
}) {
  return recordManualSubscriptionPayment(input);
}

export async function ensureDefaultRolesForOrganization(
  organizationId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await ensurePermissions(tx);
  const roles: SystemRoleName[] = ["owner", "admin", "stock", "sales", "analyst", "read_only"];
  for (const role of roles) {
    const savedRole = await tx.role.upsert({
        where: { organizationId_name: { organizationId, name: role } },
        create: {
          organizationId,
          name: role,
          isSystemRole: true,
        },
        update: {},
      });
    const existingPermissions = await tx.rolePermission.count({
      where: { roleId: savedRole.id },
    });
    if (existingPermissions === 0) {
      await replaceRolePermissions(tx, savedRole.id, rolePermissions[role]);
    }
  }
}

async function ensurePermissions(
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  for (const permission of permissionDefinitions) {
    await tx.permission.upsert({
      where: { code: permission.code },
      create: {
        code: permission.code,
        description: permission.label,
      },
      update: {
        description: permission.label,
      },
    });
  }
}

async function replaceRolePermissions(
  tx: Prisma.TransactionClient | typeof prisma,
  roleId: string,
  permissionCodes: PermissionCode[],
) {
  await ensurePermissions(tx);
  const permissions = await tx.permission.findMany({
    where: { code: { in: permissionCodes } },
    select: { id: true },
  });

  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (permissions.length === 0) {
    return;
  }

  await tx.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });
}

export async function ensureDefaultSubscriptionForOrganization(
  organizationId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const plan = await tx.plan.upsert({
    where: { name: "MVP Manual" },
    create: {
      name: "MVP Manual",
      priceMonthly: 0,
      limits: {},
    },
    update: {},
  });
  const existing = await tx.subscription.findFirst({
    where: { organizationId },
    orderBy: { startsAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  const startsAt = new Date();
  const expiresAt = new Date(startsAt);
  expiresAt.setDate(expiresAt.getDate() + 30);
  const graceUntil = new Date(expiresAt);
  graceUntil.setDate(graceUntil.getDate() + 10);

  return tx.subscription.create({
    data: {
      organizationId,
      planId: plan.id,
      status: "trial",
      startsAt,
      expiresAt,
      graceUntil,
      lockMode: "read_only",
    },
  });
}

export async function getRegisteredOrganizationIds() {
  const organizations = await prisma.organization.findMany({
    select: { id: true },
  });
  return organizations.map((organization) => organization.id);
}
