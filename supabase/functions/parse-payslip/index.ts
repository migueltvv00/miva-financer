import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const VALIDATION_TOLERANCE_CENTS = 10;
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const EXTRACTION_PROMPT = `This is a Portuguese payslip (recibo de vencimento).
Extract the following and respond ONLY with valid JSON, no markdown, no extra text:
{
  "month": "YYYY-MM",
  "gross_salary_cents": integer (vencimento base + subsidios, in euro cents),
  "irs_withheld_cents": integer (retenção IRS, in cents),
  "ss_employee_cents": integer (quota trabalhador SS ~11%, in cents),
  "other_deductions_cents": integer (all other deductions combined, in cents),
  "net_salary_cents": integer (vencimento líquido, in cents),
  "employer_name": string or null,
  "employee_name": string or null,
  "meal_card_cents": integer or null (subsídio de refeição / cartão refeição value in euro cents, null if not found on payslip),
  "total_gross_cents": integer or null (total ilíquido / remuneração bruta before all deductions in euro cents, null if same as gross_salary_cents)
}
Rules:
- All amounts in euro cents (multiply euros by 100).
- If a field is not visible on the document use 0 for numeric fields, null for strings.
- Do NOT estimate or calculate — only extract values explicitly printed on the document.
- Treat decimal comma as separator (1.234,56 = 1234.56€ = 123456 cents).`;

function log(op: string, status: string, userId: string | null, detail?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      fn: "parse-payslip",
      op,
      status,
      user_id: userId,
      ...(detail ? { detail } : {}),
    })
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

interface ExtractedPayslip {
  month: string;
  gross_salary_cents: number;
  irs_withheld_cents: number;
  ss_employee_cents: number;
  other_deductions_cents: number;
  net_salary_cents: number;
  employer_name: string | null;
  employee_name: string | null;
  meal_card_cents: number | null;
  total_gross_cents: number | null;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: {
    message?: string;
  };
}

function getBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);

  if (objectMatch && objectMatch[0] !== trimmed) {
    candidates.push(objectMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next fallback candidate.
    }
  }

  throw new Error("Gemini returned invalid JSON");
}

function parseIntegerField(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  throw new Error(`Invalid field: ${fieldName}`);
}

function parseNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  throw new Error(`Invalid field: ${fieldName}`);
}

function parseMonth(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid field: month");
  }

  const trimmed = value.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    throw new Error("Invalid field: month");
  }

  return trimmed;
}

