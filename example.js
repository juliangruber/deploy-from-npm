var join = require('path').join

var dir = join(__dirname, 'test', 'fixture')
var reload = function (cb) {
  setTimeout(cb, 2000)
}
require('.')(dir, reload).on('error', console.error)
