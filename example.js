var join = require('path').join

var dir = join(__dirname, 'test', 'fixture')
var reload = function (initial, cb) {
  console.log('initial?', initial)
  setTimeout(cb, 2000)
}
require('.')(dir, reload).on('error', console.error)
