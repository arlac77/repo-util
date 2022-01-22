#!/usr/bin/env node

import { readFileSync } from "fs";
import program, { Option } from "commander";
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
  .option("-D --define <a=b>", "define property", str =>
    Object.assign(properties, Object.fromEntries([str.split(/=/)]))
  );

for (const o of [
  ["provider", "providers", ["name"]],
  ["group", "repositoryGroups", ["name"]],
  ["repository", "repositories", ["fullName"]],
  ["branch", "branches", ["fullName"]],
  ["hook", "hooks", ["url"]],
  [
    "pull-request",
    "pullRequests",
    ["url"],
    { merge: { description: "merge the pr", execute: pr => pr.merge() } }
  ]
]) {
  const command = program.command(`${o[0]} [name...]`);

  command
    .option("--json", "output as json")
    .option("-a, --attribute <attributes>", "list attribute", a =>
      a.split(",")
    );

  const actions = o[3];

  if (actions) {
    for (const [an, options] of Object.entries(actions)) {
      command.addOption(new Option(`--${an}`, options.description));
    }
  }

  command.action(async (names, options) =>
    list(
      await prepareProvider(options),
      names,
      options,
      o[1],
      options.attribute ? options.attribute : o[2],
      actions
    )
  );
}

program
  .command("create-repository <name...>")
  .action(async (names, options) => {
    const provider = await prepareProvider();
    for (const name of names) {
      await provider.createRepository(name, properties);
    }
  });

program.parse(process.argv);

function normalize(names) {
  return names.length === 0 ? ["*"] : names;
}

async function list(provider, names, options, slot, attributes, actions) {
  const json = [];

  for await (const object of provider[slot](normalize(names))) {
    if (actions) {
      for (const [name, action] of Object.entries(actions)) {
        if (options[name]) {
          await action.execute();
        }
      }
    }
    // modify
    if (Object.keys(properties).length > 0) {
      for (const [k, v] of Object.entries(properties)) {
        object[k] = v;
      }
      await object.update();
    } else {
      if (options.json) {
        json.push(object);
      } else {
        let prefix = "";
        if (object.repository) {
          prefix = object.repository.fullName + ": ";
        }
        for (const a of attributes) {
          console.log(prefix, object[a]);
        }
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify(json));
  }
}
