CREATE TABLE "en_escena_audit_link" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"label" varchar(80) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"opened_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "en_escena_audit_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "en_escena_audit_link" ADD CONSTRAINT "audit_link_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."en_escena_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_link_token_hash_unique" ON "en_escena_audit_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "audit_link_event_idx" ON "en_escena_audit_link" USING btree ("event_id");