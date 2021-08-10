#!/usr/bin/env node

import { readFileSync } from "fs";
import program from "commander";
import AggregationProvider from "aggregation-repository-provider";
import { asArray } from "repository-provider";

process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", reason => console.error(reason));

const { version, description } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url).pathname, {
    encoding: "utf8"
  })
);

const properties = {};

async function prepareProvider() {
  return await AggregationProvider.initialize([], properties, process.env);
}

program
  .description(description)
  .version(version)
  .option("--dry", "do not create branch/pull request")
  .option("--trace", "log level trace")
  .option("--debug", "log level debug")
  .option("-d, --define <...key=value>", "set option", values =>
    asArray(values).forEach(value => {
      const [k, v] = value.split(/=/);
      properties[k] = v;
    })
  );

program
  .command("list-providers")
  .option("--json", "output as json")
  .action(async options => {
    const provider = await prepareProvider();
    console.log(
      [
        ...provider.providers.map(
          p => `${p.name}: ${JSON.stringify(p.toJSON())}`
        )
      ].join("\n")
    );
  });

program.command("list-repository-groups <name...>").action(async name => {
  const provider = await prepareProvider();

  for await (const group of provider.repositoryGroups(name)) {
    console.log(group.name);
  }
});

program
  .command("list-hooks <name...>")
  .option("--json", "output as json")
  .action(async (name, options) => {
    const provider = await prepareProvider();

    if (options.json) {
      const json = [];

      for await (const repository of provider.repositories(name)) {
        const r = { name: repository.fullName, hooks: [] };
        for await (const hook of repository.hooks()) {
          r.hooks.push(hook);
        }

        if (r.hooks.length > 0) {
          json.push(r);
        }
      }
      console.log(JSON.stringify(json));
    } else {
      for await (const repository of provider.repositories(name)) {
        for await (const hook of repository.hooks()) {
          console.log(repository.fullName);
          console.log("  " + hook.url);
        }
      }
    }
  });

program
  .command("list-branches <name...>")
  .option("--json", "output as json")
  .action(async name => {
    const provider = await prepareProvider();

    for await (const branch of provider.branches(name)) {
      console.log(branch.fullName);
    }
  });

program
  .command("list-pull-requests <name...>")
  .option("--json", "output as json")
  .action(async name => {
    const provider = await prepareProvider();

    for await (const repository of provider.repositories(name)) {
      for await (const pr of repository.pullRequestClass.list(repository)) {
        console.log(`${pr.identifier}: ${pr.url}`);
      }
    }
  });

program
  .command("list-repositories <name...>")
  .option("--json", "output as json")
  .action(async (name, options) => {
    const provider = await prepareProvider();

    if (options.json) {
      const json = [];
      for await (const repository of provider.repositories(name)) {
        json.push(repository);
      }
      console.log(JSON.stringify(json));
    } else {
      for await (const repository of provider.repositories(name)) {
        console.log(repository.name);
      }
    }
  });

program
  .command("update-repositories <names...>")
  .action(async (names, options) => {
    const provider = await prepareProvider();
    for await (const repository of provider.repositories(name)) {
      for (const [k, v] of Object.entries(properties)) {
        repository[k] = v;
      }
      await repository.update();
    }
  });

program
  .command("create-repositories <names...>")
  .action(async (names, options) => {
    const provider = await prepareProvider();
    for (const name of names) {
      await provider.createRepository(name, properties);
    }
  });

program.parse(process.argv);
