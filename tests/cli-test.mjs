import test from "ava";
import execa from "execa";

test("cli list branches", async t => {
  const p = await execa(
    "node",
    [
      new URL("../src/repo-util-cli.mjs", import.meta.url).pathname,
      "list-branches",
      "*repository-*"
    ],
    { all: true }
  );

  t.log(p.all);
  console.log(p.all);
  const m = p.all.match(/repository/);
  // t.truthy(m);

  t.is(p.exitCode, 0);
});

test("cli list repositories as json", async t => {
  const p = await execa(
    "node",
    [
      new URL("../src/repo-util-cli.mjs", import.meta.url).pathname,
      "list-repositories",
      "--json",
      "*/*repository*"
    ],
    { all: true }
  );
  t.is(p.exitCode, 0);

  const output = JSON.parse(p.all);
  t.true(output.length > 1);
});
