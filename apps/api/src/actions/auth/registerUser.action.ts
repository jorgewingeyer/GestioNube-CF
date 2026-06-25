import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hashPassword } from "../../lib/crypto";
import { DuplicateEmailError, AppError } from "../../errors";

/**
 * Register a new user and automatically setup their company (Tenant),
 * taxes, roles, and permissions in a single transaction.
 * @param db - Database instance.
 * @param input - User registration data.
 * @returns Created user details.
 */
export const registerUserAction = async (
  db: PostgresJsDatabase<typeof schema>,
  input: { name: string; email: string; password: string },
) => {
  // 1. Initial check (outside transaction for efficiency)
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);

  if (existing) {
    throw new DuplicateEmailError();
  }

  // 2. Execute everything in a transaction for atomicity
  return await db.transaction(async (tx) => {
    // Hash password
    const hashedPassword = await hashPassword(input.password);

    // Create user
    const [user] = await tx
      .insert(schema.users)
      .values({
        name: input.name,
        email: input.email,
        password: hashedPassword,
      })
      .returning({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
      });

    if (!user) {
      throw new AppError({
        message:
          "No pudimos crear tu perfil de usuario. Por favor, intenta de nuevo.",
        code: "USER_CREATION_FAILED",
        statusCode: 500,
      });
    }

    // Create company (Tenant)
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        name: `Empresa de ${input.name}`,
        email: input.email,
        active: true,
      })
      .returning();

    if (!tenant) {
      throw new AppError({
        message:
          "No pudimos crear el espacio de tu empresa. Por favor, intenta de nuevo.",
        code: "TENANT_CREATION_FAILED",
        statusCode: 500,
      });
    }

    // Link User to Tenant
    await tx.insert(schema.tenantUsers).values({
      user_id: user.id,
      tenant_id: tenant.id,
    });

    // Setup Default Taxes (IVA 10.5%, 21%, 27%)
    // First, ensure taxes exist globally or find them
    const defaultTaxes = [
      { name: "IVA 10.5%", value: "10.50" },
      { name: "IVA 21%", value: "21.00" },
      { name: "IVA 27%", value: "27.00" },
    ];

    for (const taxData of defaultTaxes) {
      let [tax] = await tx
        .select()
        .from(schema.taxes)
        .where(eq(schema.taxes.name, taxData.name))
        .limit(1);

      if (!tax) {
        [tax] = await tx
          .insert(schema.taxes)
          .values({ name: taxData.name })
          .returning();
      }

      if (tax) {
        await tx.insert(schema.taxTenants).values({
          tenant_id: tenant.id,
          tax_id: tax.id,
          value: taxData.value,
        });
      }
    }

    // Create Admin Role for Tenant
    const [adminRole] = await tx
      .insert(schema.roles)
      .values({
        name: "admin",
        tenant_id: tenant.id,
      })
      .returning();

    if (!adminRole) {
      throw new AppError({
        message:
          "No pudimos configurar el rol de administrador para tu empresa.",
        code: "ROLE_CREATION_FAILED",
        statusCode: 500,
      });
    }

    // Assign all existing permissions to the admin role
    const allPermissions = await tx.select().from(schema.permissions);

    if (allPermissions.length > 0) {
      const permissionRoleData = allPermissions.map((p) => ({
        permission_id: p.id,
        role_id: adminRole.id,
      }));
      await tx.insert(schema.permissionRole).values(permissionRoleData);
    }

    // Assign admin role to user
    await tx.insert(schema.roleUser).values({
      user_id: user.id,
      role_id: adminRole.id,
    });

    return user;
  });
};