function parseOptionalIntegerField(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function parseExtractedPayslip(text: string): ExtractedPayslip {
  const payload = parseJsonRecord(text);

  return {
    month: parseMonth(payload.month),
    gross_salary_cents: parseIntegerField(payload.gross_salary_cents, "gross_salary_cents"),
    irs_withheld_cents: parseIntegerField(payload.irs_withheld_cents, "irs_withheld_cents"),
    ss_employee_cents: parseIntegerField(
      payload.ss_employee_cents ?? payload.ss_withheld_cents,
      "ss_employee_cents"
    ),
    other_deductions_cents: parseIntegerField(
      payload.other_deductions_cents,
      "other_deductions_cents"
    ),
    net_salary_cents: parseIntegerField(payload.net_salary_cents, "net_salary_cents"),
    employer_name: parseNullableString(payload.employer_name, "employer_name"),
    employee_name: parseNullableString(payload.employee_name, "employee_name"),
    meal_card_cents: parseOptionalIntegerField(payload.meal_card_cents),
    total_gross_cents: parseOptionalIntegerField(payload.total_gross_cents),
  };
}

function extractGeminiText(response: GeminiResponse): string {
  const text = response.candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.text === "string"
  )?.text;

  if (!text) {
    throw new Error(response.error?.message || "Gemini response did not contain extractable text");
  }

  return text;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function buildValidationError(extracted: ExtractedPayslip): { deltaCents: number; message: string | null } {
  const calculatedNet =
    extracted.gross_salary_cents -
    extracted.irs_withheld_cents -
    extracted.ss_employee_cents -
    extracted.other_deductions_cents;
  const deltaCents = calculatedNet - extracted.net_salary_cents;

  if (Math.abs(deltaCents) <= VALIDATION_TOLERANCE_CENTS) {
    return { deltaCents, message: null };
  }

  return {
    deltaCents,
    message: `Gross (${formatEuro(extracted.gross_salary_cents)}) - IRS (${formatEuro(
      extracted.irs_withheld_cents
    )}) - SS (${formatEuro(extracted.ss_employee_cents)}) - Other (${formatEuro(
      extracted.other_deductions_cents
    )}) = ${formatEuro(calculatedNet)}, but net is ${formatEuro(extracted.net_salary_cents)}. Δ = ${formatEuro(
      Math.abs(deltaCents)
    )}`,
  };
}

function parseForceFlag(value: FormDataEntryValue | null): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

Deno.serve(async (req: Request) => {
  log("request", "start", null, { method: req.method });

  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    log("request", "error", null, { reason: "method_not_allowed", method: req.method });
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let userId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey || !geminiApiKey) {
      log("config", "error", null, { reason: "missing_env" });
      return jsonResponse({ error: "Missing environment configuration" }, 500);
    }

    const jwt = getBearerToken(req.headers.get("Authorization"));
    if (!jwt) {
      log("auth", "error", null, { reason: "missing_jwt" });
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(jwt);

    if (authError || !user) {
      log("auth", "error", null, { reason: "jwt_invalid" });
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    userId = user.id;
    log("auth", "ok", userId);

    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      log("file", "error", userId, { reason: "invalid_content_type", content_type: contentType });
      return jsonResponse({ error: "Content-Type must be multipart/form-data" }, 400);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (error) {
      log("file", "error", userId, {
        reason: "invalid_multipart_body",
        message: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: "Invalid multipart form data" }, 400);
    }

    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      log("file", "error", userId, { reason: "missing_file" });
      return jsonResponse({ error: 'Missing "file" PDF upload' }, 400);
    }

    if (fileValue.type !== "application/pdf") {
      log("file", "error", userId, {
        reason: "invalid_file_type",
        mime_type: fileValue.type || null,
      });
      return jsonResponse({ error: "File must be a PDF" }, 400);
    }

    if (fileValue.size > MAX_FILE_SIZE_BYTES) {
      log("file", "error", userId, { reason: "file_too_large", size_bytes: fileValue.size });
      return jsonResponse({ error: "File must be 10MB or smaller" }, 400);
    }

    log("file", "ok", userId, {
      mime_type: fileValue.type,
      size_bytes: fileValue.size,
    });

    const fileBytes = new Uint8Array(await fileValue.arrayBuffer());
    const fileBase64 = bytesToBase64(fileBytes);
    const force = parseForceFlag(formData.get("force"));

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    log("gemini", "start", userId, { model: GEMINI_MODEL, file_size_bytes: fileBytes.length });
    const geminiStartedAt = Date.now();

    let geminiPayload: GeminiResponse;
    let geminiText: string;

    try {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: "application/pdf",
                      data: fileBase64,
                    },
                  },
                  { text: EXTRACTION_PROMPT },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const durationMs = Date.now() - geminiStartedAt;

      if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.text();
        log("gemini", "error", userId, {
          duration_ms: durationMs,
          status_code: geminiResponse.status,
          model: GEMINI_MODEL,
          error_preview: errorBody.slice(0, 500),
        });
        return jsonResponse({
          error: "Gemini extraction failed",
          geminiStatus: geminiResponse.status,
          detail: errorBody.slice(0, 200),
        }, 502);
      }

      geminiPayload = (await geminiResponse.json()) as GeminiResponse;
      geminiText = extractGeminiText(geminiPayload);
      log("gemini", "ok", userId, { duration_ms: durationMs, model: GEMINI_MODEL });

      // Fire-and-forget usage tracking
      try {
        await supabase.from("gemini_usage").insert({
          user_id: userId,
          model: GEMINI_MODEL,
          fn_name: "parse-payslip",
          date: new Date().toISOString().slice(0, 10),
          tokens_in: geminiPayload.usageMetadata?.promptTokenCount ?? 0,
          tokens_out: geminiPayload.usageMetadata?.candidatesTokenCount ?? 0,
        });
      } catch {
        // Never let tracking failure affect the main flow
      }
    } catch (error) {
      const durationMs = Date.now() - geminiStartedAt;
      log("gemini", "error", userId, {
        duration_ms: durationMs,
        model: GEMINI_MODEL,
        message: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({
        error: "Gemini extraction failed",
        detail: error instanceof Error ? error.message : String(error),
      }, 502);
    }

    let extracted: ExtractedPayslip;
    try {
      extracted = parseExtractedPayslip(geminiText);
    } catch (error) {
      log("extraction", "error", userId, {
        message: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: "Invalid extraction response from Gemini" }, 502);
    }

    log("extraction", "ok", userId, {
      month: extracted.month,
      gross_salary_cents: extracted.gross_salary_cents,
      irs_withheld_cents: extracted.irs_withheld_cents,
      ss_employee_cents: extracted.ss_employee_cents,
      other_deductions_cents: extracted.other_deductions_cents,
      net_salary_cents: extracted.net_salary_cents,
      meal_card_cents: extracted.meal_card_cents,
      total_gross_cents: extracted.total_gross_cents,
    });

    const validation = buildValidationError(extracted);
    const needsReview = validation.message !== null;

    log("validation", needsReview ? "needs_review" : "ok", userId, {
      delta_cents: validation.deltaCents,
    });

    const monthDate = `${extracted.month}-01`;

    const { data: existingImport, error: duplicateError } = await supabase
      .from("payslip_imports")
      .select(
        "id, filename, month, gross_salary_cents, irs_withheld_cents, ss_withheld_cents, other_deductions_cents, net_salary_cents, employer_name, source, status, created_at"
      )
      .eq("user_id", userId)
      .eq("month", monthDate)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (duplicateError) {
      log("duplicate", "error", userId, { message: duplicateError.message, month: extracted.month });
      return jsonResponse({ error: "Failed to check existing payslip imports" }, 500);
    }

    if (existingImport && !force) {
      log("duplicate", "found", userId, { month: extracted.month, existing_id: existingImport.id });
      return jsonResponse({ duplicate: true, existing: existingImport }, 409);
    }

    const { data: insertedImport, error: insertError } = await supabase
      .from("payslip_imports")
      .insert({
        user_id: userId,
        filename: fileValue.name || "payslip.pdf",
        month: monthDate,
        gross_salary_cents: extracted.gross_salary_cents,
        irs_withheld_cents: extracted.irs_withheld_cents,
        ss_withheld_cents: extracted.ss_employee_cents,
        other_deductions_cents: extracted.other_deductions_cents,
        net_salary_cents: extracted.net_salary_cents,
        employer_name: extracted.employer_name,
        meal_card_cents: extracted.meal_card_cents,
        total_gross_cents: extracted.total_gross_cents,
        raw_gemini_response: geminiPayload,
        source: "upload",
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !insertedImport) {
      log("db_insert", "error", userId, {
        message: insertError?.message || "Unknown insert error",
        month: extracted.month,
      });
      return jsonResponse({ error: "Failed to store payslip import" }, 500);
    }

    log("db_insert", "ok", userId, {
      payslip_import_id: insertedImport.id,
      month: extracted.month,
      needs_review: needsReview,
    });

    return jsonResponse({
      payslip_import_id: insertedImport.id,
      extracted,
      needsReview,
      validationError: validation.message,
    });
  } catch (error) {
    log("request", "error", userId, {
      reason: "unexpected_error",
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
