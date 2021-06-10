#!/bin/sh

source ./promises.sh

# Init the library
init_promises "strict"

readonly __dirname=$(dirname "$(readlink -f "$0")");
readonly plugin_dir=${__dirname}/plugins/;

promise_run "cd "${__dirname}" && npm install"
for item in $(ls "${plugin_dir}"); do
if [ -d "${plugin_dir}/${item}" ] ; then
  if [ -f "${plugin_dir}/${item}/package.json" ] ; then
    promise_run "cd "${plugin_dir}/${item}" && npm install"
      promise_then echo "Intall dependencies of ${item} succeeded."
  fi
fi
done

# await all promises, equivalent to: Promise.all([...])
await_promises