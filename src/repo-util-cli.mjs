#!/usr/bin/env node

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { program, Option } from "commander";
import AggregationProvider from "aggregation-repository-provider";

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const { version, description } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), {
    encoding: "utf8"
  })
);

const properties = {};

program
  .description(description)
  .version(version)
  .option("--trace", "log level trace")
  .option("--debug", "log level debug")
  .option("-D --define <a=b>", "define property", str =>
    Object.assign(properties, Object.fromEntries([str.split(/=/)]))
  );

for (const o of [
  [
    "provider",
    "providers",
    ["fullName", ...Object.keys(visibleAttributes(AggregationProvider))]
  ],
  ["group", "repositoryGroups", ["fullName"]],
  ["repository", "repositories", ["fullName"]],
  ["branch", "branches", ["fullName"]],
  ["project", "projects", ["fullName"]],
  ["milestone", "milestones", ["fullName"]],
  [
    "hook",
    "hooks",
    ["url", "events", "active"],
    { create: { description: "create a hook", execute: () => {} } }
  ],
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
    .option("--no-identifier", "do not output identifier attributes only")
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
        for (const a of attributes) {
          let value = object[a];
          if (Array.isArray(value)) {
            value = value.join(" ");
          } else if (value instanceof Set) {
            value = [...value].join(" ");
          } else if (value === undefined) {
            value = "";
          }

          if (options.identifier === false) {
            console.log(value);
          } else {
            console.log(
              attributes.indexOf(a) === 0
                ? object.fullName + ":"
                : "             ".substring(a.length) + a + ":",
              value
            );
          }
        }
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify(json));
  }
}

async function prepareProvider(options) {
  const provider = await AggregationProvider.initialize(
    [],
    properties,
    process.env
  );

  provider.messageDestination = {
    trace: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error
  };

  return provider;
}

function visibleAttributes(object) {
  return Object.fromEntries(
    Object.entries(object.attributes).filter(
      ([k, v]) => k !== "name" && !v.private
    )
  );
}
