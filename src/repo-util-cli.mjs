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
  [
    "repository",
    "repositories",
    ["fullName"],
    {
      update: {
        description: "update repository attributes",
        executeInstance: async repository => repository.update(properties)
      },
      create: {
        suffix: "<names>",
        description: "create repositories",
        execute: async (provider, names, options) => {
          for (const name of names) {
            await provider.createRepository(name, properties);
          }
        }
      }
    }
  ],
  ["branch", "branches", ["fullName"]],
  ["project", "projects", ["fullName"]],
  ["milestone", "milestones", ["fullName"]],
  ["application", "applications", ["fullName"]],
  [
    "hook",
    "hooks",
    ["url", "events", "active"],
    {
      create: {
        suffix: "<name>",
        description: "create a hook",
        execute: () => {
          console.log("create a hook");
        }
      },
      update: {
        description: "update hook attributes",
        executeInstance: hook => hook.update(properties)
      },
      delete: {
        description: "delete a hook",
        executeInstance: hook => hook.delete()
      },
    }
  ],
  [
    "pull-request",
    "pullRequests",
    ["url"],
    {
      update: {
        description: "update pr attributes",
        executeInstance: pr => pr.update(properties)
      },
      merge: {
        description: "merge the pr",
        executeInstance: pr => pr.merge()
      },
      decline: {
        description: "decline the pr",
        executeInstance: pr => pr.decline()
      }
    }
  ]
]) {
  const command = program.command(`${o[0]} [name...]`);
  command
    .option("--json", "output as json")
    .option("--no-identifier", "do not output identifier, show attributes only")
    .option("-a, --attribute <attributes>", "list attribute", a =>
      a.split(",")
    );
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

  const actions = o[3];

  if (actions) {
    for (const [an, actionOptions] of Object.entries(actions)) {
      if (actionOptions.execute) {
        const command = program.command(
          `${o[0]}-${an} ${actionOptions.suffix}`
        );

        command.action(async (names, options) => {
          await actionOptions.execute(
            await prepareProvider(options),
            names,
            options
          );
        });
      }
      if (actionOptions.executeInstance) {
        command.option(`--${an}`, actionOptions.description);
      }
    }
  }
}

program.parse(process.argv);

function normalize(names) {
  return names.length === 0 ? ["*"] : names;
}

async function list(provider, names, options, slot, attributes, actions) {
  const json = [];

  for await (const object of provider[slot](normalize(names))) {
    if (actions) {
      for (const [name, action] of Object.entries(actions)) {
        if (options[name] && action.executeInstance) {
          await action.executeInstance(object, options);
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
