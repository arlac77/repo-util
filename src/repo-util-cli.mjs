#!/usr/bin/env node

import { program } from "commander";
import {
  Repository,
  RepositoryGroup,
  Branch,
  Tag,
  Application,
  Project,
  Milestone,
  Hook,
  PullRequest,
  MultiGroupProvider
} from "repository-provider";
import pkg from "../package.json" assert { type: "json" };
import { initializeRepositoryProvider } from "./setup-provider.mjs";

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const properties = {};

program
  .description(pkg.description)
  .version(pkg.version)
  .option("--no-cache", "cache requests")
  .option("--statistics", "show cache statistics")
  .option("--trace", "log level trace")
  .option("--debug", "log level debug")
  .option(
    "--no-identifier",
    "do not output identifier, show attribute values only"
  )
  .option("-a, --attribute <attributes>", "list attribute", a => a.split(","))
  .option("--no-undefined", "do not output undefined attribute values")
  .option("--json", "output as json")
  .option("-D --define <a=b>", "define property", str =>
    Object.assign(properties, Object.fromEntries([str.split(/=/)]))
  );

const { provider } = await initializeRepositoryProvider(program);

for (const o of [
  type(MultiGroupProvider),
  type(RepositoryGroup),
  type(Repository, {
    create: {
      suffix: "<names>",
      description: "create repositories",
      execute: async (provider, names, options) => {
        for (const name of names) {
          await provider.createRepository(name, properties);
        }
      }
    }
  }),
  type(Branch),
  type(Tag),
  type(Project),
  type(Milestone),
  type(Application),
  type(Hook, {
    create: {
      suffix: "<name>",
      description: "create a hook",
      execute: () => {
        console.log("create a hook");
      }
    },
    delete: {
      description: "delete a hook",
      executeInstance: hook => hook.delete()
    }
  }),
  type(PullRequest, {
    merge: {
      description: "merge the pr",
      executeInstance: pr => pr.merge()
    },
    decline: {
      description: "decline the pr",
      executeInstance: pr => pr.decline()
    }
  })
]) {
  const command = program.command(`${o[0]} [name...]`);

  command.action(async (names, options) =>
    list(
      provider,
      names,
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
          await actionOptions.execute(provider, names, options);
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

function listAttributes(object, attributes, options) {
  const values = {};
  let maxKeyLength = 0;

  for (const a of attributes) {
    let value = object[a];
    if (Array.isArray(value)) {
      value = value.join(" ");
    } else if (value instanceof Set) {
      value = [...value].join(" ");
    } else if (value === undefined) {
      if (options["undefined"]) value = "";
    }

    if (a.length > maxKeyLength) {
      maxKeyLength = a.length;
    }

    values[a] = value;
  }

  for (const [k, v] of Object.entries(values)) {
    if (options.identifier) {
      console.log(" ".repeat(maxKeyLength - k.length + 2) + k + `: ${v}`);
    } else {
      console.log(v);
    }
  }
}

async function list(provider, names, slot, attributes, actions) {
  const options = program.optsWithGlobals();

  const json = [];

  for await (const object of provider[slot](normalize(names))) {
    if (actions) {
      for (const [name, action] of Object.entries(actions)) {
        if (options[name] && action.executeInstance) {
          await action.executeInstance(object, options);
        }
      }
    }

    if (options.json) {
      json.push(object);
    } else {
      if (options.identifier) {
        console.log(`${object.fullName}:`);
      }
      listAttributes(object, attributes, options);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(json));
  }

  if (options.statistics) {
    console.error(provider._providers[0].cache.statistics);
  }
}

function visibleAttributes(object) {
  return Object.fromEntries(
    Object.entries(object.attributes).filter(
      ([k, v]) => k !== "name" && !v.private
    )
  );
}

function type(clazz, extra) {
  return [
    clazz.type,
    clazz.collectionName,
    ["fullName", ...Object.keys(visibleAttributes(clazz))],
    {
      update: {
        description: `update ${clazz.type} attributes`,
        executeInstance: object => {
          for (const [k, v] of Object.entries(properties)) {
            object[k] = v;
          }

          object.update();
        }
      },
      ...extra
    }
  ];
}
