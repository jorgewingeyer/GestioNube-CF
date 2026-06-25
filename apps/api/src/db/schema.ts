import {
  pgTable,
  serial,
  varchar,
  timestamp,
  integer,
  boolean,
  decimal,
  text,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// -----------------------------------------------------------------------------
// TABLES
// -----------------------------------------------------------------------------

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  cuit: varchar("cuit", { length: 255 }),
  phone: varchar("phone", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  logo_url: varchar("logo_url", { length: 255 }),
  parent_id: integer("parent_id"), // self reference
  active: boolean("active").default(true),
  suspended_reason: text("suspended_reason"),
  iva: varchar("iva", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  deleted_at: timestamp("deleted_at"),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  avatar_url: varchar("avatar_url", { length: 255 }),
  email_verified_at: timestamp("email_verified_at"),
  password: varchar("password", { length: 255 }).notNull(),
  remember_token: varchar("remember_token", { length: 100 }),
  address_id: integer("address_id"), // Refers to addresses
  dni: integer("dni"),
  phone: varchar("phone", { length: 255 }),
  is_super_admin: boolean("is_super_admin").default(false),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  deleted_at: timestamp("deleted_at"),
});

export const tenantUsers = pgTable("tenant_user", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  user_id: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price_buy: integer("price_buy").default(0), // unsignedInteger in Laravel
  price_sell: integer("price_sell").default(0), // unsignedInteger in Laravel
  category_id: integer("category_id"), // Refers to categories
  image: varchar("image", { length: 255 }),
  barcode: varchar("barcode", { length: 255 }),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  deleted_at: timestamp("deleted_at"),
});

export const productTenants = pgTable("product_tenant", {
  id: serial("id").primaryKey(),
  product_id: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  margin_id: integer("margin_id"), // Refers to margins
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const counterparties = pgTable("counterparties", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  cuit: varchar("cuit", { length: 255 }).unique().notNull(),
  contact_name: varchar("contact_name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 255 }),
  tax_condiction: varchar("tax_condiction", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  deleted_at: timestamp("deleted_at"),
});

export const counterpartyTenants = pgTable("counterparty_tenant", {
  id: serial("id").primaryKey(),
  counterparty_id: integer("counterparty_id")
    .notNull()
    .references(() => counterparties.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  party_type: varchar("party_type", { length: 255 }).default("client"), // provider, client
  contact_name: varchar("contact_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  counterparty_id: integer("counterparty_id").references(
    () => counterparties.id,
    { onDelete: "cascade" },
  ),
  invoice_number: varchar("invoice_number", { length: 255 }).notNull(),
  cbte_nro: integer("cbte_nro"), // unsignedBigInteger in Laravel, integer should be enough or bigint
  cbte_tipo: varchar("cbte_tipo", { length: 255 }),
  PtoVta: integer("PtoVta"),
  cae: varchar("cae", { length: 255 }),
  cae_expiration_date: date("cae_expiration_date"),
  cae_result: varchar("cae_result", { length: 255 }),
  invoice_date: date("invoice_date").notNull(),
  expiration_date: date("expiration_date"),
  invoice_type: varchar("invoice_type", { length: 255 }).notNull(),
  invoice_origin: varchar("invoice_origin", { length: 255 }),
  currency: varchar("currency", { length: 255 }).default("ARS"),
  status: varchar("status", { length: 255 }).default("draft"),
  iva_type: varchar("iva_type", { length: 255 }),
  tax_tenant_id: integer("tax_tenant_id"),
  discount_type: varchar("discount_type", { length: 255 }),
  discount_value: decimal("discount_value", { precision: 15, scale: 2 }),
  interest_type: varchar("interest_type", { length: 255 }),
  interest_value: decimal("interest_value", { precision: 15, scale: 2 }),
  installments: integer("installments"),
  reason: varchar("reason", { length: 255 }),
  purchase_order_id: integer("purchase_order_id"),
  is_reconciled: boolean("is_reconciled").default(false),
  conciliation_comment: varchar("conciliation_comment", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  deleted_at: timestamp("deleted_at"),
});

export const invoiceProducts = pgTable("invoice_product", {
  id: serial("id").primaryKey(),
  invoice_id: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  product_id: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  price: integer("price").notNull(), // unsignedInteger
  discount: decimal("discount", { precision: 15, scale: 2 }), // was float in migration
  tax_value: decimal("tax_value", { precision: 15, scale: 2 }), // was float
  margin_id: integer("margin_id"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// -----------------------------------------------------------------------------
// RELATIONS
// -----------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  parent: one(tenants, {
    fields: [tenants.parent_id],
    references: [tenants.id],
    relationName: "parent_child",
  }),
  children: many(tenants, { relationName: "parent_child" }),
  users: many(tenantUsers),
  products: many(products),
  productTenants: many(productTenants),
  counterparties: many(counterpartyTenants),
  invoices: many(invoices),
}));

export const usersRelations = relations(users, ({ many }) => ({
  tenants: many(tenantUsers),
}));

export const tenantUsersRelations = relations(tenantUsers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantUsers.tenant_id],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [tenantUsers.user_id],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [products.tenant_id],
    references: [tenants.id],
  }),
  tenants: many(productTenants),
  invoices: many(invoiceProducts),
}));

export const productTenantsRelations = relations(productTenants, ({ one }) => ({
  product: one(products, {
    fields: [productTenants.product_id],
    references: [products.id],
  }),
  tenant: one(tenants, {
    fields: [productTenants.tenant_id],
    references: [tenants.id],
  }),
}));

export const counterpartiesRelations = relations(
  counterparties,
  ({ many }) => ({
    tenants: many(counterpartyTenants),
    invoices: many(invoices),
  }),
);

export const counterpartyTenantsRelations = relations(
  counterpartyTenants,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [counterpartyTenants.tenant_id],
      references: [tenants.id],
    }),
    counterparty: one(counterparties, {
      fields: [counterpartyTenants.counterparty_id],
      references: [counterparties.id],
    }),
  }),
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenant_id],
    references: [tenants.id],
  }),
  counterparty: one(counterparties, {
    fields: [invoices.counterparty_id],
    references: [counterparties.id],
  }),
  products: many(invoiceProducts),
}));

export const invoiceProductsRelations = relations(
  invoiceProducts,
  ({ one }) => ({
    invoice: one(invoices, {
      fields: [invoiceProducts.invoice_id],
      references: [invoices.id],
    }),
    product: one(products, {
      fields: [invoiceProducts.product_id],
      references: [products.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type Counterparty = typeof counterparties.$inferSelect;
export type NewCounterparty = typeof counterparties.$inferInsert;
