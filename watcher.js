var fs = require('fs')
var path = require('path')
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('enchilada:watch');

var emitter = new EventEmitter
var listeners = {}

module.exports = function onChange(filename, callback) {
    filename = path.normalize(filename)

    // First listener on filename
    if (!listeners[filename]) {
        listeners[filename] = function(curr, prev) {
            if (!curr || !prev || curr.mtime !== prev.mtime) {
                emitter.emit(filename, curr, prev)
            }
        }

        debug('Watching %s', filename)

        // Watch the file
        fs.watchFile(filename, {
            persistent:false,
            interval: 1007
        }, listeners[filename])
    }

    // Bind callback for changes on file
    emitter.on(filename, callback)

    // Pseudo-FS.watcher interface
    return {
        close: function() {
            emitter.removeListener(filename, callback)
            if (emitter.listeners(filename).length === 0) {
                debug('Unwatching %s', filename)
                fs.unwatchFile(filename, listeners[filename])
                delete listeners[filename]
            }
        }
    }
}
