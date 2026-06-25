CREATE TABLE "counterparties" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"cuit" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(255),
	"tax_condiction" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "counterparties_cuit_unique" UNIQUE("cuit"),
	CONSTRAINT "counterparties_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "counterparty_tenant" (
	"id" serial PRIMARY KEY NOT NULL,
	"counterparty_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"party_type" varchar(255) DEFAULT 'client',
	"contact_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_product" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"price" integer NOT NULL,
	"discount" numeric(15, 2),
	"tax_value" numeric(15, 2),
	"margin_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"counterparty_id" integer,
	"invoice_number" varchar(255) NOT NULL,
	"cbte_nro" integer,
	"cbte_tipo" varchar(255),
	"PtoVta" integer,
	"cae" varchar(255),
	"cae_expiration_date" date,
	"cae_result" varchar(255),
	"invoice_date" date NOT NULL,
	"expiration_date" date,
	"invoice_type" varchar(255) NOT NULL,
	"invoice_origin" varchar(255),
	"currency" varchar(255) DEFAULT 'ARS',
	"status" varchar(255) DEFAULT 'draft',
	"iva_type" varchar(255),
	"tax_tenant_id" integer,
	"discount_type" varchar(255),
	"discount_value" numeric(15, 2),
	"interest_type" varchar(255),
	"interest_value" numeric(15, 2),
	"installments" integer,
	"reason" varchar(255),
	"purchase_order_id" integer,
	"is_reconciled" boolean DEFAULT false,
	"conciliation_comment" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "product_tenant" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"margin_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price_buy" integer DEFAULT 0,
	"price_sell" integer DEFAULT 0,
	"category_id" integer,
	"image" varchar(255),
	"barcode" varchar(255),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tenant_user" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"cuit" varchar(255),
	"phone" varchar(255),
	"email" varchar(255),
	"logo_url" varchar(255),
	"parent_id" integer,
	"active" boolean DEFAULT true,
	"suspended_reason" text,
	"iva" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "tenants_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"avatar_url" varchar(255),
	"email_verified_at" timestamp,
	"password" varchar(255) NOT NULL,
	"remember_token" varchar(100),
	"address_id" integer,
	"dni" integer,
	"phone" varchar(255),
	"is_super_admin" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "counterparty_tenant" ADD CONSTRAINT "counterparty_tenant_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparty_tenant" ADD CONSTRAINT "counterparty_tenant_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_product" ADD CONSTRAINT "invoice_product_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_product" ADD CONSTRAINT "invoice_product_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tenant" ADD CONSTRAINT "product_tenant_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tenant" ADD CONSTRAINT "product_tenant_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_user" ADD CONSTRAINT "tenant_user_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_user" ADD CONSTRAINT "tenant_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;