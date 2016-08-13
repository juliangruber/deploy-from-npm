var request = require('hyperquest')
var pipe = require('pump')
var ndjson = require('ndjson')
var Transform = require('stream').Transform
var Writable = require('stream').Writable
var semver = require('semver')
var comandante = require('comandante')
var fs = require('fs')
var join = require('path').join
var assert = require('assert')
var RegClient = require('silent-npm-registry-client')

module.exports = deploy

var url = 'https://skimdb.npmjs.com/registry/_changes' +
  '?heartbeat=30000' +
  '&include_docs=true' +
  '&feed=continuous' +
  '&since=now'

var client = new RegClient({
  cache: join('/tmp/', Math.random().toString(16).slice(2))
})

// NEXT:
// verify git installed version matches npm version

function deploy (dir, reload) {
  assert(dir, 'dir required')
  assert(reload, 'reload fn required')
  var pkg = require(join(dir, 'package.json'))
  var deps = pkg.dependencies || {}
  var depNames = Object.keys(deps)
  if (!depNames.length) return

  var t = test()
  var pipeline = pipe(
    request(url),
    ndjson.parse(),
    filter(deps),
    t,
    upgrade(dir),
    signal(reload)
  )

  var i = 0
  function next () {
    var depName = depNames[i++]
    if (!depName) return
    client.get('https://registry.npmjs.org/' + depName, {}, function (err, pkg) {
      if (err) return pipeline.emit('error', err)
      var latest = pkg['dist-tags'] && pkg['dist-tags'].latest
      if (!latest) return next()
      var pkgPath = join(dir, 'node_modules', depName, 'package.json')
      fs.readFile(pkgPath, function (err, raw) {
        if (err) {
          pipeline.emit('error', err)
          return next()
        }
        var json = JSON.parse(raw)
        if (json.version === latest) {
          console.log('OK %s@%s', depName, latest)
          return next()
        }
        var repo = getRepo(pkg)
        if (!repo) {
          console.error('Skipping %s@%s (invalid repository)', depName, latest)
          return next()
        }
        t.write({
          name: depName,
          version: latest,
          repo: repo
        })
        next()
      })
    })
  }
  next()

  return pipeline
}

function filter (deps) {
  function transform (row, _, cb) {
    if (/^_design\//.test(row.id)) return cb()
    var doc = row.doc
    if (!doc) return cb()

    var name = doc.name
    var latest = doc['dist-tags'] && doc['dist-tags'].latest
    var repo = getRepo(doc)

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
  function transform (pkg, _, cb) {
    console.log('Upgrade to %s@%s', pkg.name, pkg.version)
    run('npm', ['install', pkg.name + '@' + pkg.version], { cwd: dir }, function (err) {
      if (err) return cb()
      console.log('Installed!')
      cb(null, dir)
    })
  }
  return Transform({
    objectMode: true,
    transform: transform
  })
}

function signal (reload) {
  function write (dir, _, cb) {
    console.log('Reload %s', dir)
    reload(function (err) {
      if (err) return cb(err)
      console.log('Reloaded!')
      cb()
    })
  }
  return Writable({
    objectMode: true,
    write: write
  })
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

function getRepo (pkg) {
  return (pkg.repository && pkg.repository.url || '')
    .replace(/^git\+/, '')
}
