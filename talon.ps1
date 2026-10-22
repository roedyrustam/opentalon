$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$scriptDir\packages\cli\dist\index.js" @args
