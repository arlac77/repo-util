#!/usr/bin/env -S node --no-warnings --title repo-util
import { program } from "commander";
import { attributeIterator } from "pacc";
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
import {
  initializeRepositoryProvider,
  initializeCommandLine
} from "repository-provider-cli-support";
import pkg from "../package.json" with { type: "json" };

const properties = {};
let action;

initializeCommandLine(program);

program
  .description(pkg.description)
  .version(pkg.version)
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
  type(MultiGroupProvider, {
    "create-repository": {
      suffix: "<names>",
      description: "create repositories",
      execute: async (provider, names, options) => {
        for (const name of names) {
          await provider.createRepository(name, properties);
        }
      }
    }
  }),
  type(RepositoryGroup),
  type(Repository, {
    "add-hook": {
      suffix: "<names>",
      description: "add a hook",
      prepareCommand(command) {
        command.option("-u, --url <url>", "hook url to be called");
      },
      executeInstance: async (repository, options) => {
        console.log("ADD HOOK");
        console.log(options);
        const hook = new repository.hookClass(repository, "hook1", {
          url: "http://somewere.com/path",
          events: new Set(["a"])
        });

        console.log(hook);
      }
    }
  }),
  type(Branch, {
    "create-pull-request": {
      suffix: "<name>",
      description: "create a pull-request from a branch",
      execute: () => {
        console.log("create a PR");
      }
    }
  }),
  type(Tag),
  type(Project),
  type(Milestone),
  type(Application),
  type(Hook, {
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
  const command = program.command(`${t.name} [name...]` /*,`list ${t.name}`*/);

  const actions = t.actions;

  command.action(async (names, options) => list(provider, names, t, actions));

  if (actions) {
    for (const [an, actionOptions] of Object.entries(actions)) {
      if (actionOptions.execute) {
        const command = program.command(
          `${t.name}-${an} ${actionOptions.suffix}`,
          actionOptions.description
        );
        command.action(async (names, options) =>
          actionOptions.execute(provider, names, options)
        );
      }
      if (actionOptions.executeInstance) {
        actionOptions.prepareCommand?.(command);
        command.option(
          `--${an}`,
          actionOptions.description,
          () => (action = an)
        );
      }
    }
  }
}

program.parse(process.argv);

function normalize(names) {
  return names.length === 0 ? ["**/*"] : names;
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
    if (actions && action) {
      const a = actions[action];
      if (a?.executeInstance) {
        await a.executeInstance(object, options);
      }
    }

    if (options.json) {
      json.push(object);
    } else {
      if (options.identifier) {
        console.log(`${object.fullName}:`);
      }
      listAttributes(object, options.attribute || type.attributes, options);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(json));
  }

  if (options.statistics && cache) {
    console.error(cache.statistics);
  }
}

function publicAttributeNames(object) {
  return [
    ...attributeIterator(
      object.attributes,
      ([k, v]) => k !== "name" && !v.private
    ).map(([k, v]) => k)
  ].flat();
}

function type(clazz, extra) {
  return {
    name: clazz.type,
    collectionName: clazz.collectionName,
    attributes: ["fullName", ...publicAttributeNames(clazz)],
    actions: {
      update: {
        description: `update ${clazz.type} attributes`,
        executeInstance: async object => {
          Object.assign(object, properties);
          await object.update();
        }
      },
      ...extra
    }
  };
}
