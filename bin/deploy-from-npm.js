#!/usr/bin/env node
process.title = 'deploy-from-npm'

'use strict'

var deploy = require('..')
var exec = require('child_process').exec

var dir = process.argv[2]
var reloadCmd = process.argv[3]

if (!dir || !reloadCmd) {
  console.error()
  console.error('Usage:')
  console.error()
  console.error('  $ deploy-from-npm DIR RELOAD')
  console.error()
  console.error('Example:')
  console.error()
  console.error('  $ deploy-from-npm /srv/my-service "kill $server-pid"')
  console.error()
  process.exit(1)
}

deploy(dir, function (cb) {
  exec(reloadCmd, cb)
})
