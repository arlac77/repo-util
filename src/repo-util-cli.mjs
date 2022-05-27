#!/usr/bin/env node

import { readFileSync } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { program } from "commander";
import levelup from "levelup";
import leveldown from "leveldown";
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
import AggregationProvider from "aggregation-repository-provider";
import { ETagCacheLevelDB } from "etag-cache-leveldb";

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const { version, description } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), {
    encoding: "utf8"
  })
);

async function createCache()
{
  const dir = join(homedir(), ".cache/repository-provider");
  await mkdir(dir,{ recursive: true });
  const db = await levelup(leveldown(dir));
  return new ETagCacheLevelDB(db);
}

createCache();

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
