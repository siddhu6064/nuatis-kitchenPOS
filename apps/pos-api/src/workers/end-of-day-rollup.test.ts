/**
 * End-of-day rollup worker tests.
 *
 * Unit tests that exercise processRollup with injectable mocks (no BullMQ,
 * no Redis). DB-dependent tests are marked skipIf(noDb).
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "../env.js";

const noDb = !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Unit tests — injectable emailFn; require Supabase for DB reads
// ---------------------------------------------------------------------------

describe("processRollup — email behaviour (integration, requires DB)", () => {
  it.skipIf(noDb)(
    "does not call emailFn when tenant.email_daily_report=false",
    async () => {
      const { processRollup } = await import("./end-of-day-rollup.js");
      const { createClient } = await import("@supabase/supabase-js");

      const db = createClient(
        env.SUPABASE_URL!,
        env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Insert a minimal tenant with email_daily_report=false
      const { data: tenant } = await db
        .from("tenants")
        .insert({
          name: "Test Rollup Cafe",
          vertical: "cafe",
          timezone: "UTC",
          email_daily_report: false,
        })
        .select("id")
        .single();

      if (!tenant) throw new Error("Could not create test tenant");
      const tenantId = tenant.id as string;

      try {
        const emailSpy = vi.fn().mockResolvedValue({ id: "mock-email-id" });

        // Run rollup for today — no orders, but should not throw
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(
          new Date(Date.now() - 86_400_000) // yesterday
        );

        await processRollup({ tenant_id: tenantId, date: today }, { emailFn: emailSpy });

        expect(emailSpy).not.toHaveBeenCalled();
      } finally {
        await db.from("tenants").delete().eq("id", tenantId);
      }
    }
  );

  it.skipIf(noDb)(
    "calls emailFn when tenant.email_daily_report=true and owner has email",
    async () => {
      const { processRollup } = await import("./end-of-day-rollup.js");
      const { createClient } = await import("@supabase/supabase-js");

      const db = createClient(
        env.SUPABASE_URL!,
        env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: tenant } = await db
        .from("tenants")
        .insert({
          name: "Email Report Cafe",
          vertical: "cafe",
          timezone: "UTC",
          email_daily_report: true,
          daily_report_recipient_email: "owner@testcafe.example.com",
        })
        .select("id")
        .single();

      if (!tenant) throw new Error("Could not create test tenant");
      const tenantId = tenant.id as string;

      try {
        const emailSpy = vi.fn().mockResolvedValue({ id: "mock-email-id" });

        const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(
          new Date(Date.now() - 86_400_000)
        );

        await processRollup({ tenant_id: tenantId, date: yesterday }, { emailFn: emailSpy });

        expect(emailSpy).toHaveBeenCalledOnce();
        expect(emailSpy.mock.calls[0]![0].to).toBe("owner@testcafe.example.com");
        expect(emailSpy.mock.calls[0]![0].subject).toContain(yesterday);
      } finally {
        await db.from("tenants").delete().eq("id", tenantId);
      }
    }
  );

  it.skipIf(noDb)(
    "idempotency — running rollup twice for the same date produces one reports_daily row",
    async () => {
      const { processRollup } = await import("./end-of-day-rollup.js");
      const { createClient } = await import("@supabase/supabase-js");

      const db = createClient(
        env.SUPABASE_URL!,
        env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: tenant } = await db
        .from("tenants")
        .insert({ name: "Idempotent Cafe", vertical: "cafe", timezone: "UTC" })
        .select("id")
        .single();

      if (!tenant) throw new Error("Could not create test tenant");
      const tenantId = tenant.id as string;

      const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(
        new Date(Date.now() - 86_400_000)
      );

      try {
        const noopEmail = vi.fn().mockResolvedValue({ id: "noop" });

        await processRollup({ tenant_id: tenantId, date: yesterday }, { emailFn: noopEmail });
        await processRollup({ tenant_id: tenantId, date: yesterday }, { emailFn: noopEmail });

        const { data: rows, error } = await db
          .from("reports_daily")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("date", yesterday)
          .is("location_id", null);

        expect(error).toBeNull();
        expect(rows).toHaveLength(1);
      } finally {
        await db.from("reports_daily").delete().eq("tenant_id", tenantId);
        await db.from("tenants").delete().eq("id", tenantId);
      }
    }
  );
});
