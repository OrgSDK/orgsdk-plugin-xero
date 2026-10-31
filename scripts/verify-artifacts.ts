import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const slug = "xero";
const staged = join(root, "dist", slug);
const pkg = JSON.parse(await readFile(join(staged, "package.json"), "utf8"));
assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ["zod"]);
assert.equal(pkg.devDependencies, undefined);
assert.equal(pkg.type, "module");
assert.equal(pkg.version, "0.1.0");
const files = await readdir(staged, { recursive: true });
assert(!files.some((path) => /node_modules|tests|@orgsdk/.test(path)));
const release = join(root, "release");
const manifest = JSON.parse(
	await readFile(join(release, `${slug}.manifest.json`), "utf8"),
);
const bundle = await readFile(join(release, `${slug}.mjs`));
assert.equal(
	createHash("sha256").update(bundle).digest("hex"),
	manifest.digest,
);
assert.equal(manifest.distribution, "external");
assert.equal(manifest.slug, slug);
assert.equal(manifest.version, "0.1.0");
assert.equal(manifest.release_metadata.tools.length, 6);
const catalog = JSON.parse(
	await readFile(join(release, `${slug}.catalog.json`), "utf8"),
);
assert.equal(catalog[0].digest, manifest.digest);
assert.equal(catalog[0].configuration_schema.additionalProperties, false);
const notices = await readFile(join(release, `${slug}.notices.txt`), "utf8");
assert(notices.includes("proprietary"));
assert(notices.toLowerCase().includes("zod"));
assert(notices.includes("MIT"));
const isolated = await mkdtemp(join(tmpdir(), `orgsdk-${slug}-artifact-`));
try {
	const path = join(isolated, `${slug}.mjs`);
	await copyFile(join(release, `${slug}.mjs`), path);
	const probe = `const {default: factory} = await import(process.argv[1]);
const module = await factory({stores:{config:{get:async()=>null}}});
if (module.safeFunctions.length !== 6 || module.authProvider || module.httpEndpoints) throw new Error("Unexpected plugin contract");
for (const tool of module.safeFunctions) {
 if (tool.requiredCredentials.length !== 1 || !tool.metadata.readonly) throw new Error("Unexpected read contract");
}`;
	const result = Bun.spawnSync(
		[process.execPath, "--no-env-file", "--eval", probe, path],
		{ cwd: isolated, stdout: "pipe", stderr: "pipe" },
	);
	assert.equal(result.exitCode, 0, new TextDecoder().decode(result.stderr));
} finally {
	await rm(isolated, { recursive: true, force: true });
}
console.log(
	`${slug}: staged runtime dependencies, isolated executable ESM, digest, manifest/catalog and notices verified.`,
);
