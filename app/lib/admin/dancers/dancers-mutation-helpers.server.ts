import { adminDancerCorrectionReasonMessage } from "@/lib/admin/dancers/dancers.shared";

export function validateAdministrativeDancerCorrectionReason(input: {
  correctionReason: string;
  required: boolean;
}) {
  const correctionReason = input.correctionReason.trim();

  if (
    !isCorrectionReasonLengthValid(correctionReason) &&
    (input.required || correctionReason.length > 0)
  ) {
    return {
      ok: false as const,
      fieldError: adminDancerCorrectionReasonMessage,
    };
  }

  return {
    ok: true as const,
    correctionReason,
  };
}

export function toOptionalCorrectionReason(value: string | null) {
  return value && value.length > 0 ? value : null;
}

function isCorrectionReasonLengthValid(reason: string) {
  return reason.length >= 10 && reason.length <= 500;
}
