# Xero invoice readiness for OrgSDK

Apache-2.0 external plugin. Reads one explicitly configured Xero organisation to supply source evidence for reviewed drafts in OrgSDK. It never creates, edits, sends, authorises, voids, deletes, uploads, downloads files, or pays invoices.

## Install in OrgSDK

Open your project's Plugins page, select this plugin and enable the pinned release.
The default catalogue is https://orgsdk.ai/plugins/releases.json. The executor
downloads the versioned bundle and verifies its SHA256. Configure the provider
and attach the credential described below before running an action.

The plugin is Apache-2.0 licensed; see LICENSE, NOTICE and TRADEMARKS.md.
The generated npm distribution is a separate publication surface. Installing npm
files alone does not register a project plugin. Local builds do not publish it.

## Setup

1. Obtain an OAuth access token with your own Xero application outside OrgSDK. On the released OrgSDK 0.1.0 host, Xero tokens must be managed and renewed externally; native Xero consent and refresh are not available in that version.
2. Grant `accounting.invoices.read accounting.contacts.read accounting.attachments.read`. If the external token manager needs refresh tokens, also request `offline_access`. This plugin performs no token exchange or refresh.
3. Attach the resulting `xero-oauth` credential to the plugin. The runtime injects `{ "xero-oauth": { "secret_accessToken": "..." } }`; never put access/refresh/client secrets in plugin configuration, action arguments or source.
4. Use trusted setup tooling outside this plugin to read `GET https://api.xero.com/connections` with your authorised Xero connection. Identify the intended `ORGANISATION` and manually configure its exact `tenantId` UUID. There is no tenant chooser in the current platform. Keep the access token in the setup credential; never put it in OrgSDK action arguments. Example plugin configuration:

   ```json
   { "tenantId": "70784a63-d24b-46a9-a4db-0e70a274b056", "timeoutMs": 15000 }
   ```

5. Run `xero.verifyConnection({})`. It returns only the selected connected `ORGANISATION`. Every accounting read checks `/connections` again and rejects an unconnected or different tenant. Tenant IDs cannot be overridden through tool arguments.

## Tools and review workflow

All calls use one named argument object, and return provider-style projected records. Exact TypeScript declarations ship with each tool.

| Function                 | Arguments                                                    | Evidence                                                                                                         |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `verifyConnection`       | `{}`                                                         | Selected connection and organisation name                                                                        |
| `listInvoices`           | `{ from, to, status?, type?, contactId?, page?, pageSize? }` | Invoice/bill IDs, numbers, references, status, dates, currency, totals, due/paid/credited amounts and line items |
| `getInvoice`             | `{ invoiceId }`                                              | One invoice or bill, with its available line items                                                               |
| `listContacts`           | `{ page?, pageSize? }`                                       | Contact identities and billing addresses                                                                         |
| `getContact`             | `{ contactId }`                                              | One contact's billing identity                                                                                   |
| `listInvoiceAttachments` | `{ invoiceId }`                                              | File ID, name, MIME type and size; no URLs or bytes                                                              |

`from`/`to` are inclusive invoice dates in `YYYY-MM-DD`, ordered and at most 366 calendar days. `type` is `ACCREC` (sales invoice) or `ACCPAY` (purchase bill). Optional status is `DRAFT`, `SUBMITTED`, `AUTHORISED`, `PAID`, `VOIDED` or `DELETED`. IDs must be UUIDs. Unknown arguments are rejected.

```ts
const connection = await xero.verifyConnection({});
const existing = await xero.listInvoices({
	from: "2026-10-01",
	to: "2026-10-30",
	type: "ACCREC",
	pageSize: 50,
});
// Match external work references to InvoiceNumber/Reference/LineItems.
// Record ambiguities and missing evidence in an OrgSDK review draft.
```

A list call fetches one page only, `page` 1..10000 and `pageSize` 1..100 (default 50). `nextPage` is a conservative continuation when a full page is returned; `mayHaveMore` explicitly marks uncertainty. A final full page may require one empty request. If `mayHaveMore` is true with `nextPage` null, the page ceiling was reached: narrow the date window or contact filter and do not claim a complete reconciliation. Mutable source records can shift between pages, so this is not a transactional snapshot.

Provider text is untrusted source content. Totals retain Xero's currency and line amount type; do not combine currencies or infer tax treatment. Documented numeric-string amounts are validated and normalized to numbers; optional fields preserve provider omission and nulls. Contact bank details and public invoice URLs are excluded. Attachment metadata is capped at 100 records and requires the separate attachment scope. Attachment download is intentionally absent in this release.

## Boundaries and validation

Only `https://api.xero.com/connections` and allowlisted Accounting API invoice/contact GET paths are reachable. Redirects are rejected, bodies are streamed under a 2 MiB ceiling, each HTTP request has a 15s default deadline (configurable 1..30s), pages and nested arrays are bounded. A tool does at most two sequential HTTP reads, so the overall deadline is at most twice the configured request timeout. Errors contain safe status/context, never raw provider bodies, access tokens, credential values or network errors. No automatic retries conceal rate limits. Secrets have no environment-variable fallback.

```sh
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run test
bun run validate
bun run package
bun run version-guard
```

`bun run package` creates the authoring SDK artifact in `dist/`. For the active local runtime, use the separate executable ESM packager from a platform checkout:

```sh
bun --no-env-file /absolute/path/to/orgsdk-platform/runtime/src/cli.ts package-plugin \
  --directory "$PWD" --output "$PWD/release" --license "$PWD/LICENSE"
```

The `release/` result is self-contained and suitable for the active runtime's external plugin loader; it is distinct from the historical catalog artifact in `dist/`. Both outputs are ignored by Git. Package twice and compare hashes before distribution. The source repository carries a gated npm publication workflow. Publication and catalogue deployment are separate from local builds.

Tests use synthetic representative fixtures and mocked HTTP transport. No customer credentials or live Xero account has been used. Unit/contract checks do not establish provider account permissions, live OAuth acceptance or production readiness.

## Official references

Verified 30 October 2026:

- [Current scopes and granular mapping](https://developer.xero.com/documentation/guides/oauth2/scopes/): `accounting.invoices.read` covers GET invoice resources, including bills; contacts and attachments keep their separate read scopes.
- [Broad scope deprecation changelog](https://developer.xero.com/changelog): new granular scopes replace `accounting.transactions.read`.
- [Auth code flow](https://developer.xero.com/documentation/guides/oauth2/auth-flow/) and [token refresh](https://developer.xero.com/documentation/guides/oauth2/token-types/).
- [Tenants and `/connections`](https://developer.xero.com/documentation/guides/oauth2/tenants/).
- [Invoices and attachments](https://developer.xero.com/documentation/api/accounting/invoices) and [contacts](https://developer.xero.com/documentation/api/accounting/contacts).
- [Official Accounting OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml), used for paths, fields and paging. Its legacy transaction scope annotations lag the current scopes page; the current granular scope documentation governs setup.
