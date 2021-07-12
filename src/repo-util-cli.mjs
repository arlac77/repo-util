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

program
  .description(description)
  .version(version)
  .option("--dry", "do not create branch/pull request")
  .option("--trace", "log level trace")
  .option("--debug", "log level debug")
  .option("-d, --define <key=value>", "set option", values =>
    asArray(values).forEach(value => {
      const [k, v] = value.split(/=/);
      setProperty(properties, k, v);
    })
  );

program.command("list-providers").action(async name => {
  const provider = await AggregationProvider.initialize(
    [],
    properties,
    process.env
  );
  console.log(
    [
      ...provider.providers.map(p => `${p.name}: ${JSON.stringify(p.toJSON())}`)
    ].join("\n")
  );
});

program.command("list-repository-groups <name...>").action(async name => {
  const provider = await AggregationProvider.initialize(
    [],
    properties,
    process.env
  );

  for await (const group of provider.repositoryGroups(name)) {
    console.log(group.name);
  }
});

program.command("list-repositories <name...>").action(async name => {
  const provider = await AggregationProvider.initialize(
    [],
    properties,
    process.env
  );

  for await (const repository of provider.repositories(name)) {
    console.log(repository.name);
  }
});

program.command("list-branches <name...>").action(async name => {
  const provider = await AggregationProvider.initialize(
    [],
    properties,
    process.env
  );

  for await (const branch of provider.branches(name)) {
    console.log(branch.fullName);
  }
});

program.parse(process.argv);
