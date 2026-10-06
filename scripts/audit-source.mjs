// Basic source-hygiene check, not a substitute for security review.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root, encoding: "utf8",
}).split("\0").filter(Boolean);

const checks = [
  ["absolute personal home directory", /\/(?:Users|home)\/[^\s/\\'"<>]+/],
  ["Windows personal home directory", /\b[A-Za-z]:\\Users\\[^\s\\/]+/i],
  ["GitHub credential", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["API credential", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
];
const blockedNames = /(?:^|\/)(?:\.env(?:\..*)?|\.DS_Store|Cookies|Login Data|Preferences|Secure Preferences|.*\.har|.*\.pem)$/i;
let failures = 0;
for (const path of new Set(paths)) {
  if (blockedNames.test(path)) {
    console.error("Disallowed source artifact:", path);
    failures++;
  }
  const bytes = await readFile(resolve(root, path));
  // PNG/image payloads are binary. Asset metadata needs separate release review.
  if (bytes.includes(0)) continue;
  const lines = bytes.toString("utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    for (const [label, pattern] of checks) {
      if (pattern.test(line)) {
        // Report location only, never echo a potentially sensitive value.
        console.error(path + ":" + (index + 1) + ": " + label);
        failures++;
      }
    }
  }
}
if (failures) process.exitCode = 1;
else console.log("Source hygiene: PASS (" + new Set(paths).size + " files; common paths, credentials and email patterns).");
