var request = require('hyperquest')
var pipe = require('pump')
var ndjson = require('ndjson')
var Transform = require('stream').Transform
var Writable = require('stream').Writable
var semver = require('semver')
var comandante = require('comandante')
var fs = require('fs')
var join = require('path').join

module.exports = deploy

var url = 'https://skimdb.npmjs.com/registry/_changes' +
  '?heartbeat=30000' +
  '&include_docs=true' +
  '&feed=continuous' +
  '&since=now'

// NEXT:
// signal to restart process
// verify git installed version matches npm version
// start process in the first place
// check for updates on boot

function deploy (dir) {
  var pkg = require(join(dir, 'package.json'))
  var deps = pkg.dependencies || {}
  var depNames = Object.keys(deps)
  if (!depNames.length) return

  pipe(
    request(url),
    ndjson.parse(),
    filter(deps),
    test(),
    upgrade(dir)
  )
}

function run (cmd, args, opts, cb) {
  comandante(cmd, args, opts)
  .on('error', function (err) {
    console.error(err)
    console.error('Abort!')
    cb(err)
  })
  .on('exit', function (code) {
    if (code !== 0) return
    cb()
  })
}

function test () {
  function transform (pkg, _, cb) {
    console.log('Testing candidate %s@%s', pkg.name, pkg.version)
    var dir = '/tmp/test-' + pkg.name + '-' + pkg.version

    console.log('Cloning %s@%s into %s', pkg.name, pkg.version, dir)
    run('git', ['clone', pkg.repo, dir], {}, function (err) {
      if (err) return cb()

      console.log('Running tests of %s@%s', pkg.name, pkg.version)
      run('npm', ['test'], { cwd: dir }, function (err) {
        if (err) return cb()
        cb(null, pkg)
      })
    })
  }
  return Transform({
    objectMode: true,
    transform: transform
  })
}

function upgrade (dir) {
  function write (pkg, _, cb) {
    console.log('Upgrade to %s@%s', pkg.name, pkg.version)
    run('npm', ['install', pkg.name + '@' + pkg.version], { cwd: dir }, function (err) {
      if (err) return cb()
      console.log('Installed!')
      cb()
    })
  }
  return Writable({
    objectMode: true,
    write: write
  })
}

function filter (deps) {
  function transform (row, _, cb) {
    if (/^_design\//.test(row.id)) return cb()
    var doc = row.doc
    if (!doc) return cb()

    var name = doc.name
    var latest = doc['dist-tags'] && doc['dist-tags'].latest
    var repo = (doc.repository && doc.repository.url || '')
      .replace(/^git\+/, '')

    if (!deps[doc.name]) return cb()
    if (!semver.satisfies(latest, deps[name])) {
      console.error('Skipping %s@%s (out of range %s)', name, latest, deps[name])
      return cb()
    }
    if (!repo || doc.repository.type != 'git') {
      console.error('Skipping %s@%s (invalid repository)', name, latest)
      return cb()
    }

    cb(null, { name: name, version: latest, repo: repo })
  }
  return Transform({
    objectMode: true,
    transform: transform
  })
}
