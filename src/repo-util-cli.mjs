#!/usr/bin/env node

import {readFileSync } from "fs";
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
  .option("--list-providers", "list providers with options and exit")
  .option("-d, --define <key=value>", "set option", values =>
    asArray(values).forEach(value => {
      const [k, v] = value.split(/=/);
      setProperty(properties, k, v);
    })
  )
  .arguments(
    "[branches...]",
    "command to be applied to the branches"
  )
  .action(async repos => {
    const provider = await AggregationProvider.initialize(
      [],
      properties,
      process.env
    );

    for await (const branch of provider.branches(repos)) {
      console.log(branch.fullName);
    }
  })
  .parse(process.argv);
