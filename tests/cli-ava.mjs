import test from "ava";
import { execa } from "execa";

test("cli list provider", async t => {
  const p = await execa("node", [
    new URL("../src/repo-util-cli.mjs", import.meta.url).pathname,
    "provider"
  ]);

  const m = p.stdout.match(/github:/);
  t.truthy(m);

  t.is(p.exitCode, 0);
});

test.serial("cli list branches", async t => {
  const p = await execa("node", [
    new URL("../src/repo-util-cli.mjs", import.meta.url).pathname,
    "branch",
    "*repository-*"
  ]);

  const m = p.stdout.match(/repository/);
  // t.truthy(m);

  t.is(p.exitCode, 0);
});

test.serial("cli list repositories as json", async t => {
  const p = await execa("node", [
    new URL("../src/repo-util-cli.mjs", import.meta.url).pathname,
    "repository",
    "--json",
    "*/*repository*"
  ]);

  t.is(p.exitCode, 0);

  t.log(p.stdout);
  const output = JSON.parse(p.stdout);
  t.true(Array.isArray(output));
});
