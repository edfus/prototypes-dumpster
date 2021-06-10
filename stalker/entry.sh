#!/bin/sh

readonly log_stdout=${STALKER_LOG_PATH:-/log/stdout.log}
readonly log_stderr=${STALKER_LOG_ERR_PATH:-/log/stderr.log}

# redirect stdout and stderr to files
exec >>${log_stdout}
exec 2>${log_stderr}

# now run the requested CMD without forking a subprocess
exec "$@"
