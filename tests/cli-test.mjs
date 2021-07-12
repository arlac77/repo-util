import test from "ava";
import execa from "execa";

test("cli list branches", async t => {
  const p = await execa(
    "node",
    [
      new URL("../src/repo-util-cli.mjs", import.meta.url).pathname,
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
