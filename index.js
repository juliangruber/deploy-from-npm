var request = require('hyperquest')
var pipe = require('pump')
var ndjson = require('ndjson')
var Transform = require('stream').Transform
var Writable = require('stream').Writable
var semver = require('semver')
var comandante = require('comandante')
var fs = require('fs')
var join = require('path').join
var resolve = require('path').resolve
var assert = require('assert')
var RegClient = require('silent-npm-registry-client')
var rmrf = require('rimraf')
var mutex = require('mutexify')

module.exports = deploy

var url = 'https://skimdb.npmjs.com/registry/_changes' +
  '?heartbeat=30000' +
  '&include_docs=true' +
  '&feed=continuous' +
  '&since=now'

// NEXT:
// verify git installed version matches npm version

function deploy (dir, reload) {
  assert(dir, 'dir required')
  assert(reload, 'reload fn required')
  var pkg = require(resolve(join(dir, 'package.json')))
  var deps = pkg.dependencies || {}
  var depNames = Object.keys(deps)
  if (!depNames.length) return
  var upgradeLock = mutex()

  var pipeline = pipe(
    request(url),
    ndjson.parse(),
    filterStream(deps),
    testStream(),
    upgradeStream(dir, upgradeLock),
    signalStream(reload)
  )

  var toUpgrade = []
  var i = 0
  function checkAndTest () {
    var depName = depNames[i++]
    if (!depName) return upgradeSelected(toUpgrade)

    var client = new RegClient()
    client.get('https://registry.npmjs.org/' + depName, {}, function (err, doc) {
      if (err) return pipeline.emit('error', err)
      var latest = doc['dist-tags'] && doc['dist-tags'].latest
      if (!latest) return checkAndTest()
      var pkgPath = join(dir, 'node_modules', depName, 'package.json')
      fs.readFile(pkgPath, function (err, raw) {
        if (!err) {
          var json = JSON.parse(raw)
          if (json.version === latest) {
            console.log('OK %s@%s', depName, latest)
            return checkAndTest()
          }
        }
        if (!semver.satisfies(latest, deps[depName])) {
          console.error('Skipping %s@%s (out of range %s)', depName, latest, deps[depName])
          return checkAndTest()
        }
        var repo = getRepo(doc)
        if (!repo) {
          console.error('Skipping %s@%s (invalid repository)', depName, latest)
          return checkAndTest()
        }
        var pkg = {
          name: depName,
          version: latest,
          repo: repo
        }
        test(pkg, function (err) {
          if (err) return checkAndTest()
          toUpgrade.push(pkg)
          checkAndTest()
        })
      })
    })
  }

  function upgradeSelected (toUpgrade) {
    if (!toUpgrade.length) {
      console.log('All OK')
      done()
      return
    }
    upgrade(upgradeLock, dir, toUpgrade, function (err) {
      if (err) return
      console.log('Upgraded all!')
      done()
    })
  }

  function done () {
    signal(dir, reload, true)
  }

  checkAndTest()

  return pipeline
}

function filterStream (deps) {
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
    if (!repo || doc.repository.type !== 'git') {
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

function test (pkg, cb) {
  console.log('Testing candidate %s@%s', pkg.name, pkg.version)
  var dir = '/tmp/test-' + pkg.name + '-' + pkg.version
  rmrf(dir, function (err) {
    if (err) return cb(err)

    console.log('Cloning %s@%s into %s', pkg.name, pkg.version, dir)
    run('git', ['clone', pkg.repo, dir], {}, function (err) {
      if (err) return cb(err)

      console.log('Installing dependencies of %s@%s', pkg.name, pkg.version)
      run('npm', ['install'], { cwd: dir }, function (err) {
        if (err) return cb(err)

        console.log('Running tests of %s@%s', pkg.name, pkg.version)
        run('npm', ['test'], { cwd: dir }, function (err) {
          if (err) return cb(err)
          cb(null, pkg)
        })
      })
    })
  })
}

function testStream () {
  return Transform({
    objectMode: true,
    transform: function (pkg, _, cb) {
      test(pkg, function (err, pkg) {
        if (err) cb()
        else cb(null, pkg)
      })
    }
  })
}

function upgrade (lock, dir, pkgs, cb) {
  lock(function (release) {
    var args = ['install']
    pkgs.forEach(function (pkg) {
      console.log('Upgrade to %s@%s', pkg.name, pkg.version)
      args.push(pkg.name + '@' + pkg.version)
    })
    run('npm', args, { cwd: dir }, function (err) {
      release()
      if (err) return cb(err)
      pkgs.forEach(function (pkg) {
        console.log('Installed %s@%s', pkg.name, pkg.version)
      })
      cb(null, dir)
    })
  })
}

function upgradeStream (dir, upgradeLock) {
  function transform (pkg, _, cb) {
    upgrade(upgradeLock, dir, [pkg], function (err, dir) {
      if (err) cb()
      else cb(null, dir)
    })
  }
  return Transform({
    objectMode: true,
    transform: transform
  })
}

function signal (dir, reload, initial, cb) {
  cb = cb || function () {}
  console.log('Reload %s', dir)
  reload(initial, function (err) {
    if (err) return cb(err)
    console.log('Reloaded!')
    cb()
  })
}

function signalStream (reload) {
  function write (dir, _, cb) {
    signal(dir, reload, false, cb)
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
