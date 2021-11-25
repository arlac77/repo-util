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

for (const o of [
  ["provider", "providers", ["name"]],
  ["group", "repositoryGroups", ["name"]],
  ["repository", "repositories", ["fullName"]],
  ["branch", "branches", ["fullName"]],
  ["hook", "hooks", ["url"]]
]) {
  program
    .command(`${o[0]} <name...>`)
    .option("--json", "output as json")
    .option("-a, --attribute <attributes>", "list attribute", a => a.split(","))
    .action(async (names, options) =>
      list(
        await prepareProvider(options),
        names,
        options,
        o[1],
        options.attribute ? options.attribute : o[2]
      )
    );
}

program
  .command("pull-request <name...>")
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
  .command("update-repository <name...>")
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
  .command("create-repository <name...>")
  .action(async (names, options) => {
    const provider = await prepareProvider();
    for (const name of names) {
      await provider.createRepository(name, properties);
    }
  });

program.parse(process.argv);

async function list(provider, name, options, slot, attributes) {
  if (options.json) {
    const json = [];
    for await (const object of provider[slot](name)) {
      json.push(object);
    }
    console.log(JSON.stringify(json));
  } else {
    for await (const object of provider[slot](name)) {
      let prefix= "";
      if(object.repository) {
        prefix = object.repository.fullName + ": ";
      }
      for (const a of attributes) {
        console.log(prefix,object[a]);
      }
    }
  }
}
