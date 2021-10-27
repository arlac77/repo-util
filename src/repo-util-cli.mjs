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
  .command("providers")
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

for (const o of [
  ["repository-group", "repositoryGroups", "name"],
  ["repository", "repositories", "name"],
  ["branch", "branches", "fullName"]
]) {
  program
    .command(`${o[0]} <names...>`)
    .option("--json", "output as json")
    .action(async (names, options) =>
      list(await prepareProvider(options), names, options, o[1], o[2])
    );
}

program
  .command("hooks <name...>")
  .option("--json", "output as json")
  .action(async (names, options) => {
    const provider = await prepareProvider();

    if (options.json) {
      const json = [];

      for await (const repository of provider.repositories(names)) {
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
      for await (const repository of provider.repositories(names)) {
        for await (const hook of repository.hooks()) {
          console.log(repository.fullName);
          console.log("  " + hook.url);
        }
      }
    }
  });

program
  .command("pull-request <names...>")
  .option("--json", "output as json")
  .option("--merge", "merge the pr")
  .action(async (names, options) => {
    const provider = await prepareProvider();

    const json = [];

    for await (const repository of provider.repositories(names)) {
      if (!repository.isArchived) {
        for await (const pr of repository.pullRequestClass.list(repository)) {
          if (options.json) {
            json.push(pr);
          } else {
            console.log(`${pr.identifier}: ${pr.url}`);
          }
          if (options.merge) {
            await pr.merge();
          }
        }
      }
    }

    if (options.json) {
      console.log(JSON.stringify(json));
    }
  });

program
  .command("update-repository <names...>")
  .action(async (names, options) => {
    const provider = await prepareProvider();
    for await (const repository of provider.repositories(names)) {
      for (const [k, v] of Object.entries(properties)) {
        repository[k] = v;
      }
      await repository.update();
    }
  });

program
  .command("create-repository <names...>")
  .action(async (names, options) => {
    const provider = await prepareProvider();
    for (const name of names) {
      await provider.createRepository(name, properties);
    }
  });

program.parse(process.argv);

async function list(provider, name, options, slot, nameAttribute = "name") {
  if (options.json) {
    const json = [];
    for await (const object of provider[slot](name)) {
      json.push(object);
    }
    console.log(JSON.stringify(json));
  } else {
    for await (const object of provider[slot](name)) {
      console.log(object[nameAttribute]);
    }
  }
}
