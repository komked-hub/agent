# Workflows — Initial Draft

## Receipt intake and approval

1. User submits a receipt by an approved source: KakaoTalk, mobile capture, PDF/e-receipt, Drive, or web upload.
2. System records who submitted it and the source reference.
3. System stores or references the original in Google Drive.
4. OCR extracts configured fields and line items.
5. Validation flags missing values, low confidence, and likely duplicates.
6. Reviewer checks the receipt and corrects fields.
7. Approved record receives its configured filename and folder classification.
8. Structured data is sent to the existing accounting system using the confirmed integration method.
9. Job result and audit events are recorded. Failures can be retried or manually rerun by authorized users.

## Filename rule editing

1. Administrator opens finance settings.
2. Administrator adds, edits, removes, or reorders components independently.
3. Initial components: payment date, merchant name, amount, payer.
4. Administrator previews the result with representative test values.
5. Saving the rule is permission-checked and audit-logged.
6. Missing or invalid values follow an explicitly configured policy; the system never fabricates values.

## Page composition editing

1. Administrator opens the authorized page editor.
2. Administrator edits or removes supported page components and sets their order.
3. System validates required structural components and permission scope.
4. Changes are previewed, saved, and audit-logged.

The set of protected structural components is `TBD`.

## Failed job recovery

- Transient connection error: bounded automatic retry with backoff.
- User-correctable error: show actionable reason and allow authorized correction/retry.
- Service outage: alert administrator, preserve job state, resume after service recovery where safe.
- Repeated or unsafe action: stop automatic execution and require human review.
- Emergency stop: administrator pauses the relevant automation; exact scope and resume controls are `TBD`.

## Other P0 workflows

Communication, Briefing, Calendar, Tasks, Analytics, and CRM workflows are in initial scope but require discovery before detailed implementation.
