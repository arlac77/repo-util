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

const { provider, cache } = await initializeRepositoryProvider(program);

for (const t of [
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
  const command = program.command(`${t.name} [name...]`);

  const actions = t.actions;

  command.action(async (names, options) =>
    list(
      provider,
      names,
      t,
      actions
    )
  );

  if (actions) {
    for (const [an, actionOptions] of Object.entries(actions)) {
      if (actionOptions.execute) {
        const command = program.command(
          `${t.name}-${an} ${actionOptions.suffix}`
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

async function list(provider, names, type, actions) {
  const options = program.optsWithGlobals();

  const json = [];

  for await (const object of provider[type.collectionName](normalize(names))) {
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
      listAttributes(object, options.attribute || type.attributes, options);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(json));
  }

  if (options.statistics && cache) {
    console.error(cache.statistics);
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
  return {
    name: clazz.type,
    collectionName: clazz.collectionName,
    attributes: ["fullName", ...Object.keys(visibleAttributes(clazz))],
    actions: {
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
  };
}
